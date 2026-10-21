import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFlightQuery,fetchFlightPrices,hasFlightCredentials} from '../backend/aviasales.mjs';
import {ApiError} from '../backend/validation.mjs';

const NOW=Date.parse('2026-10-21T12:00:00.000Z');
const ENV={AVIASALES_API_TOKEN:'fixture-only-token-not-a-real-key',AVIASALES_MARKER:'123456'};
const params=(overrides={})=>{
 const values={origin:'BUD',destination:'LON',departureDate:'2026-12-01',returnDate:'2026-12-05',currency:'EUR',direct:'false',oneWay:'false',...overrides};
 return new URLSearchParams(Object.entries(values).filter(([,value])=>value!==null));
};
const query=(overrides={})=>parseFlightQuery(params(overrides),NOW);
const fixture=(overrides={})=>({origin:'BUD',destination:'LON',origin_airport:'BUD',destination_airport:'LHR',
 departure_at:'2026-12-01T00:30:00+01:00',return_at:'2026-12-05T10:00:00Z',price:123.45,
 airline:'BA',flight_number:'123',transfers:0,return_transfers:0,duration:300,
 link:'/search/BUD0112LON05121?t=fixture_123&search_date=21102026&expected_price_uuid=fixture-uuid&expected_price_currency=eur',...overrides});
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json',...headers}});
const response=(rows=[fixture()],extra={})=>json({success:true,error:null,data:rows,...extra});
const fetchRows=(rows,extra={},input=query())=>fetchFlightPrices(input,ENV,{now:NOW,fetchImpl:async()=>response(rows,extra)});
const fails=(code,status)=>error=>error instanceof ApiError&&error.code===code&&error.status===status;
const invalid=fails('flight_provider_invalid_response',502);

test('canonical query is stable and destination is optional',()=>{
 assert.deepEqual(query(),{origin:'BUD',destination:'LON',departureDate:'2026-12-01',returnDate:'2026-12-05',currency:'EUR',direct:false,oneWay:false});
 assert.deepEqual(query({destination:null,returnDate:null,oneWay:'true',direct:null}),{origin:'BUD',destination:null,departureDate:'2026-12-01',returnDate:null,currency:'EUR',direct:false,oneWay:true});
});
test('unknown, duplicate, malformed IATA/currency/boolean and passenger parameters reject',()=>{
 for(const overrides of [{origin:'bud'},{origin:'BÜD'},{origin:'BUD '},{origin:'BU'},{origin:null},{destination:'BUD'},
  {destination:''},{currency:'eur'},{currency:'RUB'},{currency:null},{direct:'1'},{oneWay:'yes'},{adults:'2'},
  {trip_class:'1'},{token:'attacker-value'},{limit:'1000'},{returnDate:'2026-12-05',oneWay:'true'}]){
  assert.throws(()=>query(overrides),error=>error instanceof ApiError);
 }
 const duplicate=params();duplicate.append('currency','EUR');assert.throws(()=>parseFlightQuery(duplicate,NOW),ApiError);
});
test('strict UTC calendar bounds and round-trip ordering',()=>{
 for(const value of ['2026-10-21','2026-10-20','2027-10-22','2027-02-29','2026-12','2026-12-01T00:00:00Z','2026-02-30'])assert.throws(()=>query({departureDate:value}),ApiError);
 assert.throws(()=>query({returnDate:'2026-11-30'}),ApiError);
 assert.throws(()=>query({returnDate:null}),ApiError);
 assert.equal(query({departureDate:'2026-10-22',returnDate:'2027-10-21'}).returnDate,'2027-10-21');
 assert.equal(query({returnDate:'2026-12-01'}).returnDate,'2026-12-01');
});
test('credential status validates strings, decimal marker and header injection without exposing them',async()=>{
 assert.equal(hasFlightCredentials(ENV),true);
 for(const env of [{},{...ENV,AVIASALES_API_TOKEN:'short'},{...ENV,AVIASALES_API_TOKEN:'x'.repeat(4097)},
  {...ENV,AVIASALES_API_TOKEN:ENV.AVIASALES_API_TOKEN+'\r\nX-Evil:1'},{...ENV,AVIASALES_API_TOKEN:[]},
  {...ENV,AVIASALES_MARKER:123456},{...ENV,AVIASALES_MARKER:'1&evil=yes'},{...ENV,AVIASALES_MARKER:'0'}]){
  assert.equal(hasFlightCredentials(env),false);
  await assert.rejects(fetchFlightPrices(query(),env,{now:NOW,fetchImpl:()=>{throw Error('must not call')}}),fails('flight_provider_not_configured',503));
 }
});
test('upstream maps exact query and sends token only in header with rejected redirects',async()=>{
 let requested;
 const output=await fetchFlightPrices(query(),ENV,{now:NOW,fetchImpl:async(url,options)=>{
  requested={url,options};return response();
 }});
 const url=new URL(requested.url);
 assert.equal(url.origin,'https://api.travelpayouts.com');assert.equal(url.pathname,'/aviasales/v3/prices_for_dates');
 assert.deepEqual(Object.fromEntries(url.searchParams),{origin:'BUD',departure_at:'2026-12-01',currency:'eur',direct:'false',one_way:'false',sorting:'price',unique:'false',limit:'21',page:'1',destination:'LON',return_at:'2026-12-05'});
 assert.equal(requested.options.headers['X-Access-Token'],ENV.AVIASALES_API_TOKEN);
 assert.equal(requested.options.redirect,'manual');assert.equal(requested.options.method,'GET');
 assert.equal(requested.url.includes(ENV.AVIASALES_API_TOKEN),false);
 assert.equal(JSON.stringify(output).includes(ENV.AVIASALES_API_TOKEN),false);
 assert.equal(output.flights[0].priceMinor,12345);
});
test('normalized source and times disclose retrieval/cache cutoff, not invented market history',async()=>{
 const out=await fetchRows([fixture()]);
 assert.equal(out.asOf,'2026-10-21T12:00:00.000Z');assert.equal(out.fetchedAt,out.asOf);
 assert.equal(out.cacheUntil,'2026-10-21T12:10:00.000Z');
 assert.deepEqual(out.source,{id:'aviasales-data',name:'Aviasales Data API',kind:'cached_search',maxProviderAgeHours:48});
 const row=out.flights[0];assert.match(row.id,/^[0-9a-f]{64}$/);
 assert.equal(row.departureAt,'2026-12-01T00:30:00+01:00');
 assert.equal(row.destination,'LON');assert.equal(row.destinationAirport,'LHR');
 assert.equal(row.observedAt,undefined);assert.equal(row.expiresAt,undefined);assert.equal(row.tripScore,undefined);
 assert.equal(row.currency,'EUR');assert.equal(row.durationMinutes,300);
});
test('airport query matches the separate airport field, while unrelated routes fail',async()=>{
 const out=await fetchRows([fixture()],{},query({destination:'LHR'}));assert.equal(out.flights[0].destination,'LON');
 const outgoing=fixture({origin:'LON',origin_airport:'LHR',destination:'BUD',destination_airport:'BUD',link:'/search/LON0112BUD05121'});
 assert.equal((await fetchRows([outgoing],{},query({origin:'LHR',destination:'BUD'}))).flights[0].originAirport,'LHR');
 for(const row of [fixture({origin:'VIE',origin_airport:'VIE'}),fixture({destination:'PAR',destination_airport:'CDG'}),fixture({origin_airport:'evil'}),fixture({origin:'LON'})])await assert.rejects(fetchRows([row]),invalid);
});
test('one-way discovery omits destination and return upstream parameters and normalizes nulls',async()=>{
 const row=fixture({return_at:null,return_transfers:null,airline:null,flight_number:null,duration:null,origin_airport:null,destination_airport:null,link:'/BUD0112LON1'});
 const out=await fetchFlightPrices(query({destination:null,oneWay:'true',returnDate:null}),ENV,{now:NOW,fetchImpl:async(url)=>{
  const p=new URL(url).searchParams;assert.equal(p.has('destination'),false);assert.equal(p.has('return_at'),false);assert.equal(p.get('one_way'),'true');return response([row]);
 }});
 assert.equal(out.flights[0].returnAt,null);assert.equal(out.flights[0].originAirport,null);assert.equal(out.flights[0].durationMinutes,null);
 assert.match(out.flights[0].bookingUrl,/^https:\/\/www\.aviasales\.com\/search\/BUD0112LON1\?marker=123456$/);
});
test('success data[] is genuinely empty, {} and ambiguous/error envelopes are not',async()=>{
 const out=await fetchRows([]);assert.deepEqual(out.flights,[]);assert.equal(out.hasMore,false);
 for(const payload of [{},{success:true,data:{}},{success:false,data:[]},{success:true,data:[],error:'upstream failure'},null,[],{data:[]}]){
  await assert.rejects(fetchFlightPrices(query(),ENV,{now:NOW,fetchImpl:async()=>json(payload)}),invalid);
 }
});
test('wrong dates, invalid time zones and mismatched one-way semantics reject',async()=>{
 for(const row of [fixture({departure_at:'2026-12-02T01:00:00Z'}),fixture({departure_at:'2026-12-01T01:00:00'}),
  fixture({departure_at:'2026-02-30T01:00:00Z'}),fixture({departure_at:'2026-12-01T25:00:00Z'}),
  fixture({return_at:null}),fixture({return_at:'2026-12-06T01:00:00Z'})])await assert.rejects(fetchRows([row]),invalid);
 await assert.rejects(fetchRows([fixture()],{},query({oneWay:'true',returnDate:null})),invalid);
});
test('request currency is authoritative only when provider omits echo; all present echoes must agree',async()=>{
 assert.equal((await fetchRows([fixture()])).flights[0].currency,'EUR');
 assert.equal((await fetchRows([fixture({currency:'eur'})],{currency:'EUR'})).flights[0].currency,'EUR');
 await assert.rejects(fetchRows([fixture({currency:'usd'})]),invalid);
 await assert.rejects(fetchRows([fixture()],{currency:'USD'}),invalid);
 await assert.rejects(fetchRows([fixture({link:'/search/BUD0112LON05121?expected_price_currency=usd'})]),invalid);
});
test('prices require positive bounded monetary values with at most two decimals',async()=>{
 for(const price of [0,-1,'123',null,1e12,1.001])await assert.rejects(fetchRows([fixture({price})]),invalid);
 assert.equal((await fetchRows([fixture({price:0.29})])).flights[0].priceMinor,29);
});
test('direct flight claims need known zero transfers on both applicable legs',async()=>{
 assert.equal((await fetchRows([fixture()],{},query({direct:'true'}))).flights[0].transfers,0);
 for(const overrides of [{transfers:1},{transfers:null},{return_transfers:1},{return_transfers:null},{duration:-1},{transfers:1.5}])await assert.rejects(fetchRows([fixture(overrides)],{},query({direct:'true'})),invalid);
});
test('link origin, traversal, query contamination, route/date and cabin/passenger mismatches reject',async()=>{
 const links=['https://evil.example/search/BUD0112LON05121','//evil.example/search/BUD0112LON05121',
  '/search/../BUD0112LON05121','/search/%2e%2e/BUD0112LON05121','/search/BUD0112LON05121#evil',
  '/search/BUD0112LON05121\\evil','/search/BUD0112LON05121?token=secret','/search/BUD0112LON05121?redirect=https://evil.example',
  '/search/BUD0112LON05121?t=a&t=b','/search/BUD0112LON05121?t=%0a','/search/VIE0112LON05121',
  '/search/BUD0212LON05121','/search/BUD0112LON06121','/search/BUD0112LON0512c1','/search/BUD0112LON05122'];
 for(const link of links)await assert.rejects(fetchRows([fixture({link})]),invalid);
 for(const overrides of [{trip_class:1},{adults:2},{children:1},{infants:1}])await assert.rejects(fetchRows([fixture(overrides)]),invalid);
});
test('safe provider pointers are retained but server marker replaces any provider marker',async()=>{
 const out=await fetchRows([fixture({link:'/BUD0112LON05121?t=fixture&marker=999999'})]);
 const url=new URL(out.flights[0].bookingUrl);
 assert.equal(url.origin,'https://www.aviasales.com');assert.equal(url.pathname,'/search/BUD0112LON05121');
 assert.equal(url.searchParams.get('marker'),ENV.AVIASALES_MARKER);assert.equal(url.searchParams.get('t'),'fixture');
});
test('observed v3 response shape supports encoded fare keys and bounded extra fare metadata',async()=>{
 // Field shape from official endpoint on 2026-10-21; opaque IDs are fictional.
 const link='/search/BUD0112LON05121?t=fixture_123&search_date=21102026&expected_price_uuid=fixture-uuid'
  +'&static_fare_key=fixture%7Cvariant&itinerary_key=fixture-itinerary_1&expected_price_source=cache'
  +'&expected_price_currency=eur&expected_price=123.45';
 const out=await fetchRows([fixture({link})],{currency:'eur'});
 const normalized=new URL(out.flights[0].bookingUrl);
 assert.equal(normalized.searchParams.get('static_fare_key'),'fixture|variant');
 assert.equal(normalized.searchParams.get('itinerary_key'),'fixture-itinerary_1');
 assert.equal(normalized.searchParams.get('expected_price'),'123.45');
 assert.equal(normalized.origin,'https://www.aviasales.com');
 for(const suffix of ['&static_fare_key=fixture%250a','&itinerary_key=fixture%0a','&expected_price=1','&expected_price=NaN','&expected_price_source=%ZZ']){
  await assert.rejects(fetchRows([fixture({link:'/search/BUD0112LON05121?expected_price_currency=eur'+suffix})]),invalid);
 }
});
test('required route codes reject arrays/objects even when an airport alias matches',async()=>{
 for(const overrides of [{origin:['BUD']},{destination:['LON']},{origin:{toString:'BUD'}},{destination:{code:'LON'}}]){
  await assert.rejects(fetchRows([fixture(overrides)]),invalid);
 }
});
test('an upstream reflection of the API credential can never become public',async()=>{
 await assert.rejects(fetchRows([fixture({link:'/search/BUD0112LON05121?t='+ENV.AVIASALES_API_TOKEN})]),invalid);
});
test('results cap at twenty, hasMore is based on the bounded extra row, duplicate IDs collapse',async()=>{
 const rows=Array.from({length:21},(_,index)=>fixture({price:100+index,flight_number:String(index)}));
 const out=await fetchRows(rows);assert.equal(out.flights.length,20);assert.equal(out.hasMore,true);
 assert.equal((await fetchRows([fixture(),fixture()])).flights.length,1);
 await assert.rejects(fetchRows([...rows,fixture()]),invalid);
});
test('HTTP provider rejection/rate limit/unavailability are distinct safe errors',async()=>{
 for(const [status,code,publicStatus] of [[401,'flight_provider_rejected',502],[403,'flight_provider_rejected',502],
  [429,'flight_provider_rate_limited',503],[500,'flight_provider_unavailable',502]]){
  await assert.rejects(fetchFlightPrices(query(),ENV,{now:NOW,fetchImpl:async()=>new Response(ENV.AVIASALES_API_TOKEN,{status})}),fails(code,publicStatus));
 }
 await assert.rejects(fetchFlightPrices(query(),ENV,{now:NOW,fetchImpl:async()=>{throw new Error('request '+ENV.AVIASALES_API_TOKEN)}}),fails('flight_provider_unavailable',502));
});
test('redirect and non-JSON response cannot bypass validation',async()=>{
 for(const r of [new Response('',{status:302,headers:{Location:'https://evil.example'}}),new Response('{}',{headers:{'content-type':'text/html'}}),new Response('not json',{headers:{'content-type':'application/json'}})]){
  await assert.rejects(fetchFlightPrices(query(),ENV,{now:NOW,fetchImpl:async()=>r}),invalid);
 }
 const r=response();Object.defineProperty(r,'redirected',{value:true});
 await assert.rejects(fetchFlightPrices(query(),ENV,{now:NOW,fetchImpl:async()=>r}),invalid);
});
test('Workers-compatible manual redirect refuses all redirect statuses without another fetch',async()=>{
 for(const status of [301,302,303,307,308]){
  let calls=0;
  await assert.rejects(fetchFlightPrices(query(),ENV,{now:NOW,fetchImpl:async(url,options)=>{
   calls++;assert.equal(options.redirect,'manual');
   assert.equal(new URL(url).origin,'https://api.travelpayouts.com');
   return new Response(null,{status,headers:{Location:'https://untrusted.example/steal'}});
  }}),invalid);
  assert.equal(calls,1);
 }
});
test('response bound applies to declared and streamed bytes and rejects invalid UTF-8',async()=>{
 let cancelled=false;
 const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(512*1024+1))},cancel(){cancelled=true}});
 const declared=response([]);declared.headers.set('content-length',String(512*1024+1));
 await assert.rejects(fetchFlightPrices(query(),ENV,{now:NOW,fetchImpl:async()=>declared}),invalid);
 await assert.rejects(fetchFlightPrices(query(),ENV,{now:NOW,fetchImpl:async()=>new Response(stream,{headers:{'content-type':'application/json'}})}),invalid);
 assert.equal(cancelled,true);
 await assert.rejects(fetchFlightPrices(query(),ENV,{now:NOW,fetchImpl:async()=>new Response(new Uint8Array([0xc3,0x28]),{headers:{'content-type':'application/json'}})}),invalid);
});
test('ten-second timeout covers a hanging fetch even if it ignores AbortSignal',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let signal;
 const promise=fetchFlightPrices(query(),ENV,{now:NOW,fetchImpl:async(url,options)=>{signal=options.signal;return new Promise(()=>{})}});
 const assertion=assert.rejects(promise,fails('flight_provider_unavailable',502));
 t.mock.timers.tick(10000);await assertion;assert.equal(signal.aborted,true);
});
test('ten-second timeout also bounds a stalled response body',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let cancelled=false;
 const stream=new ReadableStream({cancel(){cancelled=true}});
 const promise=fetchFlightPrices(query(),ENV,{now:NOW,fetchImpl:async()=>new Response(stream,{headers:{'content-type':'application/json'}})});
 const assertion=assert.rejects(promise,fails('flight_provider_unavailable',502));
 await Promise.resolve();await Promise.resolve();t.mock.timers.tick(10000);await assertion;
 assert.equal(cancelled,true);
});
