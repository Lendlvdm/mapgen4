import {zlibSync,zipSync,strToU8} from 'fflate';
import {BIOMES,recipe,type Terrain} from './types.ts';
export interface MeshData {positions:Float32Array;normals:Float32Array;colors:Float32Array;indices:Uint32Array;origin:[number,number,number];}
export function chunkMesh(t:Terrain,cx:number,cz:number,cells=64,stride=1):MeshData {
  const n=t.settings.resolution,step=t.settings.worldSize/(n-1),count=cells/stride+1;
  if(cells%stride||cx<0||cz<0||cx*cells+cells>n-1||cz*cells+cells>n-1) throw new Error('Invalid chunk extent or stride');
  const origin:[number,number,number]=[cx*cells*step-t.settings.worldSize/2,0,cz*cells*step-t.settings.worldSize/2];
  const positions=new Float32Array(count*count*3),normals=new Float32Array(count*count*3),colors=new Float32Array(count*count*3),indices=new Uint32Array((count-1)**2*6);
  for(let z=0;z<count;z++) for(let x=0;x<count;x++) {
    const source=(cz*cells+z*stride)*n+cx*cells+x*stride,i=(z*count+x)*3;
    positions.set([x*stride*step,t.heights[source],z*stride*step],i);
    normals.set(t.normals.subarray(source*3,source*3+3),i);colors.set(t.colors.subarray(source*3,source*3+3),i);
  }
  let at=0;for(let z=0;z<count-1;z++) for(let x=0;x<count-1;x++) {const a=z*count+x,b=a+1,c=a+count,d=c+1;indices.set([a,c,b,b,c,d],at);at+=6;}
  return {positions,normals,colors,indices,origin};
}
export function glb(m:MeshData,name:string):Uint8Array {
  const arrays=[m.positions,m.normals,m.colors,m.indices],offsets:number[]=[];let offset=0;
  for(const a of arrays){offsets.push(offset);offset+=a.byteLength;}
  const bounds=(fn:(a:number,b:number)=>number,start:number)=>[0,1,2].map(c=>{let v=start;for(let i=c;i<m.positions.length;i+=3)v=fn(v,m.positions[i]);return v;});
  const doc={asset:{version:'2.0',generator:'Moonwake Mapgen4 terrain exporter'},scene:0,scenes:[{nodes:[0]}],nodes:[{name,mesh:0,translation:m.origin}],meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1,COLOR_0:2},indices:3,material:0,mode:4}]}],materials:[{name:'Nacre vertex color',pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:.95},doubleSided:false}],buffers:[{byteLength:offset}],bufferViews:arrays.map((a,i)=>({buffer:0,byteOffset:offsets[i],byteLength:a.byteLength,target:i===3?34963:34962})),accessors:arrays.map((a,i)=>({bufferView:i,componentType:i===3?5125:5126,count:i===3?a.length:a.length/3,type:i===3?'SCALAR':'VEC3',...(i===0?{min:bounds(Math.min,Infinity),max:bounds(Math.max,-Infinity)}:{})}))};
  const json=strToU8(JSON.stringify(doc)),padded=(json.length+3)&~3,total=12+8+padded+8+offset,result=new Uint8Array(total),view=new DataView(result.buffer);
  view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,total,true);view.setUint32(12,padded,true);view.setUint32(16,0x4e4f534a,true);result.fill(32,20,20+padded);result.set(json,20);
  view.setUint32(20+padded,offset,true);view.setUint32(24+padded,0x004e4942,true);
  for(let i=0;i<arrays.length;i++) result.set(new Uint8Array(arrays[i].buffer,arrays[i].byteOffset,arrays[i].byteLength),28+padded+offsets[i]);
  return result;
}
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes:Uint8Array){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function pngChunk(type:string,data:Uint8Array){const a=new Uint8Array(data.length+12),v=new DataView(a.buffer);v.setUint32(0,data.length);a.set(strToU8(type),4);a.set(data,8);v.setUint32(a.length-4,crc(a.subarray(4,a.length-4)));return a;}
export function png(width:number,height:number,pixels:Uint8Array,channels=1,bits=8):Uint8Array {
  const rowBytes=width*channels*bits/8;
  if(pixels.length!==rowBytes*height) throw new Error('PNG data size mismatch');
  const header=new Uint8Array(13),v=new DataView(header.buffer);v.setUint32(0,width);v.setUint32(4,height);header[8]=bits;header[9]=channels===4?6:channels===3?2:0;
  const raw=new Uint8Array((rowBytes+1)*height);for(let y=0;y<height;y++)raw.set(pixels.subarray(y*rowBytes,(y+1)*rowBytes),y*(rowBytes+1)+1);
  const parts=[new Uint8Array([137,80,78,71,13,10,26,10]),pngChunk('IHDR',header),pngChunk('IDAT',zlibSync(raw)),pngChunk('IEND',new Uint8Array())];
  const out=new Uint8Array(parts.reduce((s,a)=>s+a.length,0));let at=0;for(const part of parts){out.set(part,at);at+=part.length;}return out;
}
export function exportFiles(t:Terrain,includeLods=true):Record<string,Uint8Array> {
  const n=t.settings.resolution,min=t.stats.minHeight,max=t.stats.maxHeight,span=Math.max(.0001,max-min),files:Record<string,Uint8Array>={},chunks:any[]=[];
  const raw=new Uint8Array(n*n*2),big=new Uint8Array(n*n*2),float=new Uint8Array(n*n*4),rv=new DataView(raw.buffer),bv=new DataView(big.buffer),fv=new DataView(float.buffer);
  for(let i=0;i<n*n;i++) {const v=Math.round((t.heights[i]-min)/span*65535);rv.setUint16(i*2,v,true);bv.setUint16(i*2,v,false);fv.setFloat32(i*4,t.heights[i],true);}
  files['height/height.f32']=float;files['height/height.r16']=raw;files['height/height-16bit.png']=png(n,n,big,1,16);
  files['masks/biome-weights.png']=png(n,n,t.biomeWeights,4);files['masks/biome-id.png']=png(n,n,t.biomeIds);
  files['masks/walkable.png']=png(n,n,t.walkable);files['masks/buildable.png']=png(n,n,t.buildable);files['masks/routes.png']=png(n,n,Uint8Array.from(t.routeMask,(v,i)=>v||t.pathPaint[i]>.25?255:0));
  files['masks/slope-degrees.png']=png(n,n,Uint8Array.from(t.slopes,x=>Math.round(x)));files['masks/moisture.png']=png(n,n,Uint8Array.from(t.moisture,x=>Math.round(255*x)));
  files['masks/dressing.png']=png(n,n,Uint8Array.from(t.dressing,v=>Math.round(v*255)));
  files['masks/painted-build.png']=png(n,n,Uint8Array.from(t.buildPaint,v=>Math.round(v*255)));
  const side=(n-1)/64;
  for(let z=0;z<side;z++) for(let x=0;x<side;x++) {
    const variants=[];
    for(const stride of includeLods?[1,2,4]:[1]) {
      const data=chunkMesh(t,x,z,64,stride),path=`terrain/lod${Math.log2(stride)}/tile_${x}_${z}.glb`;
      files[path]=glb(data,`Nacre_${x}_${z}_LOD${Math.log2(stride)}`);
      variants.push({path,stride,vertices:data.positions.length/3,triangles:data.indices.length/3});
    }
    chunks.push({x,z,origin:chunkMesh(t,x,z,64,4).origin,variants});
  }
  const json=(o:unknown)=>strToU8(JSON.stringify(o,null,2));
  files['recipe.json']=json(recipe(t));files['placements.json']=json({schemaVersion:1,units:'metres',axis:'Y up, north -Z',placements:t.placements,landmarks:t.landmarks,routes:t.routes});
  files['manifest.json']=json({schemaVersion:1,generator:'moonwake-mapgen-0.2.0',upstream:'redblobgames/mapgen4@c1d8cb018a11a8b9e17d59233c36c176429d37eb',settings:t.settings,dimensions:{width:n,height:n,worldSizeMetres:t.settings.worldSize,sampleSpacingMetres:t.settings.worldSize/(n-1),originXZ:[-t.settings.worldSize/2,-t.settings.worldSize/2],axis:'Y up; north -Z; row zero is north; row-major index=z*width+x'},height:{minimumMetres:min,maximumMetres:max,r16Formula:'height = minimumMetres + uint16 / 65535 * (maximumMetres - minimumMetres)',rawByteOrder:'little-endian',pngBitDepth:16,floatFormat:'IEEE754 float32 little-endian, absolute metres'},biomes:BIOMES,biomeChannels:'R Basin, G Glasswood, B Scar, A Choir. All 4 are data; sum=255. Alpha is not transparency.',editCount:t.edits.length,masks:{dressing:'uint8 0-255 local scenery density',paintedBuild:'uint8 0-255 painted build reservation; see buildable for slope filtering',walkable:'0/255; local incident-edge slopes <=30 degrees; no connectivity or prop-collision guarantee',buildable:'0/255; basin reserve, slope <5 degrees, no protected route or relay site; no ward/footprint validation',slope:'uint8 whole degrees 0–90',routes:'0/255 protected authored route corridors; gates are metadata only',moisture:'uint8 0–255'},stats:{...t.stats,generationMs:undefined},chunks,lodPolicy:'Use one uniform LOD level across adjacent tiles. Mixed LOD needs runtime stitching or skirts; not supplied.',collision:'Render geometry can be used to author static concave terrain collision. Collision is not embedded in GLB.',limitations:['Heightfield cannot encode caves or true overhangs.','Scenery placements are proxies, not finished assets.','Route unlocks and biome hazards are metadata, not implemented gameplay.']});
  files['README.txt']=strToU8('MOONWAKE TERRAIN EXPORT\nRead manifest.json before import. GLB roots already include chunk translations; do not apply the origin twice. World units are metres, Y up, north -Z. Height samples are row-major north to south. Float32 is authoritative; PNG/R16 are normalized 16-bit alternatives. Biome alpha is a fourth weight, not transparency. Use one uniform LOD until stitching is implemented. Proxy objects are in placements.json, not embedded in terrain. Navigation/physics/ward validation remain game work.\nGenerated with a Moonwake fork of Red Blob Games Mapgen4 (Apache-2.0).\n');
  return files;
}
export function exportZip(t:Terrain,includeLods=true) {return zipSync(exportFiles(t,includeLods),{level:3});}
