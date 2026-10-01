import {createNoise2D} from 'simplex-noise';
import {generateMacro} from './upstream.ts';
import {settings, type Settings, type Terrain, type Route, type Landmark, type Placement} from './types.ts';
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
  const routes=makeRoutes(s);
  const landmarks:Landmark[]=[
    {id:'hearth_core',kind:'settlement',name:'Hearthfall Basin',x:0,z:76,y:8,radius:22},
    {id:'relay_garden',kind:'relay',name:'Glasswood Relay',x:-84,z:8,y:14,radius:7},
    {id:'relay_scar',kind:'relay',name:'Scar Relay',x:80,z:-16,y:24,radius:7},
    {id:'relay_choir',kind:'relay',name:'Silent Choir',x:4,z:-102,y:36,radius:10},
  ].map(l=>({...l,x:l.x*s,z:l.z*s,y:l.y*s,radius:l.radius*Math.sqrt(s)}));
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
    const grading=p.walkability*(1-rim);
    h=h*(1-grading)+gentle*grading;
    const road=routeAt(routes,x*s,z*s),roadWeight=1-smooth(road.width*.55,road.width*.55+5*s,road.distance);
    h=h*s*(1-roadWeight)+road.height*roadWeight;
    routeMask[k]=road.distance<road.width*.5?255:0;
    for(const l of landmarks) {
      const w=1-smooth(l.radius,l.radius+10*s,Math.hypot(x*s-l.x,z*s-l.z));
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
  const slopes=new Float32Array(total),normals=new Float32Array(total*3),colors=new Float32Array(total*3),walkable=new Uint8Array(total),buildable=new Uint8Array(total);
  const palette=[[.52,.44,.57],[.20,.39,.40],[.51,.28,.20],[.66,.64,.71]];
  let minHeight=Infinity,maxHeight=-Infinity,walkCount=0,buildCount=0;
  for(let j=0;j<n;j++) for(let i=0;i<n;i++) {
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
    const objective=landmarks.some(a=>a.kind==='relay'&&Math.hypot(x-a.x,z-a.z)<a.radius+2);
    buildable[k]=reserve&&slope<5&&!routeMask[k]&&!objective?255:0;buildCount+=buildable[k]>0?1:0;
    const cliff=smooth(25,65,slope),bands=.92+.08*Math.sin(heights[k]/s*2.5),variation=.94+noise(i/n*52,j/n*52)*.06;
    for(let c=0;c<3;c++) {
      let color=0;for(let b=0;b<4;b++) color+=palette[b][c]*biomeWeights[k*4+b]/255;
      color=color*(1-cliff*.35)+[.31,.27,.36][c]*cliff*.35;
      if(routeMask[k]) color=color*.70+[.67,.59,.65][c]*.30;
      colors[k*3+c]=color*bands*variation;
    }
    minHeight=Math.min(minHeight,heights[k]);maxHeight=Math.max(maxHeight,heights[k]);
  }
  const terrain:Terrain={settings:p,heights,moisture,biomeWeights,biomeIds,slopes,walkable,buildable,routeMask,colors,normals,routes,landmarks,placements:[],stats:{minHeight,maxHeight,walkablePercent:100*walkCount/total,buildablePercent:100*buildCount/total,triangles:2*(n-1)**2,graphRegions:macro.regions,generationMs:0}};
  terrain.placements=scatter(terrain);terrain.stats.generationMs=performance.now()-start;
  return terrain;
}
function scatter(t:Terrain):Placement[] {
  const rng=random(t.settings.seed+405),items:Placement[]=[],n=t.settings.resolution,world=t.settings.worldSize;
  const count=Math.round(5500*t.settings.vegetation),clear=Math.max(4,world/160),buckets=new Map<string,VecPoint[]>();
  type VecPoint=[number,number];
  for(let attempt=0;attempt<count*6&&items.length<count;attempt++) {
    const x=(rng()-.5)*world*.94,z=(rng()-.5)*world*.94;
    const i=Math.round((x/world+.5)*(n-1)),j=Math.round((z/world+.5)*(n-1)),k=j*n+i,b=t.biomeIds[k];
    if(t.slopes[k]>38||t.routeMask[k]||routeAt(t.routes,x,z).distance<Math.max(6,world/100)) continue;
    if(t.landmarks.some(l=>Math.hypot(x-l.x,z-l.z)<l.radius+6)) continue;
    const gx=Math.floor(x/clear),gz=Math.floor(z/clear);let near=false;
    for(let a=-1;a<=1;a++) for(let b=-1;b<=1;b++) for(const q of buckets.get(`${gx+a},${gz+b}`)||[]) if(Math.hypot(x-q[0],z-q[1])<clear) near=true;
    if(near) continue;
    const key=`${gx},${gz}`;if(!buckets.has(key)) buckets.set(key,[]);buckets.get(key)!.push([x,z]);
    const v=rng();let kind:Placement['kind']=b===1?(v<.66?'crystal_tree':v<.83?'mooncap':'crystal'):b===2?(v<.15?'vent':v<.28?'crystal':'rock'):b===3?(v<.32?'monolith':'rock'):(v<.14?'mooncap':'rock');
    const scale=(.65+rng()*1.2)*Math.sqrt(world/256);
    items.push({id:`${kind}_${items.length}`,kind,biome:b,x,y:heightAt(t,x,z),z,scale,yaw:rng()*Math.PI*2});
  }
  return items;
}
