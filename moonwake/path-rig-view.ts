import * as THREE from 'three';
import {heightAt} from './terrain.ts';
import {dragRig,linkRig,rigInfluence} from './path-rig.ts';
import type {PathRig,Terrain} from './types.ts';

export class PathRigView {
  enabled=false;
  busy=false;
  linking=false;
  radius=45;
  private terrain?:Terrain;
  private rig?:PathRig;
  private group=new THREE.Group();
  private handles?:THREE.InstancedMesh;
  private lines?:THREE.LineSegments;
  private ray=new THREE.Raycaster();
  private selected?:string;
  private source?:string;
  private weights=new Map<string,number>();
  private drag?:{rig:PathRig;id:string;start:THREE.Vector3;plane:THREE.Plane;moved:boolean};

  constructor(private scene:THREE.Scene,private canvas:HTMLCanvasElement,private camera:THREE.Camera,
    private commit:(rig:PathRig)=>void,private status:(message:string)=>void){
    scene.add(this.group);this.group.visible=false;
    canvas.addEventListener('pointerdown',e=>this.down(e));
    canvas.addEventListener('pointermove',e=>this.move(e));
    canvas.addEventListener('pointerup',e=>this.up(e));
    canvas.addEventListener('pointercancel',()=>this.cancel());
    window.addEventListener('blur',()=>this.cancel());
  }
  snapshot(){return {graph:this.rig,selected:this.selected,linking:this.linking,weights:Object.fromEntries(this.weights),project:(id:string)=>{
    const n=this.rig!.nodes.find(n=>n.id===id)!;
    const p=new THREE.Vector3(n.x,heightAt(this.terrain!,n.x,n.z)+this.terrain!.settings.worldSize*.006,n.z).project(this.camera),r=this.canvas.getBoundingClientRect();
    return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};
  }};}
  setTerrain(t:Terrain){this.terrain=t;this.rig=structuredClone(t.pathRig);this.drag=undefined;this.source=undefined;this.weights.clear();this.rebuild();}
  setEnabled(enabled:boolean){this.cancel();this.enabled=enabled;this.group.visible=enabled;this.source=undefined;this.draw();}
  setLinking(enabled:boolean){this.cancel();this.linking=enabled;this.source=undefined;this.status(enabled?'Click the first node, then the node to link it to.':'Drag a blue node. Gold nodes anchor the points of interest.');}
  private point(e:PointerEvent){const r=this.canvas.getBoundingClientRect();this.ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2),this.camera);}
  private down(e:PointerEvent){
    if(!this.enabled||this.busy||e.button!==0||!this.rig||!this.terrain||!this.handles)return;
    this.point(e);const hit=this.ray.intersectObject(this.handles)[0];if(hit?.instanceId===undefined)return;
    const node=this.rig.nodes[hit.instanceId];this.selected=node.id;e.preventDefault();
    if(this.linking){
      if(!this.source){this.source=node.id;this.status('Now click the second node.');this.draw();return;}
      try{const rig=linkRig(this.rig,this.source,node.id,this.terrain.settings.worldSize);this.source=undefined;this.rig=rig;this.rebuild();this.commit(rig);}catch(error){this.status((error as Error).message);this.source=undefined;}
      return;
    }
    if(node.pinned){this.status('This node anchors a point of interest. Drag a neighboring blue node.');this.draw();return;}
    const y=heightAt(this.terrain,node.x,node.z),plane=new THREE.Plane(new THREE.Vector3(0,1,0),-y),start=this.ray.ray.intersectPlane(plane,new THREE.Vector3());
    if(!start)return;
    this.weights=rigInfluence(this.rig,node.id,this.radius);
    this.drag={rig:structuredClone(this.rig),id:node.id,start,plane,moved:false};this.canvas.setPointerCapture(e.pointerId);this.draw();
  }
  private move(e:PointerEvent){
    if(!this.drag||!this.terrain||this.busy)return;
    this.point(e);const point=this.ray.ray.intersectPlane(this.drag.plane,new THREE.Vector3());if(!point)return;
    const dx=point.x-this.drag.start.x,dz=point.z-this.drag.start.z;
    this.drag.moved=Math.hypot(dx,dz)>.01;
    this.rig=dragRig(this.drag.rig,this.drag.id,dx,dz,this.radius,this.terrain.settings.worldSize);this.draw();
    this.status('Connected nodes follow with distance falloff. Release to shape the terrain.');
  }
  private up(e:PointerEvent){
    if(!this.drag)return;
    const moved=this.drag.moved;this.drag=undefined;
    if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);
    if(moved&&this.rig)this.commit(this.rig);
  }
  private cancel(){if(this.drag){this.rig=this.drag.rig;this.drag=undefined;this.draw();}}
  private rebuild(){
    this.handles?.geometry.dispose();(this.handles?.material as THREE.Material|undefined)?.dispose();
    this.lines?.geometry.dispose();(this.lines?.material as THREE.Material|undefined)?.dispose();this.group.clear();
    if(!this.rig||!this.terrain)return;
    const size=this.terrain.settings.worldSize;
    this.handles=new THREE.InstancedMesh(new THREE.SphereGeometry(size*.004,8,6),new THREE.MeshBasicMaterial({depthTest:false}),this.rig.nodes.length);
    this.handles.renderOrder=21;this.handles.frustumCulled=false;this.group.add(this.handles);
    const edges=this.rig.paths.reduce((sum,p)=>sum+p.nodes.length-1,0),geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(edges*6),3));
    this.lines=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:'#72d9ed',depthTest:false,transparent:true,opacity:.8}));this.lines.renderOrder=20;this.lines.frustumCulled=false;this.group.add(this.lines);this.draw();
  }
  private draw(){
    if(!this.rig||!this.terrain||!this.handles||!this.lines)return;
    const lift=this.terrain.settings.worldSize*.006,positions=new Map<string,THREE.Vector3>(),matrix=new THREE.Matrix4();
    this.rig.nodes.forEach((node,i)=>{
      const p=new THREE.Vector3(node.x,heightAt(this.terrain!,node.x,node.z)+lift,node.z);positions.set(node.id,p);matrix.makeTranslation(p.x,p.y,p.z);this.handles!.setMatrixAt(i,matrix);
      const weight=this.weights.get(node.id)??0,color=node.pinned?new THREE.Color('#efbf80'):new THREE.Color('#50c7e3').lerp(new THREE.Color('#fff0b0'),weight);
      if(node.id===this.selected||node.id===this.source)color.set('#ffffff');this.handles!.setColorAt(i,color);
    });
    this.handles.instanceMatrix.needsUpdate=true;if(this.handles.instanceColor)this.handles.instanceColor.needsUpdate=true;
    this.handles.computeBoundingSphere();
    const attribute=this.lines.geometry.getAttribute('position');let at=0;
    for(const path of this.rig.paths)for(let i=1;i<path.nodes.length;i++)for(const id of [path.nodes[i-1],path.nodes[i]]){const p=positions.get(id)!;attribute.setXYZ(at++,p.x,p.y,p.z);}attribute.needsUpdate=true;
  }
}
