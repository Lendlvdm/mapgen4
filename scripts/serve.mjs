import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(),port=Number(process.env.PORT||5174);
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.svg':'image/svg+xml','.data':'application/octet-stream'};
http.createServer((req,res)=>{
  let file;try {file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));} catch {res.writeHead(400).end();return;}
  if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403).end();return;}
  if(file===root) file=path.join(root,'moonwake.html');
  // Serve only the app, built bundles, original demo and visual reference.
  const rel=path.relative(root,file).replaceAll('\\','/');
  if(!['moonwake.html','embed.html'].includes(rel)&&!rel.startsWith('build/')&&!rel.startsWith('moonwake/reference/')){res.writeHead(404).end('Not found');return;}
  fs.stat(file,(e,st)=>{if(e||!st.isFile()){res.writeHead(404).end('Not found');return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});fs.createReadStream(file).pipe(res);});
}).listen(port,'127.0.0.1',()=>console.log(`Moonwake studio: http://127.0.0.1:${port}`));
