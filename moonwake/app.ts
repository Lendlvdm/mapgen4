import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {applyBrush} from './editor.ts';
import {heightAt,finishTerrain,scatter} from './terrain.ts';
import {DEFAULTS,BIOMES,settings,parseRecipe,recipe,type Settings,type Terrain,type BrushFeature,type BrushStroke,type Bounds} from './types.ts';
import {chunkMesh} from './export.ts';
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=$<HTMLCanvasElement>('viewport'),renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();scene.background=new THREE.Color('#656079');
const camera=new THREE.PerspectiveCamera(40,1,.2,6000),controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.49;
const hemi=new THREE.HemisphereLight('#c5c5ed','#50415a',2.0);scene.add(hemi);
const sun=new THREE.DirectionalLight('#ffe0b2',3.3);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.0002;sun.shadow.normalBias=.25;scene.add(sun);scene.add(sun.target);
const terrainGroup=new THREE.Group(),sceneryGroup=new THREE.Group();scene.add(terrainGroup,sceneryGroup);
let terrain:Terrain|undefined,mode='beauty',working=false,generation=2;
let pendingEdits:BrushStroke[]|undefined;
const worker=new Worker(new URL('./moonwake-worker.js',import.meta.url),{type:'module'});
function busy(message:string|false) {working=!!message;$('busy').hidden=!message;if(message)$('busy').textContent=message;for(const id of ['generate','export','load-recipe','save-recipe','undo-paint','clear-paint'])$<HTMLButtonElement>(id).disabled=!!message||(!terrain&&id!=='generate');}
function formatControl(key:string,value:number){return key==='walkability'?`${Math.round(value*100)}%`:value.toFixed(2);}
function readSettings():Settings {const p={...DEFAULTS,generation};for(const key of ['seed','resolution','relief','terrace','detail','moisture','vegetation','walkability'] as const)p[key]=Number($<HTMLInputElement>(key).value);p.worldSize=Number($<HTMLSelectElement>('preset').value);return settings(p);}
function spacing(){const p=readSettings();$('spacing').textContent=`${(p.worldSize/(p.resolution-1)).toFixed(2)} m between height samples${p.worldSize>=2048?' · 1,025 samples recommended; fine paths need later tile refinement':''}`;}
function generate(existing?:Settings){try{$('error').textContent='';const p=existing??readSettings();busy('Shaping cliffs, grading routes and growing the biomes…');$('status').textContent='Generating landscape…';const source=pendingEdits??terrain?.edits??[],ratio=terrain&&pendingEdits===undefined?p.worldSize/terrain.settings.worldSize:1;const edits=source.map(e=>({...e,x:e.x*ratio,z:e.z*ratio,radius:e.radius*ratio,target:e.target*ratio}));pendingEdits=undefined;worker.postMessage({type:'generate',settings:p,edits});}catch(e){fail(e);}}
function fail(e:unknown){busy(false);$('error').textContent=e instanceof Error?e.message:String(e);$('status').textContent='Needs attention';}
worker.onerror=e=>fail(e.message);
worker.onmessage=e=>{
  if(e.data.type==='error'){fail(e.data.message);return;}
  if(e.data.type==='terrain') {terrain=e.data.terrain;try{rebuild(terrain!);busy(false);$('status').textContent=`Seed ${terrain!.settings.seed} · ready in ${(terrain!.stats.generationMs/1000).toFixed(1)}s`;document.body.dataset.ready='true';syncState();}catch(err){fail(err);}}
  else if(e.data.type==='export'){download(e.data.bytes,`nacre-${terrain!.settings.worldSize}m-seed-${terrain!.settings.seed}.zip`,'application/zip');busy(false);$('status').textContent='Terrain bundle exported';}
};
function dispose(group:THREE.Group){const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();group.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry)geometries.add(m.geometry);if(m.material)for(const v of Array.isArray(m.material)?m.material:[m.material])materials.add(v);});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();group.clear();}
function rebuild(t:Terrain){
  dispose(terrainGroup);dispose(sceneryGroup);const side=(t.settings.resolution-1)/64;
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.97,metalness:0,flatShading:false});
  for(let z=0;z<side;z++)for(let x=0;x<side;x++){
    const data=chunkMesh(t,x,z),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(data.positions,3));g.setAttribute('normal',new THREE.BufferAttribute(data.normals,3));g.setAttribute('color',new THREE.BufferAttribute(data.colors,3));g.setIndex(new THREE.BufferAttribute(data.indices,1));
    const mesh=new THREE.Mesh(g,material);mesh.position.fromArray(data.origin);mesh.receiveShadow=true;mesh.castShadow=true;mesh.userData={x,z};terrainGroup.add(mesh);
  }
  dress(t);setMode(mode);home();updatePaintStatus();const brushInput=$<HTMLInputElement>('brush-radius');brushInput.min=String(2*t.settings.worldSize/(t.settings.resolution-1));brushInput.max=String(t.settings.worldSize/2);brushInput.value=String(radius());
  $('extent').textContent=`${t.settings.worldSize.toLocaleString()} × ${t.settings.worldSize.toLocaleString()} m`;$('sample').textContent=`${(t.settings.worldSize/(t.settings.resolution-1)).toFixed(2)} m`;$('triangles').textContent=`${(t.stats.triangles/1e6).toFixed(2)} M`;$('walk').textContent=`${t.stats.walkablePercent.toFixed(0)}%`;
}
function tint(g:THREE.BufferGeometry,color:string){const c=new THREE.Color(color),a=new Float32Array(g.getAttribute('position').count*3);for(let i=0;i<a.length;i+=3){a[i]=c.r;a[i+1]=c.g;a[i+2]=c.b;}g.setAttribute('color',new THREE.BufferAttribute(a,3));return g;}
function mergeProxy(parts:THREE.BufferGeometry[]){const compatible=parts.map(p=>p.index?p.toNonIndexed():p);const result=mergeGeometries(compatible);for(const p of new Set([...parts,...compatible]))p.dispose();if(!result)throw new Error('Proxy geometry could not be combined');return result;}
function proxyGeometry(kind:string):THREE.BufferGeometry {
  if(kind==='crystal_tree') {
    const trunk=tint(new THREE.CylinderGeometry(.12,.38,5,5).translate(0,2.5,0),'#667485');
    const parts=[trunk,...[[-1.3,4.5,0],[1.2,5.2,.3],[0,7,-.3],[0,3.4,1.3]].map(([x,y,z])=>tint(new THREE.OctahedronGeometry(1,0).scale(1.2,2.7,1.2).translate(x,y,z),'#6ac4c5'))];
    return mergeProxy(parts);
  }
  if(kind==='crystal')return tint(new THREE.OctahedronGeometry(1,0).scale(.9,2.5,.9).translate(0,1.8,0),'#63d4d3');
  if(kind==='monolith')return tint(new THREE.CylinderGeometry(.55,1.05,12,5).translate(0,6,0),'#d9d2cf');
  if(kind==='vent')return tint(new THREE.CylinderGeometry(1.1,1.9,1.2,7).translate(0,.6,0),'#694c49');
  if(kind==='mooncap'){const parts=[tint(new THREE.CylinderGeometry(.12,.2,1.3,5).translate(0,.65,0),'#c0b0c0'),tint(new THREE.ConeGeometry(.9,.5,7).translate(0,1.45,0),'#92daca')];return mergeProxy(parts);}
  return tint(new THREE.DodecahedronGeometry(1.4,0).scale(1.5,1,1.2).translate(0,.8,0),'#807187');
}
function dress(t:Terrain){
  const dummy=new THREE.Object3D();
  for(const kind of ['crystal_tree','crystal','rock','monolith','vent','mooncap']){
    const items=t.placements.filter(p=>p.kind===kind);if(!items.length)continue;
    const g=proxyGeometry(kind),mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.75,metalness:kind.includes('crystal')?.18:0,flatShading:true});
    if(kind.includes('crystal')) {mat.emissive=new THREE.Color('#226263');mat.emissiveIntensity=.22;}
    const inst=new THREE.InstancedMesh(g,mat,items.length);
    items.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.yaw,0);dummy.scale.setScalar(p.scale);dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);});inst.castShadow=true;inst.receiveShadow=true;sceneryGroup.add(inst);
  }
  const scale=Math.sqrt(t.settings.worldSize/256),copper=new THREE.MeshStandardMaterial({color:'#bb8859',metalness:.5,roughness:.5}),ivory=new THREE.MeshStandardMaterial({color:'#c5c0bb',roughness:.8}),glow=new THREE.MeshStandardMaterial({color:'#ffc383',emissive:'#ff9a43',emissiveIntensity:1.8});
  for(const l of t.landmarks){
    const root=new THREE.Group();root.position.set(l.x,l.y,l.z);root.scale.setScalar(scale);sceneryGroup.add(root);
    if(l.kind==='settlement'){
      const hull=new THREE.Mesh(new THREE.CylinderGeometry(3.2,3.2,11,12),ivory);hull.rotation.z=Math.PI/2;hull.position.y=3.2;root.add(hull);
      const door=new THREE.Mesh(new THREE.SphereGeometry(1.5,12,8),glow);door.scale.z=.14;door.position.set(0,2.3,3.25);root.add(door);
      for(const [x,z] of [[-11,2],[9,10],[-6,-10],[12,-6]]){const hut=new THREE.Mesh(new THREE.CylinderGeometry(1.8,2.7,3,8),copper);hut.position.set(x,1.5,z);root.add(hut);const window=new THREE.Mesh(new THREE.BoxGeometry(1,1,.1),glow);window.position.set(x,1.7,z+2.4);root.add(window);}
    }else if(l.kind==='camp'){
      const fabric=new THREE.MeshStandardMaterial({color:l.faction==='enemy'?'#ae5147':'#52ad9a',roughness:1});
      for(const x of [-3,3]){const tent=new THREE.Mesh(new THREE.ConeGeometry(2,3,4),fabric);tent.position.set(x,1.5,0);root.add(tent);}
      const fire=new THREE.Mesh(new THREE.ConeGeometry(.6,1.3,6),glow);fire.position.set(0,.65,3);root.add(fire);
    }else{
      const ring=new THREE.Mesh(new THREE.TorusGeometry(l.id==='relay_choir'?5:2.8,.22,6,36),copper);ring.position.y=l.id==='relay_choir'?7:4;root.add(ring);
      const orb=new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),glow);orb.position.copy(ring.position);root.add(orb);
      if(l.id==='relay_choir') for(const x of [-8,8]){const tower=new THREE.Mesh(new THREE.CylinderGeometry(.9,1.5,18,5),ivory);tower.position.set(x,9,-2);root.add(tower);}
    }
    root.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});
  }
}
function home(){if(!terrain)return;const w=terrain.settings.worldSize;camera.position.set(w*.17,w*.94,w*1.08);controls.target.set(0,w*.065,0);controls.minDistance=w*.03;controls.maxDistance=w*3;camera.far=w*8;camera.updateProjectionMatrix();controls.update();sun.position.set(-w*.3,w*.8,w*.3);sun.target.position.set(0,0,0);const sc=sun.shadow.camera;sc.left=sc.bottom=-w*.7;sc.right=sc.top=w*.7;sc.near=1;sc.far=w*3;sc.updateProjectionMatrix();scene.fog=new THREE.FogExp2('#747185',.32/w);}
const biomeColors=BIOMES.map(b=>new THREE.Color(b.color));
function setMode(next:string,bounds?:Bounds){mode=next;if(!terrain)return;const t=terrain,n=t.settings.resolution;
  for(const o of terrainGroup.children){const mesh=o as THREE.Mesh,g=mesh.geometry,colors=g.getAttribute('color'),{x:cx,z:cz}=mesh.userData;if(bounds&&(cx*64>bounds.x1||cx*64+64<bounds.x0||cz*64>bounds.z1||cz*64+64<bounds.z0))continue;for(let z=0;z<65;z++)for(let x=0;x<65;x++){
    const k=(cz*64+z)*n+cx*64+x,i=z*65+x;
    if(mode==='beauty')colors.setXYZ(i,t.colors[k*3],t.colors[k*3+1],t.colors[k*3+2]);
    else if(mode==='biomes'){const c=biomeColors[t.biomeIds[k]];colors.setXYZ(i,c.r,c.g,c.b);}
    else if(mode==='wetness'){const v=t.moisture[k];colors.setXYZ(i,.3*(1-v),.18+v*.35,.12+v*.65);}
    else if(mode==='density'){const v=t.dressing[k];colors.setXYZ(i,.12+v*.25,.12+v*.65,.12+v*.12);}
    else {const c=t.buildable[k]?[.72,.58,.18]:(t.routeMask[k]||t.pathPaint[k]>.25)?[.65,.65,.7]:t.walkable[k]?[.12,.4,.3]:[.47,.12,.16];colors.setXYZ(i,c[0],c[1],c[2]);}
  }colors.needsUpdate=true;}
  for(const id of ['beauty','biomes','slope','wetness','density'])$(id).classList.toggle('active',id===next);
  $('status').textContent=next==='slope'?'Green: slope-pass · Gold: build candidate · Pale: route · Red: steep/boundary':`Seed ${t.settings.seed} · ${next==='biomes'?'four biome regions':'landscape preview'}`;
}
function download(data:Uint8Array|string,name:string,type:string){const blob=new Blob([data as BlobPart],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
$('generate').onclick=()=>generate();
for(const key of ['relief','terrace','detail','moisture','vegetation','walkability'])$<HTMLInputElement>(key).oninput=()=>{$(`${key}-value`).textContent=formatControl(key,Number($<HTMLInputElement>(key).value));$('status').textContent='Settings changed · generate to apply';};
for(const key of ['preset','resolution'])$(key).onchange=()=>{try{spacing();$('status').textContent='Settings changed · generate to apply';}catch(e){fail(e);}};
for(const key of ['beauty','biomes','slope','wetness','density'])$(key).onclick=()=>setMode(key);
$('home').onclick=home;$('top').onclick=()=>{if(!terrain)return;const w=terrain.settings.worldSize;camera.position.set(0,w*1.55,.001);controls.target.set(0,0,0);controls.update();};
$('scenery').onclick=()=>{sceneryGroup.visible=!sceneryGroup.visible;$('scenery').textContent=sceneryGroup.visible?'Hide dressing':'Show dressing';};
$('export').onclick=()=>{if(!terrain||working)return;busy('Packing height maps, biome data and terrain tiles…');$('status').textContent='Exporting terrain…';worker.postMessage({type:'export',terrain,lods:$<HTMLInputElement>('lods').checked});};
$('save-recipe').onclick=()=>{if(terrain)download(JSON.stringify(recipe(terrain),null,2),`nacre-recipe-${terrain.settings.seed}.json`,'application/json');};
$('load-recipe').onclick=()=>$<HTMLInputElement>('recipe-file').click();
$<HTMLInputElement>('recipe-file').onchange=async e=>{try{const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;const parsed=parseRecipe(JSON.parse(await file.text())),p=parsed.settings;generation=p.generation;pendingEdits=parsed.edits;$<HTMLSelectElement>('preset').value=String(p.worldSize);for(const key of ['seed','resolution','relief','terrace','detail','moisture','vegetation','walkability'] as const){$<HTMLInputElement>(key).value=String(p[key]);if($(`${key}-value`))$(`${key}-value`).textContent=formatControl(key,p[key]);}spacing();generate();}catch(err){fail(err);}finally{$<HTMLInputElement>('recipe-file').value='';}};
$('snapshot').onclick=()=>{renderer.render(scene,camera);canvas.toBlob(blob=>{if(!blob)return;blob.arrayBuffer().then(a=>download(new Uint8Array(a),'nacre-preview.png','image/png'));});};
function animate(){requestAnimationFrame(animate);const w=canvas.clientWidth,h=canvas.clientHeight;if(canvas.width!==Math.floor(w*renderer.getPixelRatio())||canvas.height!==Math.floor(h*renderer.getPixelRatio())){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}controls.update();paintFrame();renderer.render(scene,camera);}
// The brush edits only nearby samples and updates existing GPU buffers without resetting the camera.
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),ringGeometry=new THREE.BufferGeometry();
ringGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(97*3),3));
const brushRing=new THREE.Line(ringGeometry,new THREE.LineBasicMaterial({color:'#ffce82',depthTest:false,transparent:true,opacity:.95}));
brushRing.renderOrder=10;brushRing.frustumCulled=false;brushRing.visible=false;scene.add(brushRing);
let paintEnabled=false,hit:THREE.Vector3|undefined,held=0,lastPaint=0,strokeId=0,strokeTarget=0,lastStamp:THREE.Vector3|undefined,dirty:Bounds|undefined,lastDressing=0;
function syncState(){if(terrain)(window as any).__moonwake={settings:terrain.settings,stats:terrain.stats,placements:terrain.placements.length,edits:terrain.edits.length,camps:terrain.landmarks.filter(l=>l.kind==='camp'),brushVisible:brushRing?.visible??false,project:(x:number,z:number)=>{const v=new THREE.Vector3(x,heightAt(terrain!,x,z),z).project(camera),r=canvas.getBoundingClientRect();return {x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};},sample:(x:number,z:number)=>{const t=terrain!,n=t.settings.resolution,k=Math.round((z/t.settings.worldSize+.5)*(n-1))*n+Math.round((x/t.settings.worldSize+.5)*(n-1));return {height:t.heights[k],protected:t.protectedMask[k],moisture:t.moisture[k],dressing:t.dressing[k],biome:t.biomeIds[k],weights:Array.from(t.biomeWeights.subarray(k*4,k*4+4)),path:t.pathPaint[k],build:t.buildPaint[k]};}};}
function updatePaintStatus(){if(!terrain)return;$('paint-status').textContent=`${new Set(terrain.edits.map(e=>e.stroke)).size} painted strokes · ${terrain.landmarks.filter(l=>l.kind==='camp').length} NPC camps`;}
function radius(){if(!terrain)return 12;const min=terrain.settings.worldSize/(terrain.settings.resolution-1)*2;return Math.max(min,Math.min(terrain.settings.worldSize/2,Number($<HTMLInputElement>('brush-radius').value)||12));}
function locate(e:PointerEvent){if(!terrain||working||!paintEnabled)return;const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);raycaster.setFromCamera(pointer,camera);hit=raycaster.intersectObjects(terrainGroup.children,false)[0]?.point;if(hit){const half=terrain.settings.worldSize/2;hit.x=Math.max(-half,Math.min(half,hit.x));hit.z=Math.max(-half,Math.min(half,hit.z));}brushRing.visible=!!hit;drawRing();syncState();}
function drawRing(){if(!hit||!terrain||!paintEnabled)return;const a=ringGeometry.getAttribute('position'),r=radius(),half=terrain.settings.worldSize/2;for(let i=0;i<=96;i++){const angle=i/96*Math.PI*2,x=Math.max(-half,Math.min(half,hit.x+Math.cos(angle)*r)),z=Math.max(-half,Math.min(half,hit.z+Math.sin(angle)*r));a.setXYZ(i,x,heightAt(terrain,x,z)+terrain.settings.worldSize*.001,z);}a.needsUpdate=true;}
function updateMeshes(bounds:Bounds){if(!terrain)return;const t=terrain,n=t.settings.resolution;for(const o of terrainGroup.children){const mesh=o as THREE.Mesh,{x:cx,z:cz}=mesh.userData;if(cx*64>bounds.x1||cx*64+64<bounds.x0||cz*64>bounds.z1||cz*64+64<bounds.z0)continue;const g=mesh.geometry,p=g.getAttribute('position'),normal=g.getAttribute('normal');for(let z=0;z<65;z++)for(let x=0;x<65;x++){const k=(cz*64+z)*n+cx*64+x,i=z*65+x;p.setY(i,t.heights[k]);normal.setXYZ(i,t.normals[k*3],t.normals[k*3+1],t.normals[k*3+2]);}p.needsUpdate=true;normal.needsUpdate=true;g.computeBoundingSphere();g.computeBoundingBox();}setMode(mode,bounds);}
function stamp(point:THREE.Vector3,amount:number){if(!terrain)return;const b=applyBrush(terrain,{feature:$<HTMLSelectElement>('brush-feature').value as BrushFeature,x:point.x,z:point.z,radius:radius(),amount,biome:Number($<HTMLSelectElement>('brush-biome').value),target:strokeTarget,stroke:strokeId});dirty=dirty?{x0:Math.min(dirty.x0,b.x0),x1:Math.max(dirty.x1,b.x1),z0:Math.min(dirty.z0,b.z0),z1:Math.max(dirty.z1,b.z1)}:b;}
function paintFrame(){if(!held||!hit||!terrain||working)return;const now=performance.now();if(now-lastPaint<65)return;const dt=Math.min(.12,(now-lastPaint)/1000);lastPaint=now;const amount=held*Number($<HTMLInputElement>('brush-strength').value)*dt;const count=lastStamp?Math.min(32,Math.max(1,Math.ceil(lastStamp.distanceTo(hit)/(radius()*.25)))):1;const from=lastStamp??hit;for(let i=1;i<=count;i++)stamp(from.clone().lerp(hit,i/count),amount);lastStamp=hit.clone();if(dirty)updateMeshes(dirty);dirty=undefined;if(now-lastDressing>300){terrain.placements=scatter(terrain);dispose(sceneryGroup);dress(terrain);lastDressing=now;}drawRing();syncState();}
function endStroke(){if(!held||!terrain)return;held=0;lastStamp=undefined;finishTerrain(terrain);dispose(sceneryGroup);dress(terrain);$('walk').textContent=`${terrain.stats.walkablePercent.toFixed(0)}%`;updatePaintStatus();syncState();$('status').textContent='Paint applied · saved in recipes and terrain exports';}
$('paint-enabled').onchange=()=>{endStroke();paintEnabled=$<HTMLInputElement>('paint-enabled').checked;controls.enabled=!paintEnabled;brushRing.visible=false;$('paint-panel').hidden=!paintEnabled;$('camera-hint').textContent=paintEnabled?'Left hold: increase / Right hold: decrease / Scroll zoom':'Drag orbit / Right-drag pan / Scroll zoom';};
canvas.addEventListener('pointermove',locate);
canvas.addEventListener('pointerdown',e=>{if(!paintEnabled||working||!terrain||![0,2].includes(e.button))return;locate(e);if(!hit)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);held=e.button===0?1:-1;strokeId=(terrain.edits.at(-1)?.stroke??0)+1;strokeTarget=heightAt(terrain,hit.x,hit.z);lastPaint=performance.now()-70;lastStamp=undefined;paintFrame();});
canvas.addEventListener('pointerup',e=>{endStroke();if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);});
canvas.addEventListener('pointercancel',endStroke);window.addEventListener('blur',endStroke);canvas.addEventListener('pointerleave',()=>{if(!held){hit=undefined;brushRing.visible=false;}});
canvas.addEventListener('contextmenu',e=>{if(paintEnabled)e.preventDefault();});
canvas.addEventListener('wheel',e=>{if(!paintEnabled)return;e.preventDefault();const offset=camera.position.clone().sub(controls.target);offset.multiplyScalar(e.deltaY>0?1.08:.92);camera.position.copy(controls.target).add(offset);controls.update();},{passive:false});
$('brush-strength').oninput=()=>{$('brush-strength-value').textContent=Number($<HTMLInputElement>('brush-strength').value).toFixed(2);};
$('brush-feature').onchange=()=>{const f=$<HTMLSelectElement>('brush-feature').value;if(f==='moisture')setMode('wetness');else if(f==='dressing')setMode('density');else if(f==='biome')setMode('biomes');else if(f==='build'||f==='path')setMode('slope');else setMode('beauty');};
$('undo-paint').onclick=()=>{if(!terrain||working||!terrain.edits.length)return;const last=terrain.edits.at(-1)!.stroke;pendingEdits=terrain.edits.filter(e=>e.stroke!==last);generate(terrain.settings);};
$('clear-paint').onclick=()=>{if(!terrain||working)return;pendingEdits=[];generate(terrain.settings);};
animate();generate();
