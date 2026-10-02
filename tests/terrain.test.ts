import test from 'node:test';
import {createRig,dragRig,linkRig,rigInfluence,scaleRig,validateRig} from '../moonwake/path-rig.ts';
import type {PathRig} from '../moonwake/types.ts';
import assert from 'node:assert/strict';
import {unzlibSync} from 'fflate';
import {generateTerrain,routeAt,heightAt} from '../moonwake/terrain.ts';
import {applyBrush,replayEdits} from '../moonwake/editor.ts';
import {finishTerrain} from '../moonwake/terrain.ts';
import {settings,parseRecipe,type Terrain} from '../moonwake/types.ts';
import {chunkMesh,glb,exportFiles} from '../moonwake/export.ts';
const t=generateTerrain({resolution:257,vegetation:.4,generation:1});
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
test('large scale uses physical metres and includes exact boundary samples',()=>{const big=generateTerrain({generation:1,worldSize:1024,resolution:129,vegetation:0});assert.equal(big.settings.worldSize/(big.settings.resolution-1),8);assert.equal(big.landmarks[0].z,304);const c=chunkMesh(big,1,1);assert.equal(c.origin[0]+c.positions[c.positions.length-3],512);assert.ok(big.stats.maxHeight>t.stats.maxHeight*2);});
test('invalid or excessive requests fail before allocation',()=>{for(const p of [{seed:NaN},{resolution:8193},{worldSize:100000},{terrace:2},{relief:-1},{seed:1.4},{walkability:-.01},{walkability:1.01},{walkability:NaN}])assert.throws(()=>settings(p));assert.throws(()=>chunkMesh(t,50,0));});
test('walkable terrain grading increases real gentle ground and preserves regional constraints',()=>{
 const medium=generateTerrain({...t.settings,walkability:.5}),broad=generateTerrain({...t.settings,walkability:1}),n=t.settings.resolution;
 assert.ok(medium.stats.walkablePercent>t.stats.walkablePercent+3);
 assert.ok(broad.stats.walkablePercent>medium.stats.walkablePercent+8);
 assert.notDeepEqual(broad.heights,t.heights);
 assert.deepEqual(broad.biomeWeights,t.biomeWeights);
 assert.deepEqual(broad.routes,t.routes);assert.deepEqual(broad.landmarks,t.landmarks);
 for(let i=0;i<n;i++) for(const k of [i,(n-1)*n+i,i*n,i*n+n-1]) assert.equal(broad.heights[k],t.heights[k]);
 for(const l of broad.landmarks)assert.ok(Math.abs(heightAt(broad,l.x,l.z)-l.y)<.002);
 for(let k=0;k<broad.heights.length;k++)if(broad.walkable[k])assert.ok(broad.slopes[k]<=30);
 const files=exportFiles(broad,false),recipe=JSON.parse(new TextDecoder().decode(files['recipe.json']));
 assert.equal(recipe.walkability,1);delete recipe.schemaVersion;delete recipe.edits;
 assert.deepEqual(generateTerrain(recipe).heights,broad.heights);
 assert.equal(settings({seed:187}).walkability,0);
});
test('route connectivity survives representative seeds and extreme shaping controls',()=>{
 for(const options of [{seed:0,relief:.5,terrace:0,detail:1},{seed:991,relief:1.5,terrace:1,detail:1},{seed:2147483647,relief:1,terrace:.82,detail:.65},{seed:187,worldSize:1024,resolution:1025},{seed:0,walkability:.5},{seed:991,relief:1.5,terrace:1,walkability:1},{seed:187,worldSize:1024,resolution:1025,walkability:1}]){
  const world=generateTerrain({generation:1,resolution:257,vegetation:0,...options}),n=world.settings.resolution,size=world.settings.worldSize;
  const cell=(x:number,z:number)=>Math.round((z/size+.5)*(n-1))*n+Math.round((x/size+.5)*(n-1));
  const first=world.landmarks[0],queue=[cell(first.x,first.z)],seen=new Uint8Array(n*n);seen[queue[0]]=1;
  for(let h=0;h<queue.length;h++){const k=queue[h],x=k%n,z=Math.floor(k/n);for(const [dx,dz] of [[-1,0],[1,0],[0,-1],[0,1]]){const a=x+dx,b=z+dz,q=b*n+a;if(a>=0&&a<n&&b>=0&&b<n&&!seen[q]&&world.walkable[q]){seen[q]=1;queue.push(q);}}}
  for(const l of world.landmarks)assert.ok(seen[cell(l.x,l.z)],`seed ${options.seed}: ${l.id} connected`);
 }
});

function assertReachable(world:Terrain){
 const n=world.settings.resolution,size=world.settings.worldSize,cell=(x:number,z:number)=>Math.round((z/size+.5)*(n-1))*n+Math.round((x/size+.5)*(n-1));
 const first=world.landmarks[0],queue=[cell(first.x,first.z)],seen=new Uint8Array(n*n);seen[queue[0]]=1;
 for(let h=0;h<queue.length;h++){const k=queue[h],x=k%n,z=Math.floor(k/n);for(const [dx,dz] of [[-1,0],[1,0],[0,-1],[0,1]]){const a=x+dx,b=z+dz,q=b*n+a;if(a>=0&&a<n&&b>=0&&b<n&&!seen[q]&&world.walkable[q]){seen[q]=1;queue.push(q);}}}
 for(const l of world.landmarks)assert.ok(world.walkable[cell(l.x,l.z)]&&seen[cell(l.x,l.z)],`seed ${world.settings.seed}, ${size}m: ${l.id} reachable`);
}
test('new generator curves seeded paths, places two factions and preserves access at 4096 metres',()=>{
 for(const options of [{seed:0,resolution:129,worldSize:4096},{seed:991,resolution:257,relief:1.5,terrace:1},{seed:187,resolution:1025,worldSize:4096,walkability:1}]) {
  const world=generateTerrain({vegetation:0,...options});assertReachable(world);
  const camps=world.landmarks.filter(l=>l.kind==='camp');assert.equal(camps.length,2);assert.deepEqual(camps.map(l=>l.faction),['neutral','enemy']);
  for(const r of world.routes){assert.ok(r.points.length>4);for(const [x,z,y] of r.points)assert.ok(Math.abs(y-heightAt(world,x,z))<.001);}
 }
 const a=generateTerrain({resolution:129,vegetation:0}),b=generateTerrain({resolution:129,vegetation:0,seed:188}),same=generateTerrain(a.settings);
 assert.notDeepEqual(a.routes,b.routes);assert.notDeepEqual(a.landmarks.slice(4),b.landmarks.slice(4));assert.deepEqual(a.routes,same.routes);assert.deepEqual(a.landmarks,same.landmarks);
});
test('mountain slopes remain inside the map even with maximum walkable strength',()=>{
 const world=generateTerrain({resolution:257,vegetation:0,walkability:1}),n=world.settings.resolution;let cliffs=0;
 for(let z=64;z<192;z++)for(let x=64;x<192;x++)if(world.slopes[z*n+x]>40)cliffs++;
 assert.ok(cliffs>500,'interior ridge slopes remain');assertReachable(world);
});
test('painting changes real heights and data locally, supports subtraction and exact export replay',()=>{
 const world=generateTerrain({resolution:129,vegetation:.4});const n=world.settings.resolution,step=world.settings.worldSize/(n-1);
 let k=0;for(let i=20*n+20;i<world.heights.length-20*n;i++)if(!world.protectedMask[i]&&i%n>20&&i%n<108){k=i;break;}
 const x=(k%n)*step-128,z=Math.floor(k/n)*step-128,base={x,z,radius:8,amount:.5,biome:2,target:world.heights[k],stroke:1};
 const before=world.heights.slice(),initial=world.heights[k];applyBrush(world,{...base,feature:'cliff'});assert.ok(world.heights[k]>initial);assert.equal(world.heights[0],before[0]);
 applyBrush(world,{...base,feature:'cliff',amount:-.25});assert.ok(world.heights[k]>initial&&world.heights[k]<initial+1.1);
 const wet=world.moisture[k];applyBrush(world,{...base,feature:'moisture',amount:-1});assert.equal(world.moisture[k],0);applyBrush(world,{...base,feature:'moisture',amount:.5});assert.equal(world.moisture[k],.5);
 applyBrush(world,{...base,feature:'biome',amount:1});assert.equal(world.biomeIds[k],2);assert.equal(world.biomeWeights[k*4+2],255);
 applyBrush(world,{...base,feature:'biome',amount:-.5});assert.equal(world.biomeWeights.subarray(k*4,k*4+4).reduce((a,b)=>a+b,0),255);assert.ok(world.biomeWeights[k*4+2]<255);
 applyBrush(world,{...base,feature:'dressing',amount:-1});assert.equal(world.dressing[k],0);applyBrush(world,{...base,feature:'dressing',amount:.5});assert.equal(world.dressing[k],.5);
 applyBrush(world,{...base,feature:'path'});assert.ok(world.pathPaint[k]>.4);applyBrush(world,{...base,feature:'path',amount:-1});assert.equal(world.pathPaint[k],0);
 applyBrush(world,{...base,feature:'build'});assert.ok(world.buildPaint[k]>.4);
 applyBrush(world,{...base,feature:'blend',amount:.3});
 finishTerrain(world);const files=exportFiles(world,false),parsed=parseRecipe(JSON.parse(new TextDecoder().decode(files['recipe.json']))),restored=replayEdits(generateTerrain(parsed.settings),parsed.edits);
 for(const field of ['heights','moisture','biomeWeights','pathPaint','buildPaint','dressing','walkable','colors'] as const)assert.deepEqual(restored[field],world[field]);
 assert.deepEqual(restored.placements,world.placements);assert.ok(files['masks/dressing.png']);assert.ok(files['masks/painted-build.png']);
 const floats=new DataView(files['height/height.f32'].buffer);assert.equal(floats.getFloat32(k*4,true),world.heights[k]);
});
test('destructive brush strokes cannot sever generated POI and camp approaches',()=>{
 const world=generateTerrain({resolution:257,vegetation:0});const protectedHeights=world.heights.slice();
 for(let z=-96;z<=96;z+=24)for(let x=-96;x<=96;x+=24)applyBrush(world,{feature:'cliff',x,z,radius:24,amount:1,biome:0,target:0,stroke:1},true,false);
 finishTerrain(world);for(let k=0;k<world.heights.length;k++)if(world.protectedMask[k])assert.equal(world.heights[k],protectedHeights[k]);assertReachable(world);
});
test('recipe migration and invalid brush inputs are handled explicitly',()=>{
 assert.equal(parseRecipe({schemaVersion:1,seed:187}).settings.generation,1);
 assert.equal(parseRecipe({schemaVersion:2,seed:187}).settings.generation,2);
 for(const edit of [{feature:'bogus'},{feature:'cliff',x:NaN},{feature:'cliff',x:0,z:0,radius:-1,amount:.1,biome:0,target:0,stroke:1}])assert.throws(()=>parseRecipe({schemaVersion:2,edits:[edit]}));
});
test('local biome painting leaves distant scenery candidates stable',()=>{
 const world=generateTerrain({resolution:129}),before=world.placements.filter(p=>Math.hypot(p.x,p.z)>30);
 applyBrush(world,{feature:'biome',x:0,z:0,radius:20,amount:1,biome:2,target:0,stroke:1});finishTerrain(world);
 assert.deepEqual(world.placements.filter(p=>Math.hypot(p.x,p.z)>30),before);
});
test('blend averages peaks symmetrically within its radius and right brush restores relief',()=>{
 const world=generateTerrain({resolution:129,vegetation:0}),n=129,k=64*n+64;
 world.heights.fill(0);world.protectedMask.fill(0);world.heights[k]=20;world.baseHeights.set(world.heights);
 const e={feature:'blend' as const,x:0,z:0,radius:16,amount:.5,biome:0,target:0,stroke:1};
 applyBrush(world,e);
 assert.ok(world.heights[k]>0&&world.heights[k]<20);
 assert.ok(world.heights[k+1]>0);assert.equal(world.heights[k-1],world.heights[k+1]);assert.equal(world.heights[k-n],world.heights[k+n]);
 for(let z=0;z<n;z++)for(let x=0;x<n;x++){
  const h=world.heights[z*n+x];assert.ok(h>=0&&h<=20);
  if(Math.hypot((x-64)*2,(z-64)*2)>=16)assert.equal(h,0);
 }
 assert.ok(world.slopes[k]<Math.atan(20/2)*180/Math.PI);
 applyBrush(world,{...e,amount:-.25});assert.equal(world.heights[k],20);
});
test('blend preserves access protection and stays finite at map corners',()=>{
 const world=generateTerrain({resolution:129,vegetation:0}),before=world.heights.slice();
 for(const [x,z] of [[0,0],[-128,-128],[128,128]])applyBrush(world,{feature:'blend',x,z,radius:128,amount:1,biome:0,target:0,stroke:1});
 finishTerrain(world);
 for(let k=0;k<before.length;k++){assert.ok(Number.isFinite(world.heights[k]));if(world.protectedMask[k])assert.equal(world.heights[k],before[k]);}
 assertReachable(world);
});
test('path-enabled blend reshapes baked roads while keeping POIs connected and exports aligned',()=>{
 const world=generateTerrain({resolution:129,vegetation:0}),before=world.heights.slice();
 for(let pass=0;pass<3;pass++)applyBrush(world,{feature:'blend',blendPaths:true,x:0,z:0,radius:128,amount:.5,biome:0,target:0,stroke:1});
 finishTerrain(world);
 const changed=world.heights.reduce((count,h,k)=>count+(world.routeMask[k]&&Math.abs(h-before[k])>.001?1:0),0);
 assert.ok(changed>50,`expected generated paths to change, got ${changed} samples`);assertReachable(world);
 for(const l of world.landmarks)assert.ok(Math.abs(heightAt(world,l.x,l.z)-l.y)<.002);
 for(const r of world.routes)for(const [x,z,y] of r.points)assert.equal(y,heightAt(world,x,z));
 const files=exportFiles(world,false),parsed=parseRecipe(JSON.parse(new TextDecoder().decode(files['recipe.json']))),restored=replayEdits(generateTerrain(parsed.settings),parsed.edits);
 assert.deepEqual(restored.heights,world.heights);assert.deepEqual(restored.routes,world.routes);
 assert.deepEqual(JSON.parse(new TextDecoder().decode(files['placements.json'])).routes,world.routes);
 // Restoring original relief must also respect the currently connected approach.
 applyBrush(world,{feature:'blend',blendPaths:true,x:0,z:0,radius:128,amount:-.5,biome:0,target:0,stroke:2});finishTerrain(world);assertReachable(world);
});

test('path rig falloff follows connected graph distance, shares junctions, and pins anchors',()=>{
 const rig:PathRig={version:1,nodes:[{id:'a',x:0,z:0,pinned:false},{id:'b',x:10,z:0,pinned:false},{id:'c',x:20,z:0,pinned:false},{id:'d',x:30,z:0,pinned:true},{id:'branch',x:10,z:10,pinned:false},{id:'separate',x:0,z:1,pinned:false}],paths:[{id:'main',gate:'open',width:6,nodes:['a','b','c','d']},{id:'branch',gate:'open',width:6,nodes:['b','branch']}]};
 const weights=rigInfluence(rig,'a',40);assert.equal(weights.get('a'),1);assert.ok(weights.get('b')!>weights.get('c')!);assert.equal(weights.get('c'),weights.get('branch'));assert.ok(!weights.has('separate'));assert.ok(!weights.has('d'));
 const moved=dragRig(rig,'a',0,8,40,256);assert.equal(moved.nodes[0].z,8);assert.ok(moved.nodes[1].z>moved.nodes[2].z);assert.equal(moved.nodes[3].z,0);assert.equal(moved.nodes[5].z,1);assert.equal(rig.nodes[0].z,0);
 const linked=linkRig(rig,'a','separate',256);assert.equal(linked.paths.length,3);assert.ok(rigInfluence(linked,'a',40).has('separate'));assert.throws(()=>linkRig(rig,'a','b',256));assert.throws(()=>linkRig(rig,'a','a',256));
 assert.equal(scaleRig(rig,16).nodes[2].x,320);assert.throws(()=>validateRig({...rig,nodes:[...rig.nodes,rig.nodes[0]]},settings()));
});
test('rigged paths reshape terrain, preserve POI access, and replay with painting in exported recipes',()=>{
 const original=generateTerrain({resolution:129,vegetation:0}),rig=createRig(original.routes,original.landmarks);
 const path=rig.paths.find(p=>p.id==='garden_scar')!,node=rig.nodes.find(n=>n.id===path.nodes[Math.floor(path.nodes.length/2)])!;
 const moved=dragRig(rig,node.id,3,4,35,256),linked=linkRig(moved,path.nodes[5],rig.paths.find(p=>p.id==='scar_return')!.nodes[5],256);
 const world=generateTerrain(original.settings,linked);assert.notDeepEqual(world.heights,original.heights);assertReachable(world);
 assert.deepEqual(world.landmarks,original.landmarks);assert.equal(world.pathRig.paths.length,rig.paths.length+1);
 applyBrush(world,{feature:'moisture',x:0,z:0,radius:20,amount:.3,biome:0,target:0,stroke:1});finishTerrain(world);
 const files=exportFiles(world,false),parsed=parseRecipe(JSON.parse(new TextDecoder().decode(files['recipe.json']))),restored=replayEdits(generateTerrain(parsed.settings,parsed.pathRig),parsed.edits);
 assert.deepEqual(restored.heights,world.heights);assert.deepEqual(restored.moisture,world.moisture);assert.deepEqual(restored.routes,world.routes);assert.deepEqual(JSON.parse(new TextDecoder().decode(files['path-rig.json'])),world.pathRig);
 const large=generateTerrain({worldSize:4096,resolution:129,vegetation:0},scaleRig(linked,16));assertReachable(large);
 const broken=structuredClone(linked),camp=broken.nodes.find(n=>n.anchor==='camp_0')!;
 broken.paths=broken.paths.filter(p=>!p.nodes.includes(camp.id));
 assert.throws(()=>generateTerrain(original.settings,broken),/connect every point of interest/);
});
