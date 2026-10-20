import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSqlite} from '../backend/sqlite.mjs';
import worker,{handleRequest,expireOffers} from '../backend/worker.mjs';

const now=Date.parse('2026-10-20T12:00:00.000Z');
const token='test-only-token-not-for-production-1234567890';
const source={id:'example',name:'Example source',kind:'editorial',allowedHosts:['travel.example.com'],maxAgeMinutes:120,enabled:true};
function setup(){
 const DB=createSqlite(':memory:');DB.exec(readFileSync(new URL('../backend/migrations/0001_initial.sql',import.meta.url),'utf8'));
 return {DB,INGEST_TOKEN:token,SOURCES_JSON:JSON.stringify([source]),ALLOWED_ORIGINS:'https://tripgoes.com'};
}
const offer=(changes={})=>({externalId:'route-1',title:'Budapest to Tokyo',origin:'Budapest',destination:'東京',departureDate:'2026-11-10',returnDate:'2026-11-17',travelers:2,currency:'EUR',totalPriceMinor:65000,inclusions:'Return flight and mandatory fees; no checked bag',bookingUrl:'https://travel.example.com/offers/tokyo',observedAt:'2026-10-20T11:30:00.000Z',expiresAt:'2026-10-20T13:00:00.000Z',...changes});
const batch=(changes={})=>({sourceId:'example',batchId:'batch-1',offers:[offer()],...changes});
async function request(env,path='/v1/offers',{method='GET',body,auth=false,origin,headers={}}={},time=now){
 if(auth)headers.Authorization=`Bearer ${token}`;
 if(origin)headers.Origin=origin;
 if(body!==undefined)headers['Content-Type']='application/json';
 const req=new Request('https://api.tripgoes.com'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 return handleRequest(req,env,time);
}
const ingest=(env,value=batch())=>request(env,'/v1/admin/ingest',{method:'POST',body:value,auth:true});

test('API starts with empty real inventory, healthy storage and no fake offers',async()=>{
 const env=setup();env.SOURCES_JSON='[]';
 assert.equal((await request(env,'/v1/health')).status,200);
 assert.deepEqual((await (await request(env)).json()).offers,[]);
 env.DB.close();
});
test('authenticated ingest persists observations and public source provenance',async()=>{
 const env=setup();assert.equal((await ingest(env)).status,201);
 const res=await request(env);const data=await res.json();
 assert.equal(data.offers.length,1);assert.equal(data.offers[0].destination,'東京');
 assert.equal(data.offers[0].totalPriceMinor,65000);assert.equal(data.offers[0].source.kind,'editorial');
 assert.equal(res.headers.get('cache-control'),'no-store');
 const history=await (await request(env,`/v1/offers/${data.offers[0].id}/history`)).json();
 assert.equal(history.history.length,1);assert.equal(history.basis,'per_person');env.DB.close();
});
test('idempotency replays without duplicates and conflicts on changed payload',async()=>{
 const env=setup();await ingest(env);
 assert.equal((await ingest(env)).status,200);
 assert.equal((await ingest(env,batch({offers:[offer({totalPriceMinor:66000})]}))).status,409);
 assert.equal((await request(env,'/v1/admin/status',{auth:true})).status,200);
 assert.equal((await env.DB.prepare('SELECT count(*) n FROM observations').first()).n,1);env.DB.close();
});
test('invalid second offer and conflicting observation roll back the whole batch',async()=>{
 const env=setup();
 assert.equal((await ingest(env,batch({offers:[offer(),offer({externalId:'bad',totalPriceMinor:-1})]}))).status,400);
 assert.equal((await env.DB.prepare('SELECT count(*) n FROM offers').first()).n,0);
 await ingest(env);
 assert.equal((await ingest(env,batch({batchId:'batch-2',offers:[offer({externalId:'other'}),offer({totalPriceMinor:66000})]}))).status,409);
 assert.equal((await env.DB.prepare('SELECT count(*) n FROM offers').first()).n,1);
 assert.equal((await env.DB.prepare('SELECT count(*) n FROM import_batches').first()).n,1);env.DB.close();
});
test('older observations never overwrite current price and changed terms have separate history',async()=>{
 const env=setup();await ingest(env);
 await ingest(env,batch({batchId:'earlier',offers:[offer({observedAt:'2026-10-20T11:00:00.000Z',expiresAt:'2026-10-20T12:30:00.000Z',totalPriceMinor:70000})]}));
 let data=await (await request(env)).json();assert.equal(data.offers[0].totalPriceMinor,65000);
 assert.equal((await (await request(env,`/v1/offers/${data.offers[0].id}/history`)).json()).history.length,2);
 await ingest(env,batch({batchId:'different',offers:[offer({currency:'USD'})]}));
 data=await (await request(env)).json();assert.equal(data.offers.length,2);env.DB.close();
});
test('expiry is enforced at read time even without cron, and history fails closed',async()=>{
 const env=setup();await ingest(env);const id=(await (await request(env)).json()).offers[0].id;
 const later=Date.parse('2026-10-20T13:00:00.000Z');
 assert.equal((await (await request(env,'/v1/offers',{},later)).json()).offers.length,0);
 assert.equal((await request(env,`/v1/offers/${id}/history`,{},later)).status,404);
 await expireOffers(env,later);assert.equal((await env.DB.prepare('SELECT status FROM offers').first()).status,'expired');env.DB.close();
});
test('authentication, exact-origin CORS and method boundaries protect writes',async()=>{
 const env=setup();
 assert.equal((await request(env,'/v1/admin/ingest',{method:'POST',body:batch()})).status,401);
 assert.equal((await request(env,'/v1/admin/ingest',{method:'POST',body:batch(),auth:true,origin:'https://evil.example'})).status,403);
 assert.equal((await request(env,'/v1/admin/ingest',{method:'POST',body:batch(),auth:true,origin:'https://tripgoes.com'})).status,403);
 assert.equal((await request(env,'/v1/offers',{method:'POST'})).status,405);
 assert.equal((await request(env,'/v1/offers',{origin:'https://tripgoes.com.evil.example'})).status,403);
 const ok=await request(env,'/v1/offers',{origin:'https://tripgoes.com'});
 assert.equal(ok.headers.get('access-control-allow-origin'),'https://tripgoes.com');
 assert.equal(ok.headers.get('access-control-allow-credentials'),null);
 assert.equal((await request({...env,INGEST_TOKEN:''},'/v1/admin/status',{auth:true})).status,503);env.DB.close();
});
test('disabled and unknown sources, unsafe URLs and stale observations cannot be imported',async()=>{
 const env=setup();
 assert.equal((await ingest(env,batch({sourceId:'unknown'}))).status,400);
 for(const bookingUrl of ['http://travel.example.com','https://travel.example.com.evil.example/','https://user:pass@travel.example.com/','https://127.0.0.1/']){
  assert.equal((await ingest(env,batch({offers:[offer({bookingUrl})]}))).status,400);
 }
 for(const observedAt of ['2026-10-20T13:00:00.000Z','2026-10-19T11:00:00.000Z','2026-02-30T00:00:00.000Z'])assert.equal((await ingest(env,batch({offers:[offer({observedAt})]}))).status,400);
 await ingest(env);env.SOURCES_JSON=JSON.stringify([{...source,enabled:false}]);
 assert.deepEqual((await (await request(env)).json()).offers,[]);
 assert.equal((await ingest(env,batch({batchId:'disabled'}))).status,400);env.DB.close();
});
test('bounded request streams, JSON format, unknown fields and filters are rejected safely',async()=>{
 const env=setup();
 const oversized=new Request('https://api.tripgoes.com/v1/admin/ingest',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:'x'.repeat(65537)});
 assert.equal((await handleRequest(oversized,env,now)).status,413);
 assert.equal((await ingest(env,batch({verified:true}))).status,400);
 for(const path of ['/v1/offers?limit=0','/v1/offers?currency=XXX','/v1/offers?limit=21','/v1/offers?origin=a&origin=b'])assert.equal((await request(env,path)).status,400);
 const malformed=new Request('https://api.tripgoes.com/v1/admin/ingest',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:'{'});
 assert.equal((await handleRequest(malformed,env,now)).status,400);env.DB.close();
});
test('public filters are bound data and Unicode matching works',async()=>{
 const env=setup();await ingest(env);
 assert.equal((await (await request(env,'/v1/offers?destination='+encodeURIComponent('東京'))).json()).offers.length,1);
 assert.equal((await (await request(env,'/v1/offers?origin='+encodeURIComponent("' OR 1=1 --"))).json()).offers.length,0);
 env.DB.close();
});
test('database faults return generic unavailable errors without SQL or token leakage',async()=>{
 const env=setup();env.DB.close();
 const response=await request(env);assert.equal(response.status,503);
 const text=await response.text();assert.ok(!text.includes(token));assert.ok(!text.includes('SELECT'));
});
test('successful receipts replay after expiry and still detect a changed payload',async()=>{
 const env=setup();await ingest(env);const later=now+2*86400000;
 const send=value=>request(env,'/v1/admin/ingest',{method:'POST',body:value,auth:true},later);
 assert.equal((await send(batch())).status,200);
 assert.equal((await send(batch({offers:[offer({totalPriceMinor:70000})]}))).status,409);
 assert.equal((await send(batch({batchId:'new-old-data'}))).status,400);env.DB.close();
});
test('public expiry reflects a tightened source policy and departure midnight',async()=>{
 const env=setup();await ingest(env);
 env.SOURCES_JSON=JSON.stringify([{...source,maxAgeMinutes:60}]);
 assert.equal((await (await request(env)).json()).offers[0].expiresAt,'2026-10-20T12:30:00.000Z');
 env.SOURCES_JSON=JSON.stringify([{...source,maxAgeMinutes:1440}]);
 const late=Date.parse('2026-10-20T23:00:00.000Z');
 await request(env,'/v1/admin/ingest',{method:'POST',auth:true,body:batch({batchId:'near-midnight',offers:[offer({externalId:'midnight',observedAt:'2026-10-20T22:00:00.000Z',expiresAt:'2026-10-21T20:00:00.000Z',departureDate:'2026-10-21'})]})},late);
 assert.equal((await (await request(env,'/v1/offers',{},late)).json()).offers[0].expiresAt,'2026-10-21T00:00:00.000Z');env.DB.close();
});
test('withdrawal is immediate, idempotent and older new variants cannot revive it',async()=>{
 const env=setup();await ingest(env);
 const withdrawal={sourceId:'example',batchId:'withdraw-1',externalIds:['route-1']};
 const withdraw=()=>request(env,'/v1/admin/withdraw',{method:'POST',body:withdrawal,auth:true});
 assert.equal((await withdraw()).status,201);assert.equal((await withdraw()).status,200);
 assert.equal((await (await request(env)).json()).offers.length,0);
 await ingest(env,batch({batchId:'new-variant',offers:[offer({currency:'USD'})]}));
 assert.equal((await (await request(env)).json()).offers.length,0);
 const later=now+60000;
 await request(env,'/v1/admin/ingest',{method:'POST',auth:true,body:batch({batchId:'reissued',offers:[offer({observedAt:new Date(later).toISOString()})]})},later);
 assert.equal((await (await request(env,'/v1/offers',{},later)).json()).offers.length,1);env.DB.close();
});
test('production binding and Worker fetch signature work without treating ctx as clock',async()=>{
 const env=setup();
 assert.equal((await worker.fetch(new Request('https://api.tripgoes.com/v1/health'),env,{waitUntil(){}})).status,200);
 assert.equal((await request({...env,DEPLOYMENT:'production'})).status,503);
 assert.equal((await request({...env,RATE_LIMITER:{async limit(){return {success:false}}}})).status,429);
 const ok={...env,DEPLOYMENT:'production',RATE_LIMITER:{async limit(){return {success:true}}}};
 assert.equal((await request(ok)).status,200);env.DB.close();
});
test('catalogue city labels match their city and malformed Unicode fails validation',async()=>{
 const env=setup();await ingest(env);
 assert.equal((await (await request(env,'/v1/offers?origin='+encodeURIComponent('Budapest, HU (Budapest)'))).json()).offers.length,1);
 assert.equal((await ingest(env,batch({batchId:'unicode',offers:[offer({origin:'\ud800'})]}))).status,400);env.DB.close();
});
