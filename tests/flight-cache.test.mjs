import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSqlite} from '../backend/sqlite.mjs';
import {cachedFlightPrices,reserveFlightFetch,expire,FLIGHT_DAILY_LIMIT,FLIGHT_MINUTE_LIMIT} from '../backend/repository.mjs';
import {handleRequest} from '../backend/worker.mjs';
const now=Date.parse('2026-10-21T12:00:00Z');
const query={origin:'BUD',destination:'LON',departureDate:'2026-11-10',returnDate:'2026-11-15',currency:'EUR',direct:false,oneWay:false};
function setup(){
 const DB=createSqlite(':memory:');
 for(const file of ['0001_initial.sql','0002_flight_cache.sql'])DB.exec(readFileSync(new URL('../backend/migrations/'+file,import.meta.url),'utf8'));
 return {DB,AVIASALES_API_TOKEN:'test-only-aviasales-token-12345678',AVIASALES_MARKER:'123456',SOURCES_JSON:'[]',ALLOWED_ORIGINS:'https://tripgoes.com'};
}
function result(query,env,{now}){return {asOf:new Date(now).toISOString(),fetchedAt:new Date(now).toISOString(),cacheUntil:new Date(now+600000).toISOString(),source:{id:'aviasales-data',name:'Aviasales Data API',kind:'cached_search',maxProviderAgeHours:48},query,flights:[],hasMore:false}}
test('fresh shared cache avoids upstream requests and never refreshes retrieval time',async()=>{
 const env=setup();let calls=0;const fetchPrices=(...args)=>{calls++;return result(...args)};
 const first=await cachedFlightPrices(env,query,now,{fetchPrices});
 const second=await cachedFlightPrices(env,query,now+60000,{fetchPrices});
 assert.equal(calls,1);assert.equal(second.fetchedAt,first.fetchedAt);assert.equal(second.cacheUntil,first.cacheUntil);assert.notEqual(second.asOf,first.asOf);
 await cachedFlightPrices(env,query,now+600001,{fetchPrices});assert.equal(calls,2);
 assert.equal((await env.DB.prepare('SELECT count(*) n FROM observations').first()).n,0);env.DB.close();
});
test('cache separates currency and partner markers without storing tokens',async()=>{
 const env=setup();let calls=0;const fetchPrices=(...args)=>{calls++;return result(...args)};
 await cachedFlightPrices(env,query,now,{fetchPrices});
 await cachedFlightPrices(env,{...query,currency:'HUF'},now,{fetchPrices});
 env.AVIASALES_MARKER='654321';await cachedFlightPrices(env,query,now,{fetchPrices});
 assert.equal(calls,3);
 const rows=await env.DB.prepare('SELECT * FROM flight_cache').all();assert.ok(!JSON.stringify(rows).includes(env.AVIASALES_API_TOKEN));env.DB.close();
});
test('expired cache is not served after provider failure; failures still consume quota',async()=>{
 const env=setup();await cachedFlightPrices(env,query,now,{fetchPrices:result});
 await assert.rejects(cachedFlightPrices(env,query,now+600001,{fetchPrices:()=>{throw Error('fixture failure')}}));
 assert.equal((await env.DB.prepare('SELECT day_used FROM flight_provider_budget').first()).day_used,2);
 await expire(env.DB,now+600001);assert.equal((await env.DB.prepare('SELECT count(*) n FROM flight_cache').first()).n,0);env.DB.close();
});
test('minute reservations are atomic across concurrent callers',async()=>{
 const env=setup();const attempts=await Promise.allSettled(Array.from({length:FLIGHT_MINUTE_LIMIT+10},()=>reserveFlightFetch(env.DB,now)));
 assert.equal(attempts.filter(r=>r.status==='fulfilled').length,FLIGHT_MINUTE_LIMIT);
 assert.ok(attempts.filter(r=>r.status==='rejected').every(r=>r.reason.code==='flight_provider_budget_exhausted'));
 await reserveFlightFetch(env.DB,now+60000);env.DB.close();
});
test('daily upstream cap persists across minutes and resets on the next UTC day',async()=>{
 const env=setup();
 for(let i=0;i<FLIGHT_DAILY_LIMIT;i++)await reserveFlightFetch(env.DB,now+i*60000);
 await assert.rejects(reserveFlightFetch(env.DB,now+(FLIGHT_DAILY_LIMIT+1)*60000),e=>e.code==='flight_provider_budget_exhausted');
 await reserveFlightFetch(env.DB,now+86400000);assert.equal((await env.DB.prepare('SELECT day_used FROM flight_provider_budget').first()).day_used,1);env.DB.close();
});

test('out-of-order requests cannot reset minute or day quotas backwards',async()=>{
 const env=setup();
 for(let i=0;i<FLIGHT_MINUTE_LIMIT;i++)await reserveFlightFetch(env.DB,now);
 const before=await env.DB.prepare('SELECT * FROM flight_provider_budget').first();
 for(const stale of [now-1,now-86400000])await assert.rejects(reserveFlightFetch(env.DB,stale),e=>e.code==='flight_provider_budget_exhausted');
 assert.deepEqual(await env.DB.prepare('SELECT * FROM flight_provider_budget').first(),before);
 await assert.rejects(reserveFlightFetch(env.DB,now),e=>e.code==='flight_provider_budget_exhausted');
 await reserveFlightFetch(env.DB,now+86400000);
 await assert.rejects(reserveFlightFetch(env.DB,now+60000),e=>e.code==='flight_provider_budget_exhausted');
 assert.equal((await env.DB.prepare('SELECT day_used FROM flight_provider_budget').first()).day_used,1);
 env.DB.close();
});
test('missing credentials fail before spending provider budget, while public status exposes flags only',async()=>{
 const env=setup();delete env.AVIASALES_API_TOKEN;
 await assert.rejects(cachedFlightPrices(env,query,now),e=>e.code==='flight_provider_not_configured');
 assert.equal((await env.DB.prepare('SELECT count(*) n FROM flight_provider_budget').first()).n,0);
 const request=(path,options)=>handleRequest(new Request('https://api.example.com'+path,options),env,now);
 const status=await request('/v1/flights/status');assert.equal(status.status,200);assert.deepEqual(await status.json(),{configured:false,source:'aviasales-data'});
 const denied=await request('/v1/flights/status',{headers:{Origin:'https://evil.example'}});assert.equal(denied.status,403);
 const invalid=await request('/v1/flights?token=must-not-be-used');assert.equal(invalid.status,400);
 const preflight=await request('/v1/flights',{method:'OPTIONS',headers:{Origin:'https://tripgoes.com'}});assert.equal(preflight.status,204);env.DB.close();
});
