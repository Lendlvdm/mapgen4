import {clamp,smooth,refreshTerrain,finishTerrain} from './terrain.ts';
import {validateStroke,type Terrain,type BrushStroke,type Bounds} from './types.ts';

// Every edit uses world-space coordinates so recipes replay at another resolution.
export function applyBrush(t:Terrain,input:BrushStroke,record=true,refresh=true):Bounds {
  const e=validateStroke(input,t.settings),n=t.settings.resolution,step=t.settings.worldSize/(n-1),half=t.settings.worldSize/2;
  const x0=clamp(Math.floor((e.x-e.radius+half)/step),0,n-1),x1=clamp(Math.ceil((e.x+e.radius+half)/step),0,n-1);
  const z0=clamp(Math.floor((e.z-e.radius+half)/step),0,n-1),z1=clamp(Math.ceil((e.z+e.radius+half)/step),0,n-1);
  // Read all averages before modifying any heights, avoiding directional scan bias.
  const average=e.feature==='blend'&&e.amount>0?brushAverages(t,e,{x0,x1,z0,z1}):undefined;
  for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++) {
    const k=z*n+x,d=Math.hypot(x*step-half-e.x,z*step-half-e.z)/e.radius;
    if(d>=1)continue;
    const falloff=1-smooth(.25,1,d),a=e.amount*falloff,free=t.protectedMask[k]===0;
    if(e.feature==='cliff'&&free)t.heights[k]+=a*Math.max(2,t.settings.worldSize/128);
    const blendPath=e.feature==='blend'&&e.blendPaths;
    const clearing=blendPath&&t.landmarks.some(l=>Math.hypot(x*step-half-l.x,z*step-half-l.z)<=l.radius+step);
    if(e.feature==='blend'&&a!==0&&(free||blendPath)&&!clearing){
      const target=a>0?average!(x,z):t.baseHeights[k];
      const proposed=t.heights[k]+(target-t.heights[k])*Math.min(1,Math.abs(a)*4);
      t.heights[k]=blendPath?constrainAccess(t,x,z,proposed,step):proposed;
    }
    if((e.feature==='path'||e.feature==='build')&&free){
      const layer=e.feature==='path'?t.pathPaint:t.buildPaint;
      layer[k]=clamp(layer[k]+a);
      const target=a>0?e.target:t.baseHeights[k];
      t.heights[k]+=(target-t.heights[k])*Math.min(1,Math.abs(a)*2);
    }
    if(e.feature==='moisture')t.moisture[k]=clamp(t.moisture[k]+a);
    if(e.feature==='dressing')t.dressing[k]=clamp(t.dressing[k]+a);
    if(e.feature==='biome') {
      const w=Array.from(t.biomeWeights.subarray(k*4,k*4+4),v=>v/255),old=w[e.biome],next=clamp(old+a);
      for(let b=0;b<4;b++)w[b]=b===e.biome?next:(1-old>1e-6?w[b]/(1-old):(1/3))*(1-next);
      const bytes=w.map(v=>Math.floor(v*255)),order=[0,1,2,3].sort((a,b)=>(w[b]*255-bytes[b])-(w[a]*255-bytes[a]));
      for(let rem=255-bytes.reduce((a,b)=>a+b,0),i=0;i<rem;i++)bytes[order[i]]++;
      t.biomeWeights.set(bytes,k*4);t.biomeIds[k]=bytes.indexOf(Math.max(...bytes));
    }
  }
  const bounds={x0:Math.max(0,x0-1),z0:Math.max(0,z0-1),x1:Math.min(n-1,x1+1),z1:Math.min(n-1,z1+1)};
  if(record)t.edits.push(e);
  if(refresh)refreshTerrain(t,bounds);
  return bounds;
}
// Summed-area tables make a broad neighborhood average constant-time per sample.
// Only samples inside the circular brush contribute.
function brushAverages(t:Terrain,e:BrushStroke,b:Bounds){
  const n=t.settings.resolution,step=t.settings.worldSize/(n-1),half=t.settings.worldSize/2;
  const width=b.x1-b.x0+1,height=b.z1-b.z0+1,stride=width+1;
  const sums=new Float64Array(stride*(height+1)),counts=new Uint32Array(sums.length);
  for(let z=0;z<height;z++)for(let x=0;x<width;x++){
    const inside=Math.hypot((b.x0+x)*step-half-e.x,(b.z0+z)*step-half-e.z)<e.radius;
    const i=(z+1)*stride+x+1;
    sums[i]=(inside?t.heights[(b.z0+z)*n+b.x0+x]:0)+sums[i-1]+sums[i-stride]-sums[i-stride-1];
    counts[i]=(inside?1:0)+counts[i-1]+counts[i-stride]-counts[i-stride-1];
  }
  const reach=Math.max(1,Math.round(e.radius*.25/step));
  return (x:number,z:number)=>{
    const left=Math.max(0,x-b.x0-reach),right=Math.min(width,x-b.x0+reach+1);
    const top=Math.max(0,z-b.z0-reach),bottom=Math.min(height,z-b.z0+reach+1);
    const area=(a:Float64Array|Uint32Array)=>a[bottom*stride+right]-a[top*stride+right]-a[bottom*stride+left]+a[top*stride+left];
    const count=area(counts);return count?area(sums)/count:t.heights[z*n+x];
  };
}
// Every incident edge of the connected access chain must remain slope-passable.
// Constrain both chain vertices and their neighbors; paths can move without losing access.
function constrainAccess(t:Terrain,x:number,z:number,proposed:number,step:number){
  const n=t.settings.resolution,k=z*n+x;
  let low=-Infinity,high=Infinity;
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
    if(!dx&&!dz)continue;
    const nx=x+dx,nz=z+dz,q=nz*n+nx;
    if(nx<0||nx>=n||nz<0||nz>=n||(!t.accessMask[k]&&!t.accessMask[q]))continue;
    const limit=Math.tan(29.99*Math.PI/180)*step*Math.hypot(dx,dz);
    low=Math.max(low,t.heights[q]-limit);high=Math.min(high,t.heights[q]+limit);
  }
  return low<=high?clamp(proposed,low,high):t.heights[k];
}
export function replayEdits(t:Terrain,edits:BrushStroke[]) {
  for(const e of edits)applyBrush(t,e,true,false);
  if(edits.length)finishTerrain(t);
  return t;
}
