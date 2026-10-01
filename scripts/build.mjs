import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
await mkdir('build',{recursive:true});
await build({entryPoints:['moonwake/app.ts'],bundle:true,outfile:'build/moonwake.js',format:'esm',sourcemap:true});
await build({entryPoints:['moonwake/worker.ts'],bundle:true,outfile:'build/moonwake-worker.js',format:'esm',sourcemap:true});
await build({entryPoints:['moonwake/cli.ts'],bundle:true,outfile:'build/moonwake-cli.mjs',platform:'node',format:'esm'});
await build({entryPoints:['tests/terrain.test.ts'],bundle:true,outfile:'build/terrain.test.mjs',platform:'node',format:'esm'});
// Preserve the original paintable Mapgen4 demo with a cross-platform build.
await build({entryPoints:['generate-points-file.ts'],bundle:true,outfile:'build/_generate-points-file.mjs',platform:'node',format:'esm'});
await import('../build/_generate-points-file.mjs');
await build({entryPoints:['mapgen4.ts'],bundle:true,outfile:'build/_bundle.js',sourcemap:true});
await build({entryPoints:['worker.ts'],bundle:true,outfile:'build/_worker.js',sourcemap:true});
console.log('Built Moonwake studio, CLI, tests, and original Mapgen4 demo.');
