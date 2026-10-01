import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {DEFAULTS,BIOMES,settings,type Settings,type Terrain} from './types.ts';
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
let terrain:Terrain|undefined,mode='beauty',working=false;
const worker=new Worker(new URL('./moonwake-worker.js',import.meta.url),{type:'module'});
function busy(message:string|false) {working=!!message;$('busy').hidden=!message;if(message)$('busy').textContent=message;for(const id of ['generate','export','load-recipe','save-recipe'])$<HTMLButtonElement>(id).disabled=!!message||(!terrain&&id!=='generate');}
function formatControl(key:string,value:number){return key==='walkability'?`${Math.round(value*100)}%`:value.toFixed(2);}
function readSettings():Settings {const p={...DEFAULTS};for(const key of ['seed','resolution','relief','terrace','detail','moisture','vegetation','walkability'] as const)p[key]=Number($<HTMLInputElement>(key).value);p.worldSize=Number($<HTMLSelectElement>('preset').value);return settings(p);}
function spacing(){const p=readSettings();$('spacing').textContent=`${(p.worldSize/(p.resolution-1)).toFixed(2)} m between height samples`;}
function generate(){try{$('error').textContent='';const p=readSettings();busy('Shaping cliffs, grading routes and growing the biomes…');$('status').textContent='Generating landscape…';worker.postMessage({type:'generate',settings:p});}catch(e){fail(e);}}
function fail(e:unknown){busy(false);$('error').textContent=e instanceof Error?e.message:String(e);$('status').textContent='Needs attention';}
worker.onerror=e=>fail(e.message);
worker.onmessage=e=>{
  if(e.data.type==='error'){fail(e.data.message);return;}
  if(e.data.type==='terrain') {terrain=e.data.terrain;try{rebuild(terrain!);busy(false);$('status').textContent=`Seed ${terrain!.settings.seed} · ready in ${(terrain!.stats.generationMs/1000).toFixed(1)}s`;document.body.dataset.ready='true';(window as any).__moonwake={settings:terrain!.settings,stats:terrain!.stats,placements:terrain!.placements.length};}catch(err){fail(err);}}
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
  dress(t);setMode(mode);home();
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
    }else{
      const ring=new THREE.Mesh(new THREE.TorusGeometry(l.id==='relay_choir'?5:2.8,.22,6,36),copper);ring.position.y=l.id==='relay_choir'?7:4;root.add(ring);
      const orb=new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),glow);orb.position.copy(ring.position);root.add(orb);
      if(l.id==='relay_choir') for(const x of [-8,8]){const tower=new THREE.Mesh(new THREE.CylinderGeometry(.9,1.5,18,5),ivory);tower.position.set(x,9,-2);root.add(tower);}
    }
    root.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});
  }
}
function home(){if(!terrain)return;const w=terrain.settings.worldSize;camera.position.set(w*.17,w*.94,w*1.08);controls.target.set(0,w*.065,0);controls.minDistance=w*.03;controls.maxDistance=w*3;camera.far=w*8;camera.updateProjectionMatrix();controls.update();sun.position.set(-w*.3,w*.8,w*.3);sun.target.position.set(0,0,0);const sc=sun.shadow.camera;sc.left=sc.bottom=-w*.7;sc.right=sc.top=w*.7;sc.near=1;sc.far=w*3;sc.updateProjectionMatrix();scene.fog=new THREE.FogExp2('#747185',.32/w);}
function setMode(next:string){mode=next;if(!terrain)return;const t=terrain,n=t.settings.resolution;
  for(const o of terrainGroup.children){const mesh=o as THREE.Mesh,g=mesh.geometry,colors=g.getAttribute('color'),{x:cx,z:cz}=mesh.userData;for(let z=0;z<65;z++)for(let x=0;x<65;x++){
    const k=(cz*64+z)*n+cx*64+x,i=z*65+x;
    if(mode==='beauty')colors.setXYZ(i,t.colors[k*3],t.colors[k*3+1],t.colors[k*3+2]);
    else if(mode==='biomes'){const c=new THREE.Color(BIOMES[t.biomeIds[k]].color);colors.setXYZ(i,c.r,c.g,c.b);}
    else {const c=t.buildable[k]?[.72,.58,.18]:t.routeMask[k]?[.65,.65,.7]:t.walkable[k]?[.12,.4,.3]:[.47,.12,.16];colors.setXYZ(i,c[0],c[1],c[2]);}
  }colors.needsUpdate=true;}
  for(const id of ['beauty','biomes','slope'])$(id).classList.toggle('active',id===next);
  $('status').textContent=next==='slope'?'Green: slope-pass · Gold: build candidate · Pale: route · Red: steep/boundary':`Seed ${t.settings.seed} · ${next==='biomes'?'four biome regions':'landscape preview'}`;
}
function download(data:Uint8Array|string,name:string,type:string){const blob=new Blob([data as BlobPart],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
$('generate').onclick=generate;
for(const key of ['relief','terrace','detail','moisture','vegetation','walkability'])$<HTMLInputElement>(key).oninput=()=>{$(`${key}-value`).textContent=formatControl(key,Number($<HTMLInputElement>(key).value));$('status').textContent='Settings changed · generate to apply';};
for(const key of ['preset','resolution'])$(key).onchange=()=>{try{spacing();$('status').textContent='Settings changed · generate to apply';}catch(e){fail(e);}};
for(const key of ['beauty','biomes','slope'])$(key).onclick=()=>setMode(key);
$('home').onclick=home;$('top').onclick=()=>{if(!terrain)return;const w=terrain.settings.worldSize;camera.position.set(0,w*1.55,.001);controls.target.set(0,0,0);controls.update();};
$('scenery').onclick=()=>{sceneryGroup.visible=!sceneryGroup.visible;$('scenery').textContent=sceneryGroup.visible?'Hide dressing':'Show dressing';};
$('export').onclick=()=>{if(!terrain||working)return;busy('Packing height maps, biome data and terrain tiles…');$('status').textContent='Exporting terrain…';worker.postMessage({type:'export',lods:$<HTMLInputElement>('lods').checked});};
$('save-recipe').onclick=()=>{if(terrain)download(JSON.stringify({schemaVersion:1,...terrain.settings},null,2),`nacre-recipe-${terrain.settings.seed}.json`,'application/json');};
$('load-recipe').onclick=()=>$<HTMLInputElement>('recipe-file').click();
$<HTMLInputElement>('recipe-file').onchange=async e=>{try{const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;const input=JSON.parse(await file.text());if(input.schemaVersion!==1)throw new Error('Unsupported recipe schema');delete input.schemaVersion;const p=settings(input);$<HTMLSelectElement>('preset').value=String(p.worldSize);for(const key of ['seed','resolution','relief','terrace','detail','moisture','vegetation','walkability'] as const){$<HTMLInputElement>(key).value=String(p[key]);if($(`${key}-value`))$(`${key}-value`).textContent=formatControl(key,p[key]);}spacing();generate();}catch(err){fail(err);}finally{$<HTMLInputElement>('recipe-file').value='';}};
$('snapshot').onclick=()=>{renderer.render(scene,camera);canvas.toBlob(blob=>{if(!blob)return;blob.arrayBuffer().then(a=>download(new Uint8Array(a),'nacre-preview.png','image/png'));});};
function animate(){requestAnimationFrame(animate);const w=canvas.clientWidth,h=canvas.clientHeight;if(canvas.width!==Math.floor(w*renderer.getPixelRatio())||canvas.height!==Math.floor(h*renderer.getPixelRatio())){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}controls.update();renderer.render(scene,camera);}
animate();generate();
