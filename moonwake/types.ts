export type Vec2 = [number, number];
export interface Settings {
  seed: number; worldSize: number; resolution: number; relief: number;
  terrace: number; moisture: number; detail: number; vegetation: number; walkability: number; generation: number;
}
export const DEFAULTS: Settings = {seed: 187, worldSize: 256, resolution: 513, relief: 1, terrace: 0.82, moisture: 0.7, detail: 0.65, vegetation: 0.7, walkability: 0, generation: 2};
export const BIOMES = [
  {id: 0, name: 'Hearthfall Basin', color: '#9c8da9'},
  {id: 1, name: 'Glasswood', color: '#477e83'},
  {id: 2, name: 'Sundered Scar', color: '#a26754'},
  {id: 3, name: 'Silent Choir', color: '#c9c3ce'},
];
export interface Route {id: string; gate: string; points: [number, number, number][]; width: number;}
export interface Landmark {id: string; kind: string; name: string; x: number; z: number; y: number; radius: number; faction?: 'neutral'|'enemy';}
export interface Placement {id: string; kind: 'crystal_tree'|'crystal'|'rock'|'monolith'|'vent'|'mooncap'; biome: number; x:number;y:number;z:number;scale:number;yaw:number;}
export type BrushFeature = 'cliff'|'blend'|'path'|'build'|'biome'|'dressing'|'moisture';
export interface BrushStroke {feature:BrushFeature;x:number;z:number;radius:number;amount:number;biome:number;target:number;stroke:number;blendPaths?:boolean;}
export interface Bounds {x0:number;z0:number;x1:number;z1:number;}
export interface Terrain {
  edits: BrushStroke[]; baseHeights:Float32Array; protectedMask:Uint8Array; accessMask:Uint8Array;
  pathPaint:Float32Array; buildPaint:Float32Array; dressing:Float32Array;
  settings: Settings; heights: Float32Array; moisture: Float32Array;
  biomeWeights: Uint8Array; biomeIds: Uint8Array; slopes: Float32Array;
  walkable: Uint8Array; buildable: Uint8Array; routeMask: Uint8Array;
  colors: Float32Array; normals: Float32Array; routes: Route[]; landmarks: Landmark[];
  placements: Placement[]; stats: {minHeight:number;maxHeight:number;walkablePercent:number;buildablePercent:number;triangles:number;graphRegions:number;generationMs:number};
}
export function settings(input: Partial<Settings> = {}): Settings {
  const p={...DEFAULTS,...input};
  for(const [key,value] of Object.entries(p)) if(typeof value!=='number'||!Number.isFinite(value)) throw new Error(`${key} must be a finite number`);
  if(!Number.isInteger(p.seed)||p.seed<0||p.seed>2147483647) throw new Error('Seed must be an integer from 0 to 2147483647');
  if(![256,512,1024,2048,4096].includes(p.worldSize)) throw new Error('World size must be 256, 512, 1024, 2048 or 4096 metres');
  if(![1,2].includes(p.generation)) throw new Error('Unsupported generator version');
  if(![129,257,513,1025].includes(p.resolution)) throw new Error('Resolution must be 129, 257, 513 or 1025 samples');
  if(p.relief<0.5||p.relief>1.5) throw new Error('Relief must be between 0.5 and 1.5');
  for(const key of ['terrace','moisture','detail','vegetation','walkability'] as const) if(p[key]<0||p[key]>1) throw new Error(`${key} must be from 0 to 1`);
  return p;
}

export function parseRecipe(input:any):{settings:Settings;edits:BrushStroke[]} {
  if(!input||![1,2].includes(input.schemaVersion))throw new Error('Unsupported recipe schema');
  const {schemaVersion,edits=[],...values}=input;
  const p=settings({...values,generation:values.generation??(schemaVersion===1?1:2)});
  if(!Array.isArray(edits)||edits.length>100000)throw new Error('Recipe edit limit exceeded');
  return {settings:p,edits:edits.map(e=>validateStroke(e,p))};
}
export function validateStroke(e:BrushStroke,p:Settings):BrushStroke {
  if(!e||!['cliff','blend','path','build','biome','dressing','moisture'].includes(e.feature))throw new Error('Invalid brush feature');
  for(const key of ['x','z','radius','amount','biome','target','stroke'] as const)if(!Number.isFinite(e[key]))throw new Error('Invalid brush data');
  if(e.blendPaths!==undefined&&typeof e.blendPaths!=='boolean')throw new Error('Invalid blend path setting');
  if(Math.abs(e.x)>p.worldSize/2||Math.abs(e.z)>p.worldSize/2||e.radius<=0||e.radius>p.worldSize/2||Math.abs(e.amount)>1||Math.abs(e.target)>p.worldSize*4||!Number.isInteger(e.biome)||e.biome<0||e.biome>3||!Number.isInteger(e.stroke)||e.stroke<0)throw new Error('Brush values outside supported range');
  return {...e};
}
export function recipe(t:Terrain){return {schemaVersion:2,...t.settings,edits:t.edits};}
