import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve('dist');
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.txt':'text/plain'};
http.createServer(async(req,res)=>{
  try {
    let path=resolve(root, '.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403).end();return;}
    if((await stat(path)).isDirectory())path=resolve(path,'index.html');
    res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'});
    res.end(await readFile(path));
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}).end('404 — TripGoes');}
}).listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173/hu/'));
