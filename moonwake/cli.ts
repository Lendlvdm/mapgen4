import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {generateTerrain} from './terrain.ts';
import {exportFiles} from './export.ts';
const args=process.argv.slice(2),get=(key:string,fallback:string)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
if(args.includes('--help')) {console.log('node build/moonwake-cli.mjs --size 1024 --resolution 1025 --seed 187 --out exports/nacre [--walkability 0..1] [--recipe recipe.json] [--no-lods]');process.exit(0);}
const recipePath=get('--recipe','');
const input=recipePath?JSON.parse(await readFile(recipePath,'utf8')):{worldSize:Number(get('--size','256')),resolution:Number(get('--resolution','513')),seed:Number(get('--seed','187')),walkability:Number(get('--walkability','0'))};
if(input.schemaVersion!==undefined&&input.schemaVersion!==1) throw new Error('Unsupported recipe schema');
delete input.schemaVersion;
const terrain=generateTerrain(input),out=path.resolve(get('--out','exports/nacre'));
for(const [name,data] of Object.entries(exportFiles(terrain,!args.includes('--no-lods')))){const file=path.join(out,name);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,data);}
console.log(JSON.stringify({output:out,...terrain.stats},null,2));
