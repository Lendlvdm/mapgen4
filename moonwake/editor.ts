import {clamp,smooth,refreshTerrain,finishTerrain} from './terrain.ts';
import {validateStroke,type Terrain,type BrushStroke,type Bounds} from './types.ts';

// Every edit uses world-space coordinates so recipes replay at another resolution.
export function applyBrush(t:Terrain,input:BrushStroke,record=true,refresh=true):Bounds {
  const e=validateStroke(input,t.settings),n=t.settings.resolution,step=t.settings.worldSize/(n-1),half=t.settings.worldSize/2;
  const x0=clamp(Math.floor((e.x-e.radius+half)/step),0,n-1),x1=clamp(Math.ceil((e.x+e.radius+half)/step),0,n-1);
  const z0=clamp(Math.floor((e.z-e.radius+half)/step),0,n-1),z1=clamp(Math.ceil((e.z+e.radius+half)/step),0,n-1);
  for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++) {
    const k=z*n+x,d=Math.hypot(x*step-half-e.x,z*step-half-e.z)/e.radius;
    if(d>=1)continue;
    const falloff=1-smooth(.25,1,d),a=e.amount*falloff,free=t.protectedMask[k]===0;
    if(e.feature==='cliff'&&free)t.heights[k]+=a*Math.max(2,t.settings.worldSize/128);
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
export function replayEdits(t:Terrain,edits:BrushStroke[]) {
  for(const e of edits)applyBrush(t,e,true,false);
  if(edits.length)finishTerrain(t);
  return t;
}
