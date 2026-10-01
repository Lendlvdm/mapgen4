import test from 'node:test';
import assert from 'node:assert/strict';
import {unzlibSync} from 'fflate';
import {generateTerrain,routeAt,heightAt} from '../moonwake/terrain.ts';
import {settings} from '../moonwake/types.ts';
import {chunkMesh,glb,exportFiles} from '../moonwake/export.ts';
const t=generateTerrain({resolution:257,vegetation:.4});
test('fixed seeds reproduce heights, blends and placement data',()=>{const b=generateTerrain(t.settings);assert.deepEqual(t.heights,b.heights);assert.deepEqual(t.biomeWeights,b.biomeWeights);assert.deepEqual(t.placements,b.placements);});
test('seed changes terrain while retaining landmark coordinates',()=>{const b=generateTerrain({...t.settings,seed:188});assert.notDeepEqual(t.heights,b.heights);assert.deepEqual(t.landmarks,b.landmarks);});
test('all samples finite, normals unit, four weights sum to 255',()=>{const present=new Set<number>();for(let k=0;k<t.heights.length;k++){assert.ok(Number.isFinite(t.heights[k]));assert.ok(t.slopes[k]>=0&&t.slopes[k]<=90);assert.ok(Math.abs(Math.hypot(...t.normals.subarray(k*3,k*3+3))-1)<1e-5);assert.equal(t.biomeWeights.subarray(k*4,k*4+4).reduce((a,b)=>a+b,0),255);present.add(t.biomeIds[k]);}assert.equal(present.size,4);});
test('settlement plateau is flat and landmark centers retain elevations',()=>{for(const l of t.landmarks)assert.ok(Math.abs(heightAt(t,l.x,l.z)-l.y)<.002);for(let z=66;z<=86;z+=2)for(let x=-10;x<=10;x+=2)assert.ok(Math.abs(heightAt(t,x,z)-8)<.002);});
test('protected approaches are not populated with scenery',()=>{for(const p of t.placements){assert.ok(routeAt(t.routes,p.x,p.z).distance>=6);assert.ok(t.landmarks.every(l=>Math.hypot(p.x-l.x,p.z-l.z)>=l.radius+6));assert.ok(Math.abs(heightAt(t,p.x,p.z)-p.y)<.0001);}});
test('all story clearings connected on conservative walkable grid',()=>{
 const n=t.settings.resolution,seen=new Uint8Array(n*n),queue:number[]=[];
 const cell=(x:number,z:number)=>Math.round((z/256+.5)*(n-1))*n+Math.round((x/256+.5)*(n-1));
 const start=cell(0,76);seen[start]=1;queue.push(start);
 for(let h=0;h<queue.length;h++){const k=queue[h],x=k%n,z=Math.floor(k/n);for(const [dx,dz] of [[-1,0],[1,0],[0,-1],[0,1]]){const a=x+dx,b=z+dz,q=b*n+a;if(a>=0&&a<n&&b>=0&&b<n&&!seen[q]&&t.walkable[q]){seen[q]=1;queue.push(q);}}}
 for(const l of t.landmarks)assert.ok(seen[cell(l.x,l.z)],`${l.id} must have a route from hearth`);
});
test('adjacent chunks share exact heights, normals and colors',()=>{const a=chunkMesh(t,0,0),b=chunkMesh(t,1,0);for(let z=0;z<65;z++){const ai=(z*65+64)*3,bi=z*65*3;assert.equal(a.positions[ai]+a.origin[0],b.positions[bi]+b.origin[0]);assert.equal(a.positions[ai+1],b.positions[bi+1]);assert.deepEqual(a.normals.subarray(ai,ai+3),b.normals.subarray(bi,bi+3));assert.deepEqual(a.colors.subarray(ai,ai+3),b.colors.subarray(bi,bi+3));}});
test('GLB chunks have valid bounds, uint32 indices and upwards face winding',()=>{const m=chunkMesh(t,1,1),bytes=glb(m,'test'),v=new DataView(bytes.buffer);assert.equal(v.getUint32(0,true),0x46546c67);assert.equal(v.getUint32(8,true),bytes.length);const len=v.getUint32(12,true),doc=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+len)));assert.deepEqual(doc.nodes[0].translation,m.origin);assert.equal(doc.accessors[3].componentType,5125);assert.ok(m.indices.every(i=>i<m.positions.length/3));const [a,b,c]=m.indices;const u=[m.positions[b*3]-m.positions[a*3],m.positions[b*3+2]-m.positions[a*3+2]],w=[m.positions[c*3]-m.positions[a*3],m.positions[c*3+2]-m.positions[a*3+2]];assert.ok(u[1]*w[0]-u[0]*w[1]>0);});
test('exports preserve 16-bit heights, float heights and declared axis metadata',()=>{
 const files=exportFiles(t,false),manifest=JSON.parse(new TextDecoder().decode(files['manifest.json']));assert.equal(manifest.chunks.length,16);assert.equal(manifest.dimensions.sampleSpacingMetres,1);
 const raw=new DataView(files['height/height.r16'].buffer),floats=new DataView(files['height/height.f32'].buffer);const error=(t.stats.maxHeight-t.stats.minHeight)/65535;
 for(let i=0;i<t.heights.length;i+=103){assert.equal(floats.getFloat32(i*4,true),t.heights[i]);assert.ok(Math.abs(t.stats.minHeight+raw.getUint16(i*2,true)*error-t.heights[i])<=error/2+1e-8);}
 const png=files['height/height-16bit.png'],v=new DataView(png.buffer);assert.equal(png[24],16);let at=8,idat:Uint8Array|undefined;
 while(at<png.length){const size=v.getUint32(at),type=new TextDecoder().decode(png.subarray(at+4,at+8));if(type==='IDAT')idat=png.subarray(at+8,at+8+size);at+=size+12;}
 const decoded=unzlibSync(idat!);assert.equal(decoded.length,(257*2+1)*257);assert.equal(decoded[0],0);assert.equal(decoded[1]*256+decoded[2],raw.getUint16(0,true));
});
test('large scale uses physical metres and includes exact boundary samples',()=>{const big=generateTerrain({worldSize:1024,resolution:129,vegetation:0});assert.equal(big.settings.worldSize/(big.settings.resolution-1),8);assert.equal(big.landmarks[0].z,304);const c=chunkMesh(big,1,1);assert.equal(c.origin[0]+c.positions[c.positions.length-3],512);assert.ok(big.stats.maxHeight>t.stats.maxHeight*2);});
test('invalid or excessive requests fail before allocation',()=>{for(const p of [{seed:NaN},{resolution:8193},{worldSize:100000},{terrace:2},{relief:-1},{seed:1.4}])assert.throws(()=>settings(p));assert.throws(()=>chunkMesh(t,50,0));});
test('route connectivity survives representative seeds and extreme shaping controls',()=>{
 for(const options of [{seed:0,relief:.5,terrace:0,detail:1},{seed:991,relief:1.5,terrace:1,detail:1},{seed:2147483647,relief:1,terrace:.82,detail:.65},{seed:187,worldSize:1024,resolution:1025}]){
  const world=generateTerrain({resolution:257,vegetation:0,...options}),n=world.settings.resolution,size=world.settings.worldSize;
  const cell=(x:number,z:number)=>Math.round((z/size+.5)*(n-1))*n+Math.round((x/size+.5)*(n-1));
  const first=world.landmarks[0],queue=[cell(first.x,first.z)],seen=new Uint8Array(n*n);seen[queue[0]]=1;
  for(let h=0;h<queue.length;h++){const k=queue[h],x=k%n,z=Math.floor(k/n);for(const [dx,dz] of [[-1,0],[1,0],[0,-1],[0,1]]){const a=x+dx,b=z+dz,q=b*n+a;if(a>=0&&a<n&&b>=0&&b<n&&!seen[q]&&world.walkable[q]){seen[q]=1;queue.push(q);}}}
  for(const l of world.landmarks)assert.ok(seen[cell(l.x,l.z)],`seed ${options.seed}: ${l.id} connected`);
 }
});
