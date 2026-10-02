import type {PathRig,Settings,Route,Landmark} from './types.ts';

export function validateRig(input:PathRig,p:Settings):PathRig {
  if(!input||input.version!==1||!Array.isArray(input.nodes)||!Array.isArray(input.paths)||input.nodes.length>5000||input.paths.length>256)throw new Error('Invalid path rig');
  const ids=new Set<string>();
  for(const node of input.nodes){
    if(typeof node.id!=='string'||!node.id||ids.has(node.id)||!Number.isFinite(node.x)||!Number.isFinite(node.z)||Math.max(Math.abs(node.x),Math.abs(node.z))>p.worldSize*.47||typeof node.pinned!=='boolean'||(node.anchor!==undefined&&typeof node.anchor!=='string'))throw new Error('Invalid path node');
    ids.add(node.id);
  }
  const paths=new Set<string>();
  let links=0;
  for(const path of input.paths){
    if(typeof path.id!=='string'||paths.has(path.id)||typeof path.gate!=='string'||!Number.isFinite(path.width)||path.width<=0||path.width>p.worldSize*.25||!Array.isArray(path.nodes)||path.nodes.length<2||path.nodes.length>5000||path.nodes.some((id,i)=>!ids.has(id)||(i>0&&id===path.nodes[i-1])))throw new Error('Invalid path links');
    paths.add(path.id);
    links+=path.nodes.length-1;
  }
  if(links>20000)throw new Error('Path rig has too many links');
  if(!input.paths.length)throw new Error('A path rig needs at least one path');
  return structuredClone(input);
}

export function createRig(routes:Route[],landmarks:Landmark[]):PathRig {
  const rig:PathRig={version:1,nodes:[],paths:[]},shared=new Map<string,string>();
  for(const route of routes){
    const nodes=route.points.map(([x,z])=>{
      const key=`${x.toFixed(5)},${z.toFixed(5)}`;
      if(shared.has(key))return shared.get(key)!;
      const anchor=landmarks.find(l=>Math.hypot(l.x-x,l.z-z)<.001)?.id,id=`node_${rig.nodes.length}`;
      rig.nodes.push({id,x,z,pinned:!!anchor,...(anchor?{anchor}:{})});shared.set(key,id);return id;
    });
    rig.paths.push({id:route.id,gate:route.gate,width:route.width,nodes});
  }
  return rig;
}

export function rigRoutes(input:PathRig,p:Settings,landmarks:Landmark[],height:(x:number,z:number)=>number):{rig:PathRig;routes:Route[]} {
  const rig=validateRig(input,p),nodes=new Map(rig.nodes.map(n=>[n.id,n]));
  // POI anchors follow the generated site when scale, seed or resolution changes.
  for(const landmark of landmarks){
    const matches=rig.nodes.filter(n=>n.anchor===landmark.id);
    if(matches.length!==1)throw new Error(`Path rig is missing the ${landmark.name} anchor`);
    Object.assign(matches[0],{x:landmark.x,z:landmark.z,pinned:true});
  }
  for(const node of rig.nodes)if(node.anchor&&!landmarks.some(l=>l.id===node.anchor))throw new Error('Unknown path anchor');
  const adjacent=new Map(rig.nodes.map(n=>[n.id,new Set<string>()]));
  for(const path of rig.paths)for(let i=1;i<path.nodes.length;i++){adjacent.get(path.nodes[i-1])!.add(path.nodes[i]);adjacent.get(path.nodes[i])!.add(path.nodes[i-1]);}
  const start=rig.nodes.find(n=>n.anchor===landmarks[0].id)!.id,seen=new Set([start]),queue=[start];
  for(let i=0;i<queue.length;i++)for(const id of adjacent.get(queue[i])!)if(!seen.has(id)){seen.add(id);queue.push(id);}
  if(rig.nodes.some(n=>n.anchor&&!seen.has(n.id)))throw new Error('Paths must connect every point of interest to the colony');
  return {rig,routes:rig.paths.map(path=>({id:path.id,gate:path.gate,width:Math.max(path.width,p.worldSize/(p.resolution-1)*6),points:path.nodes.map(id=>{const n=nodes.get(id)!;return [n.x,n.z,height(n.x,n.z)];})}))};
}

export function rigInfluence(rig:PathRig,selected:string,radius:number):Map<string,number> {
  if(!Number.isFinite(radius)||radius<=0)throw new Error('Influence radius must be positive');
  const nodes=new Map(rig.nodes.map(n=>[n.id,n])),adj=new Map(rig.nodes.map(n=>[n.id,new Set<string>()]));
  if(!nodes.has(selected))throw new Error('Unknown selected node');
  for(const path of rig.paths)for(let i=1;i<path.nodes.length;i++){adj.get(path.nodes[i-1])!.add(path.nodes[i]);adj.get(path.nodes[i])!.add(path.nodes[i-1]);}
  const distances=new Map([[selected,0]]),visited=new Set<string>(),weights=new Map<string,number>();
  while(true){
    let id:string|undefined,best=Infinity;
    for(const [key,d] of distances)if(!visited.has(key)&&d<best){id=key;best=d;}
    if(id===undefined||best>=radius)break;
    visited.add(id);const node=nodes.get(id)!;
    if(node.pinned)continue;
    const f=1-best/radius;weights.set(id,f*f*(3-2*f));
    for(const other of adj.get(id)!){const target=nodes.get(other)!,distance=best+Math.hypot(node.x-target.x,node.z-target.z);if(distance<(distances.get(other)??Infinity))distances.set(other,distance);}
  }
  return weights;
}

export function dragRig(rig:PathRig,selected:string,dx:number,dz:number,radius:number,worldSize:number):PathRig {
  if(!Number.isFinite(dx)||!Number.isFinite(dz))throw new Error('Invalid path movement');
  const weights=rigInfluence(rig,selected,radius),limit=worldSize*.46;
  return {...rig,nodes:rig.nodes.map(n=>{const w=weights.get(n.id)??0;return w?{...n,x:Math.max(-limit,Math.min(limit,n.x+dx*w)),z:Math.max(-limit,Math.min(limit,n.z+dz*w))}:{...n};}),paths:structuredClone(rig.paths)};
}

export function linkRig(rig:PathRig,from:string,to:string,worldSize:number):PathRig {
  const a=rig.nodes.find(n=>n.id===from),b=rig.nodes.find(n=>n.id===to);
  if(!a||!b||from===to||Math.hypot(a.x-b.x,a.z-b.z)<.01)throw new Error('Choose two distinct path nodes');
  if(rig.paths.some(p=>p.nodes.some((id,i)=>i>0&&((id===from&&p.nodes[i-1]===to)||(id===to&&p.nodes[i-1]===from)))))throw new Error('These nodes are already directly linked');
  const next=structuredClone(rig);let serial=1;while(next.paths.some(p=>p.id===`link_${serial}`))serial++;
  const id=`link_${serial}`,nodes=[from],steps=Math.max(2,Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/(worldSize/64)));
  for(let i=1;i<steps;i++){let key=`${id}_node_${i}`;while(next.nodes.some(n=>n.id===key))key+='_';next.nodes.push({id:key,x:a.x+(b.x-a.x)*i/steps,z:a.z+(b.z-a.z)*i/steps,pinned:false});nodes.push(key);}
  nodes.push(to);next.paths.push({id,gate:'open',width:Math.max(6,worldSize/128),nodes});return next;
}

export function scaleRig(rig:PathRig,ratio:number):PathRig {
  return {...rig,nodes:rig.nodes.map(n=>({...n,x:n.x*ratio,z:n.z*ratio})),paths:rig.paths.map(p=>({...p,nodes:[...p.nodes],width:p.width*ratio}))};
}
