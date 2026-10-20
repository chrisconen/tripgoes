import {readFile} from 'node:fs/promises';
// Supply secrets through the process environment; never put them in argv or URLs.
const [action,file]=process.argv.slice(2);
if(!['ingest','withdraw','status'].includes(action))throw Error('Usage: node backend/admin.mjs ingest|withdraw FILE.json, or status');
const base=new URL(process.env.TRIPGOES_API_URL||'');
if(base.username||base.password||base.search||base.hash||!(base.protocol==='https:'||(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname))))throw Error('API URL must use HTTPS (loopback excepted).');
const token=process.env.TRIPGOES_INGEST_TOKEN;
if(!token||token.length<32)throw Error('Set TRIPGOES_INGEST_TOKEN in the process environment.');
let payload;
if(action!=='status'){
 payload=await readFile(file);if(payload.byteLength>65536)throw Error('Import exceeds 64 KiB.');JSON.parse(payload.toString('utf8'));
}
const result=await fetch(new URL(`/v1/admin/${action}`,base),{method:action==='status'?'GET':'POST',headers:{Authorization:`Bearer ${token}`,...(payload?{'Content-Type':'application/json'}:{})},body:payload,redirect:'error',signal:AbortSignal.timeout(15000)});
const data=await result.json();
// Print only the API's defined operational fields, never arbitrary reflected input.
console.log(JSON.stringify({status:result.status,code:data.error?.code,requestId:data.error?.requestId,batchId:data.batchId,accepted:data.accepted,replayed:data.replayed,counts:data.counts,lastExpiryRun:data.lastExpiryRun}));
if(!result.ok)process.exitCode=1;
