import {generateTerrain} from './terrain.ts';
import {exportZip} from './export.ts';
import type {Terrain} from './types.ts';
let terrain:Terrain|undefined;
self.onmessage=(event:MessageEvent)=>{
  try {
    if(event.data.type==='generate') {terrain=generateTerrain(event.data.settings);self.postMessage({type:'terrain',terrain});}
    else if(event.data.type==='export') {
      if(!terrain) throw new Error('Generate terrain before exporting');
      const bytes=exportZip(terrain,event.data.lods!==false);
      (self as any).postMessage({type:'export',bytes},[bytes.buffer]);
    }
  } catch(error) {self.postMessage({type:'error',message:error instanceof Error?error.message:String(error)});}
};
