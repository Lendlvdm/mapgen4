import {createNoise2D} from 'simplex-noise';
import {generateMacro} from './upstream.ts';
import {settings, type Settings, type Terrain, type Route, type Landmark, type Placement, type Bounds} from './types.ts';
export const clamp=(x:number,a=0,b=1)=>Math.max(a,Math.min(b,x));
export const smooth=(a:number,b:number,x:number)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
export function random(seed:number) {let a=seed>>>0;return ()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
export function sample(a:Float32Array,n:number,u:number,v:number) {
  const x=clamp(u)*(n-1),z=clamp(v)*(n-1),ix=Math.min(n-2,Math.floor(x)),iz=Math.min(n-2,Math.floor(z)),fx=x-ix,fz=z-iz;
  return (a[iz*n+ix]*(1-fx)+a[iz*n+ix+1]*fx)*(1-fz)+(a[(iz+1)*n+ix]*(1-fx)+a[(iz+1)*n+ix+1]*fx)*fz;
}
export function heightAt(t:Terrain,x:number,z:number) {return sample(t.heights,t.settings.resolution,x/t.settings.worldSize+.5,z/t.settings.worldSize+.5);}
export function makeRoutes(s:number):Route[] {
  const width=Math.max(6,2*s);
  const routes:[string,string,[number,number,number][]][]=[
    ['basin_garden','open',[[0,76,8],[-30,70,9.5],[-68,52,11.5],[-94,28,13],[-84,8,14]]],
    ['garden_scar','relay_garden',[[-84,8,14],[-60,-6,15],[-34,20,14],[8,26,14],[52,14,18],[80,-16,24]]],
    ['scar_choir','relay_scar',[[80,-16,24],[102,-44,27],[76,-74,30],[42,-84,33],[4,-102,36]]],
    ['garden_return','relay_garden',[[-84,8,14],[-54,40,12],[0,76,8]]],
    ['scar_return','relay_scar',[[80,-16,24],[70,28,18],[36,52,11],[0,76,8]]],
    ['choir_return','relay_choir',[[4,-102,36],[-22,-66,27],[-8,-24,20],[8,26,14],[0,76,8]]],
  ];
  return routes.map(([id,gate,points])=>({id,gate,width,points:points.map(([x,z,y])=>[x*s,z*s,y*s])}));
}
export function routeAt(routes:Route[],x:number,z:number) {
  let distance=Infinity,height=0,width=6;
  for(const route of routes) for(let i=1;i<route.points.length;i++) {
    const a=route.points[i-1],b=route.points[i],dx=b[0]-a[0],dz=b[1]-a[1];
    const t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz));
    const d=Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);
    if(d<distance) {distance=d;height=a[2]+t*(b[2]-a[2]);width=route.width;}
  }
  return {distance,height,width};
}
export function generateTerrain(input:Partial<Settings>={}):Terrain {
  const start=performance.now(),p=settings(input),n=p.resolution,s=p.worldSize/256,step=p.worldSize/(n-1),total=n*n;
  const noise=createNoise2D(random(p.seed)),macro=generateMacro(p.seed,p.moisture);
  const heights=new Float32Array(total),moisture=new Float32Array(total),biomeWeights=new Uint8Array(total*4),biomeIds=new Uint8Array(total),routeMask=new Uint8Array(total);
  let routes=makeRoutes(s);
  const landmarks:Landmark[]=[
    {id:'hearth_core',kind:'settlement',name:'Hearthfall Basin',x:0,z:76,y:8,radius:22},
    {id:'relay_garden',kind:'relay',name:'Glasswood Relay',x:-84,z:8,y:14,radius:7},
    {id:'relay_scar',kind:'relay',name:'Scar Relay',x:80,z:-16,y:24,radius:7},
    {id:'relay_choir',kind:'relay',name:'Silent Choir',x:4,z:-102,y:36,radius:10},
  ].map(l=>({...l,x:l.x*s,z:l.z*s,y:l.y*s,radius:l.radius*Math.sqrt(s)}));
  if(p.generation===2) {
    for(const l of landmarks)l.radius=Math.max(l.radius,step*3);
    routes=naturalRoutes(routes,p,landmarks);
    const rng=random(p.seed+7193);
    for(let c=0;c<2;c++) {
      let x=0,z=0;
      for(let attempt=0;attempt<100;attempt++) {
        x=(rng()-.5)*150*s;z=(rng()-.5)*145*s;
        if(landmarks.every(l=>Math.hypot(x-l.x,z-l.z)>l.radius+22*s))break;
      }
      const radius=Math.max(7*Math.sqrt(s),step*2),y=gentleHeight(x/s,z/s)*s;
      const camp:Landmark={id:`camp_${c}`,kind:'camp',faction:c===0?'neutral':'enemy',name:c===0?'Wayfarer camp':'Raider camp',x,z,y,radius};
      const closest=routes.flatMap(r=>r.points).reduce((a,b)=>Math.hypot(a[0]-x,a[1]-z)<Math.hypot(b[0]-x,b[1]-z)?a:b);
      routes.push(...naturalRoutes([{id:`camp_approach_${c}`,gate:'open',width:Math.max(6,step*6,2*s),points:[closest,[x,z,y]]}],p,landmarks));
      landmarks.push(camp);
    }
  }
  const protectedMask=new Uint8Array(total);
  const roadField=p.generation===2?rasterRoutes(routes,p):null;
  for(let j=0;j<n;j++) for(let i=0;i<n;i++) {
    const k=j*n+i,u=i/(n-1),v=j/(n-1),x=(u-.5)*256,z=(v-.5)*256;
    const nx=x/128,nz=z/128,macroH=sample(macro.height,macro.size,u,v),rain=sample(macro.rain,macro.size,u,v),flow=sample(macro.drainage,macro.size,u,v);
    const warp=noise(nx*3+9,nz*3+6)*6;
    const rim=smooth(.67,.99,Math.max(Math.abs(nx),Math.abs(nz)));
    const ridge=Math.abs(noise(nx*4,nz*4));
    let raw=11+Math.max(0,-z)*.13+rim*(30+ridge*22)+noise(nx*2,nz*2)*5+ridge*9+macroH*14;
    // Two protected basins surrounded by a sequence of broad terraces.
    raw-=9*Math.exp(-((x+72)**2/1700+(z-12)**2/4200));
    raw+=9*Math.exp(-((x-82)**2/1600+(z+10)**2/3300));
    const level=7.5,band=raw/level,fract=band-Math.floor(band);
    const terraced=(Math.floor(band)+smooth(.70,.91,fract))*level;
    let h=(raw*(1-p.terrace)+terraced*p.terrace)*p.relief;
    h+=(noise(nx*34,nz*34)*.52+noise(nx*73+2,nz*73)*.16)*p.detail;
    // Cut branching ravines between traversable shelves, then repair authored routes below.
    const channel=Math.abs(noise(nx*3.1+3,nz*3.1-4)+.22*noise(nx*8,nz*8));
    h-=((1-smooth(.022,.11,channel))*10+Math.min(2,flow*.35))*p.terrace;
    // Expand gentle inland ground without changing the walkability slope limit.
    // Zero preserves old recipes exactly; the perimeter retains its original cliffs.
    const gentle=8+(76-z)*.145+5*smooth(0,85,x)
      -4*Math.exp(-((x+84)**2+(z-8)**2)/2400);
    const spine=Math.pow(1-Math.min(1,Math.abs(noise(nx*2.1+17,nz*2.1-8))),5);
    // Seeded ridge spines cross the interior; walkability preserves their crests.
    if(p.generation===2)h+=spine*(18+10*ridge)*p.relief;
    const grading=p.walkability*(1-rim)*(p.generation===2?1-spine*.85:1);
    h=h*(1-grading)+gentle*grading;
    const road=roadField?{distance:roadField.distance[k],height:0,width:roadField.width[k]}:routeAt(routes,x*s,z*s),roadWeight=1-smooth(road.width*.55,road.width*.55+5*s,road.distance);
    if(p.generation===2)road.height=gentleHeight(x,z)*s;
    protectedMask[k]=road.distance<road.width*.55?255:0;
    h=h*s*(1-roadWeight)+road.height*roadWeight;
    routeMask[k]=road.distance<road.width*.5?255:0;
    for(const l of landmarks) {
      const distance=Math.hypot(x*s-l.x,z*s-l.z);
      const w=1-smooth(l.radius,l.radius+10*s,distance);
      if(distance<l.radius+step)protectedMask[k]=255;
      h=h*(1-w)+l.y*w;
    }
    heights[k]=h;
    const glass=(1-smooth(-50+warp,-16+warp,x))*(1-smooth(65,108,z));
    const scar=smooth(18+warp,60+warp,x)*(1-smooth(55,100,z));
    const choir=1-smooth(-76+warp,-42+warp,z);
    let weights=[Math.max(.025,1-Math.max(glass,scar,choir)),glass*(1-choir*.8),scar*(1-choir*.8),choir];
    const sum=weights.reduce((a,b)=>a+b,0);weights=weights.map(w=>w/sum);
    // Largest-remainder normalization means every blend pixel sums to exactly 255.
    const bytes=weights.map(w=>Math.floor(w*255));let rem=255-bytes.reduce((a,b)=>a+b,0);
    const order=[0,1,2,3].sort((a,b)=>(weights[b]*255-bytes[b])-(weights[a]*255-bytes[a]));
    for(let q=0;q<rem;q++) bytes[order[q]]++;
    biomeWeights.set(bytes,k*4);biomeIds[k]=weights.indexOf(Math.max(...weights));
    moisture[k]=clamp(rain*.6+glass*.35+p.moisture*.2-scar*.25);
  }
  const terrain:Terrain={settings:p,heights,moisture,biomeWeights,biomeIds,routeMask,routes,landmarks,protectedMask,accessMask:new Uint8Array(total),
    edits:[],baseHeights:heights.slice(),pathPaint:new Float32Array(total),buildPaint:new Float32Array(total),dressing:new Float32Array(total).fill(p.vegetation),
    slopes:new Float32Array(total),normals:new Float32Array(total*3),colors:new Float32Array(total*3),walkable:new Uint8Array(total),buildable:new Uint8Array(total),placements:[],
    stats:{minHeight:0,maxHeight:0,walkablePercent:0,buildablePercent:0,triangles:2*(n-1)**2,graphRegions:macro.regions,generationMs:0}};
  if(p.generation===2)for(const route of routes)for(const point of route.points)point[2]=heightAt(terrain,point[0],point[1]);
  refreshTerrain(terrain);protectAccess(terrain,p.generation===2);terrain.placements=scatter(terrain);terrain.stats.generationMs=performance.now()-start;
  return terrain;
}
export function refreshTerrain(t:Terrain,bounds:Bounds={x0:0,z0:0,x1:t.settings.resolution-1,z1:t.settings.resolution-1}) {
  const {settings:p,heights,slopes,normals,colors,walkable,buildable,routeMask,landmarks,biomeWeights}=t,n=p.resolution,s=p.worldSize/256,step=p.worldSize/(n-1),total=n*n;
  const noise=createNoise2D(random(p.seed));
  const palette=[[.52,.44,.57],[.20,.39,.40],[.51,.28,.20],[.66,.64,.71]];
  let minHeight=Infinity,maxHeight=-Infinity,walkCount=0,buildCount=0;
  for(let j=bounds.z0;j<=bounds.z1;j++) for(let i=bounds.x0;i<=bounds.x1;i++) {
    const k=j*n+i,left=Math.max(0,i-1),right=Math.min(n-1,i+1),up=Math.max(0,j-1),down=Math.min(n-1,j+1);
    const dx=(heights[j*n+right]-heights[j*n+left])/((right-left)*step),dz=(heights[down*n+i]-heights[up*n+i])/((down-up)*step),length=Math.hypot(dx,1,dz);
    normals.set([-dx/length,1/length,-dz/length],k*3);
    // Conservative incident-edge slope used by the exported traversability mask.
    let grade=0;
    for(const [a,b] of [[i-1,j],[i+1,j],[i,j-1],[i,j+1],[i-1,j-1],[i+1,j+1],[i-1,j+1],[i+1,j-1]]) if(a>=0&&a<n&&b>=0&&b<n) grade=Math.max(grade,Math.abs(heights[b*n+a]-heights[k])/(Math.hypot(a-i,b-j)*step));
    const slope=Math.atan(grade)*180/Math.PI;slopes[k]=slope;
    const x=(i/(n-1)-.5)*p.worldSize,z=(j/(n-1)-.5)*p.worldSize;
    const border=Math.max(Math.abs(x),Math.abs(z))<p.worldSize*.47;
    walkable[k]=slope<=30&&border?255:0;walkCount+=walkable[k]>0?1:0;
    const l=landmarks[0],reserve=Math.abs(x-l.x)<34*Math.sqrt(s)&&Math.abs(z-l.z)<30*Math.sqrt(s);
    const objective=landmarks.some(a=>a.kind!=='settlement'&&Math.hypot(x-a.x,z-a.z)<a.radius+2);
    buildable[k]=(reserve||t.buildPaint[k]>.25)&&slope<5&&!routeMask[k]&&t.pathPaint[k]<=.25&&!objective?255:0;buildCount+=buildable[k]>0?1:0;
    const cliff=smooth(25,65,slope),bands=.92+.08*Math.sin(heights[k]/s*2.5),variation=.94+noise(i/n*52,j/n*52)*.06;
    for(let c=0;c<3;c++) {
      let color=0;for(let b=0;b<4;b++) color+=palette[b][c]*biomeWeights[k*4+b]/255;
      color=color*(1-cliff*.35)+[.31,.27,.36][c]*cliff*.35;
      if(routeMask[k]||t.pathPaint[k]>.25) color=color*.70+[.67,.59,.65][c]*.30;
      colors[k*3+c]=color*bands*variation;
    }
    minHeight=Math.min(minHeight,heights[k]);maxHeight=Math.max(maxHeight,heights[k]);
  }
  if(bounds.x0===0&&bounds.z0===0&&bounds.x1===n-1&&bounds.z1===n-1)Object.assign(t.stats,{minHeight,maxHeight,walkablePercent:100*walkCount/total,buildablePercent:100*buildCount/total});
}
export function finishTerrain(t:Terrain){
  refreshTerrain(t);t.placements=scatter(t);
  if(t.edits.some(e=>e.feature==='blend'&&e.blendPaths))for(const r of t.routes)for(const point of r.points)point[2]=heightAt(t,point[0],point[1]);
}
export function gentleHeight(x:number,z:number){return 8+(76-z)*.145+5*smooth(0,85,x)-4*Math.exp(-((x+84)**2+(z-8)**2)/2400);}
function naturalRoutes(routes:Route[],p:Settings,landmarks:Landmark[]):Route[] {
  const s=p.worldSize/256,rng=random(p.seed+817),step=p.worldSize/(p.resolution-1);
  return routes.map(route=>{
    const source=route.points.map((q,i)=>i===0||i===route.points.length-1?[...q]:[q[0]+(rng()-.5)*12*s,q[1]+(rng()-.5)*12*s,q[2]]) as [number,number,number][];
    if(source.length===2){const a=source[0],b=source[1],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),bend=(rng()-.5)*length*.35;source.splice(1,0,[(a[0]+b[0])/2-dz/length*bend,(a[1]+b[1])/2+dx/length*bend,0]);}
    const points:Route['points']=[];
    const curve=(a:number,b:number,c:number,d:number,t:number)=>.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
    for(let i=0;i<source.length-1;i++) {
      const a=source[Math.max(0,i-1)],b=source[i],c=source[i+1],d=source[Math.min(source.length-1,i+2)];
      const segments=Math.max(4,Math.ceil(Math.hypot(c[0]-b[0],c[1]-b[1])/(5*s)));
      for(let j=0;j<segments;j++){const x=curve(a[0],b[0],c[0],d[0],j/segments),z=curve(a[1],b[1],c[1],d[1],j/segments);points.push([x,z,gentleHeight(x/s,z/s)*s]);}
    }
    const last=source[source.length-1];points.push([last[0],last[1],gentleHeight(last[0]/s,last[1]/s)*s]);
    return {...route,width:Math.max(route.width,step*6),points};
  });
}
export function scatter(t:Terrain):Placement[] {
  const rng=random(t.settings.seed+405),items:Placement[]=[],n=t.settings.resolution,world=t.settings.worldSize;
  const localDensity=t.settings.generation===2||t.edits.some(e=>e.feature==='dressing');
  const count=localDensity?5500:Math.round(5500*t.settings.vegetation),clear=Math.max(4,world/160),buckets=new Map<string,VecPoint[]>();
  type VecPoint=[number,number];
  for(let attempt=0;attempt<count*6&&items.length<count;attempt++) {
    // Stable candidates keep a local brush edit from reshuffling the entire world.
    const candidate=localDensity?random(t.settings.seed+attempt*104729+405):rng;
    const x=(candidate()-.5)*world*.94,z=(candidate()-.5)*world*.94;
    const i=Math.round((x/world+.5)*(n-1)),j=Math.round((z/world+.5)*(n-1)),k=j*n+i,b=t.biomeIds[k];
    if(localDensity&&random(t.settings.seed+attempt*7919)()>t.dressing[k])continue;
    if((t.settings.generation===2&&t.protectedMask[k])||t.slopes[k]>38||t.pathPaint[k]>.15||t.buildPaint[k]>.15||t.routeMask[k]||routeAt(t.routes,x,z).distance<Math.max(6,world/100)) continue;
    if(t.landmarks.some(l=>Math.hypot(x-l.x,z-l.z)<l.radius+6)) continue;
    const gx=Math.floor(x/clear),gz=Math.floor(z/clear);let near=false;
    for(let a=-1;a<=1;a++) for(let b=-1;b<=1;b++) for(const q of buckets.get(`${gx+a},${gz+b}`)||[]) if(Math.hypot(x-q[0],z-q[1])<clear) near=true;
    if(near) continue;
    const key=`${gx},${gz}`;if(!buckets.has(key)) buckets.set(key,[]);buckets.get(key)!.push([x,z]);
    const v=candidate();let kind:Placement['kind']=b===1?(v<.66?'crystal_tree':v<.83?'mooncap':'crystal'):b===2?(v<.15?'vent':v<.28?'crystal':'rock'):b===3?(v<.32?'monolith':'rock'):(v<.14?'mooncap':'rock');
    const scale=(.65+candidate()*1.2)*Math.sqrt(world/256);
    items.push({id:`${kind}_${localDensity?attempt:items.length}`,kind,biome:b,x,y:heightAt(t,x,z),z,scale,yaw:candidate()*Math.PI*2});
  }
  return items;
}

function rasterRoutes(routes:Route[],p:Settings){
  const n=p.resolution,step=p.worldSize/(n-1),half=p.worldSize/2;
  const distance=new Float32Array(n*n).fill(Infinity),width=new Float32Array(n*n).fill(6);
  for(const route of routes)for(let i=1;i<route.points.length;i++) {
    const a=route.points[i-1],b=route.points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz,pad=route.width*.55+5*p.worldSize/256;
    if(length===0)continue;
    const x0=Math.max(0,Math.floor((Math.min(a[0],b[0])-pad+half)/step)),x1=Math.min(n-1,Math.ceil((Math.max(a[0],b[0])+pad+half)/step));
    const z0=Math.max(0,Math.floor((Math.min(a[1],b[1])-pad+half)/step)),z1=Math.min(n-1,Math.ceil((Math.max(a[1],b[1])+pad+half)/step));
    for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++) {
      const wx=x*step-half-a[0],wz=z*step-half-a[1],f=clamp((wx*dx+wz*dz)/length),d=Math.hypot(wx-dx*f,wz-dz*f),k=z*n+x;
      if(d<distance[k]){distance[k]=d;width[k]=route.width;}
    }
  }
  return {distance,width};
}

// Protect an actually traversable grid chain plus its incident edges, including
// shoulders where route/clearing blends meet. This survives arbitrarily tall edits.
function protectAccess(t:Terrain,protect=true){
  const n=t.settings.resolution,size=t.settings.worldSize,cell=(l:Landmark)=>Math.round((l.z/size+.5)*(n-1))*n+Math.round((l.x/size+.5)*(n-1));
  const parent=new Int32Array(n*n).fill(-1),queue=new Int32Array(n*n),start=cell(t.landmarks[0]);let tail=1;queue[0]=start;parent[start]=start;
  for(let head=0;head<tail;head++){
    const k=queue[head],x=k%n,z=Math.floor(k/n);
    for(const [dx,dz] of [[0,-1],[1,0],[-1,0],[0,1]]){const a=x+dx,b=z+dz,q=b*n+a;if(a>=0&&a<n&&b>=0&&b<n&&parent[q]===-1&&t.walkable[q]){parent[q]=k;queue[tail++]=q;}}
  }
  for(const l of t.landmarks){
    let k=cell(l);if(parent[k]===-1){if(protect)throw new Error(`No terrain approach to ${l.name}; try a different seed or finer height samples`);continue;}
    while(true){t.accessMask[k]=255;const x=k%n,z=Math.floor(k/n);if(protect)for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const a=x+dx,b=z+dz;if(a>=0&&a<n&&b>=0&&b<n)t.protectedMask[b*n+a]=255;}if(k===start)break;k=parent[k];}
  }
}
