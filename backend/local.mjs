import http from 'node:http';
import {readFileSync,mkdirSync,existsSync} from 'node:fs';
import {Readable} from 'node:stream';
import {createSqlite} from './sqlite.mjs';
import worker from './worker.mjs';

mkdirSync('.tmp/backend',{recursive:true});
const DB=createSqlite('.tmp/backend/local.sqlite');
DB.exec(readFileSync(new URL('./migrations/0001_initial.sql',import.meta.url),'utf8'));
DB.exec(readFileSync(new URL('./migrations/0002_flight_cache.sql',import.meta.url),'utf8'));
const config=existsSync('.tmp/backend/local-config.json')?JSON.parse(readFileSync('.tmp/backend/local-config.json','utf8')):{};
const env={DB,ALLOWED_ORIGINS:'http://127.0.0.1:4173,http://localhost:4173',SOURCES_JSON:'[]',...config,INGEST_TOKEN:process.env.TRIPGOES_INGEST_TOKEN||config.INGEST_TOKEN||''};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:8787');
  const request=new Request(url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Readable.toWeb(req),duplex:'half'})});
  const result=await worker.fetch(request,env);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
 }catch{res.writeHead(503,{'Content-Type':'application/json'}).end('{"error":{"code":"local_server_error"}}')}
});
server.listen(8787,'127.0.0.1',()=>console.log('TripGoes local API: http://127.0.0.1:8787/v1/health'));
process.on('SIGINT',()=>server.close(()=>{DB.close();process.exit(0)}));
