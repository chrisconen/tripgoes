import {ApiError,fail,currencies,sha256} from './validation.mjs';

// Primary contracts (checked 2026-10-21):
// https://support.travelpayouts.com/hc/en-us/articles/203956163-Aviasales-Data-API
// https://support.travelpayouts.com/hc/en-us/articles/5711895629714-Aviasales-affiliate-links
// prices_for_dates is a cached fare, not a live booking quote or complete-trip price.
const UPSTREAM='https://api.travelpayouts.com/aviasales/v3/prices_for_dates';
const BOOKING='https://www.aviasales.com';
const MAX_BODY=512*1024,RESULT_LIMIT=20,DAY=86400000;
const FIELDS=['origin','destination','departureDate','returnDate','currency','direct','oneWay'];
const IATA=/^[A-Z]{3}$/;
const invalid=()=>fail('flight_provider_invalid_response',502);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

export function hasFlightCredentials(env){
 return typeof env?.AVIASALES_API_TOKEN==='string'&&/^[\x21-\x7e]{16,4096}$/.test(env.AVIASALES_API_TOKEN)
  &&typeof env?.AVIASALES_MARKER==='string'&&/^[1-9][0-9]{0,19}$/.test(env.AVIASALES_MARKER);
}
function calendar(value){
 return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))
  &&new Date(value).toISOString().slice(0,10)===value;
}
export function parseFlightQuery(params,now=Date.now()){
 if(!(params instanceof URLSearchParams)||!Number.isFinite(now)||[...params.keys()].some(k=>!FIELDS.includes(k)||params.getAll(k).length!==1))fail();
 const origin=params.get('origin'),destination=params.get('destination')??null,currency=params.get('currency');
 if(!IATA.test(origin??'')||(destination!==null&&!IATA.test(destination))||destination===origin||!currencies.includes(currency))fail();
 const boolean=name=>{const value=params.get(name)??'false';if(value!=='true'&&value!=='false')fail();return value==='true'};
 const oneWay=boolean('oneWay'),direct=boolean('direct');
 const departureDate=params.get('departureDate'),returnDate=params.get('returnDate')??null;
 const today=Math.floor(now/DAY)*DAY;
 const validDate=value=>calendar(value)&&Date.parse(value)>=today+DAY&&Date.parse(value)<=today+365*DAY;
 if(!validDate(departureDate)||(oneWay?returnDate!==null:!validDate(returnDate)||returnDate<departureDate))fail('invalid_time_window');
 return {origin,destination,departureDate,returnDate,currency,direct,oneWay};
}
function canonicalQuery(query,now){
 if(!plain(query)||Object.keys(query).some(k=>!FIELDS.includes(k))||typeof query.direct!=='boolean'||typeof query.oneWay!=='boolean')fail();
 const params=new URLSearchParams();
 for(const name of FIELDS)if(query[name]!==null&&query[name]!==undefined)params.set(name,String(query[name]));
 return parseFlightQuery(params,now);
}
function stamp(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(value)
  ||!calendar(value.slice(0,10))||!Number.isFinite(Date.parse(value)))invalid();
 // Retain the supplied offset: the flight's calendar day must not shift at UTC conversion.
 return value;
}
function optionalCode(value,pattern){
 if(value===undefined||value===null||value==='')return null;
 if(typeof value!=='string'||!pattern.test(value))invalid();return value;
}
function optionalInteger(value,max){
 if(value===undefined||value===null)return null;
 if(!Number.isInteger(value)||value<0||value>max)invalid();return value;
}
function currencyEcho(value,expected){
 if(value===undefined||value===null)return;
 if(typeof value!=='string'||value.toUpperCase()!==expected||!/^[a-zA-Z]{3}$/.test(value))invalid();
}
const dayMonth=value=>value.slice(8,10)+value.slice(5,7);
function bookingLink(raw,row,query,marker){
 if(typeof raw!=='string'||raw.length>2048||/[\s\\#\u0000-\u001f\u007f]/u.test(raw)||/%(?![0-9a-f]{2})/i.test(raw))invalid();
 const parts=/^\/(?:search\/)?([A-Z]{3})(\d{4})([A-Z]{3})(\d{4})?1(?:\?([^#]*))?$/.exec(raw);
 if(!parts||![row.origin,row.originAirport].includes(parts[1])||![row.destination,row.destinationAirport].includes(parts[3])
  ||parts[2]!==dayMonth(query.departureDate)||(query.oneWay?parts[4]!==undefined:parts[4]!==dayMonth(query.returnDate)))invalid();
 const url=new URL('/search/'+raw.split('?')[0].replace(/^\/(?:search\/)?/,''),BOOKING);
 const parameters=new URLSearchParams(parts[5]??'');
 // Additional opaque fare fields observed in the official v3 response, 2026-10-21.
 // Decode query values once, validate their alphabet, then URLSearchParams encodes
 // them again. Percent escapes remain impossible in the strictly matched path.
 const allowed=['t','search_date','expected_price_uuid','expected_price_currency','marker',
  'static_fare_key','itinerary_key','expected_price_source','expected_price'];
 for(const [name,value] of parameters){
  const alphabet=name==='static_fare_key'?/^[A-Za-z0-9_.:|+-]+$/:/^[A-Za-z0-9_.:-]+$/;
  if(!allowed.includes(name)||parameters.getAll(name).length!==1||!value||value.length>1500||!alphabet.test(value))invalid();
  if(name==='expected_price_currency')currencyEcho(value,query.currency);
  if(name==='expected_price'&&(!/^\d+(?:\.\d{1,2})?$/.test(value)||Math.round(Number(value)*100)!==row.priceMinor))invalid();
  // Affiliate identity always comes from server configuration, never provider data.
  if(name!=='marker')url.searchParams.set(name,value);
 }
 url.searchParams.set('marker',marker);
 // marker= is documented on expanded partner URLs. Actual commission attribution
 // still depends on Travelpayouts account/project approval and partner link setup.
 return url.href;
}
async function normalizeRow(raw,query,marker){
 if(!plain(raw)||typeof raw.origin!=='string'||typeof raw.destination!=='string'||!IATA.test(raw.origin)||!IATA.test(raw.destination)||raw.origin===raw.destination)invalid();
 const row={origin:raw.origin,destination:raw.destination,
  originAirport:optionalCode(raw.origin_airport,IATA),destinationAirport:optionalCode(raw.destination_airport,IATA)};
 if(![row.origin,row.originAirport].includes(query.origin)||(query.destination&&! [row.destination,row.destinationAirport].includes(query.destination)))invalid();
 row.departureAt=stamp(raw.departure_at);
 row.returnAt=raw.return_at===undefined||raw.return_at===null||raw.return_at===''?null:stamp(raw.return_at);
 if(row.departureAt.slice(0,10)!==query.departureDate||(query.oneWay?row.returnAt!==null:!row.returnAt||row.returnAt.slice(0,10)!==query.returnDate||Date.parse(row.returnAt)<Date.parse(row.departureAt)))invalid();
 currencyEcho(raw.currency,query.currency);
 const price=raw.price;
 if(typeof price!=='number'||!Number.isFinite(price)||price<=0||price>1000000000||Math.abs(price*100-Math.round(price*100))>0.00001)invalid();
 row.priceMinor=Math.round(price*100);row.currency=query.currency;
 row.airline=optionalCode(raw.airline,/^[A-Z0-9]{2,3}$/);
 row.flightNumber=raw.flight_number===undefined||raw.flight_number===null||raw.flight_number===''?null:optionalCode(String(raw.flight_number),/^[A-Z0-9 -]{1,12}$/);
 row.transfers=optionalInteger(raw.transfers,20);row.returnTransfers=optionalInteger(raw.return_transfers,20);
 row.durationMinutes=optionalInteger(raw.duration,43200);
 if(query.direct&&(row.transfers!==0||(!query.oneWay&&row.returnTransfers!==0)))invalid();
 if(raw.trip_class!==undefined&&raw.trip_class!==0)invalid();
 if(raw.adults!==undefined&&raw.adults!==1)invalid();
 if(raw.children!==undefined&&raw.children!==0)invalid();
 if(raw.infants!==undefined&&raw.infants!==0)invalid();
 row.bookingUrl=bookingLink(raw.link,row,query,marker);
 // Provider t/search_date is an opaque cached-search pointer, not observation evidence.
 row.id=await sha256(JSON.stringify({...row,bookingUrl:row.bookingUrl.replace(/([?&])marker=[^&]*/,'')}));
 return {id:row.id,...row};
}
async function boundedJSON(response,readerRef){
 const length=response.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_BODY))invalid();
 const type=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
 if(type!=='application/json'||!response.body)invalid();
 const reader=response.body.getReader();readerRef.current=reader;
 const chunks=[];let size=0;
 for(;;){
  const {done,value}=await reader.read();if(done)break;
  size+=value.byteLength;if(size>MAX_BODY)invalid();chunks.push(value);
 }
 const bytes=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{invalid()}
}
export async function fetchFlightPrices(input,env,{fetchImpl=fetch,now=Date.now()}={}){
 if(!hasFlightCredentials(env))fail('flight_provider_not_configured',503);
 const query=canonicalQuery(input,now),url=new URL(UPSTREAM);
 const parameters={origin:query.origin,departure_at:query.departureDate,currency:query.currency.toLowerCase(),
  direct:String(query.direct),one_way:String(query.oneWay),sorting:'price',unique:'false',limit:String(RESULT_LIMIT+1),page:'1'};
 if(query.destination)parameters.destination=query.destination;
 if(query.returnDate)parameters.return_at=query.returnDate;
 for(const [name,value] of Object.entries(parameters))url.searchParams.set(name,value);
 const controller=new AbortController(),readerRef={current:null};let timeout;
 try{
  const operation=async()=>{
   // Workers implements manual/follow, but not redirect:error. Never follow a
   // provider redirect: the custom token header must stay on this fixed origin.
   const response=await fetchImpl(url.href,{method:'GET',headers:{'X-Access-Token':env.AVIASALES_API_TOKEN,Accept:'application/json'},redirect:'manual',signal:controller.signal});
   if(response.redirected||(response.status>=300&&response.status<400))invalid();
   if(response.status===401||response.status===403)fail('flight_provider_rejected',502);
   if(response.status===429)fail('flight_provider_rate_limited',503);
   if(!response.ok)fail('flight_provider_unavailable',502);
   const payload=await boundedJSON(response,readerRef);
   if(!plain(payload)||payload.success!==true||!Array.isArray(payload.data)||payload.data.length>RESULT_LIMIT+1||(payload.error!==undefined&&payload.error!==null))invalid();
   // The documented currency request parameter defines the amount's units. Some
   // v3 examples omit the echo; any echo that is present must agree with it.
   currencyEcho(payload.currency,query.currency);
   const normalized=await Promise.all(payload.data.map(row=>normalizeRow(row,query,env.AVIASALES_MARKER)));
   const flights=[...new Map(normalized.map(row=>[row.id,row])).values()].slice(0,RESULT_LIMIT);
   const fetchedAt=new Date(now).toISOString();
   const result={asOf:fetchedAt,fetchedAt,cacheUntil:new Date(now+10*60000).toISOString(),
    source:{id:'aviasales-data',name:'Aviasales Data API',kind:'cached_search',maxProviderAgeHours:48},
    query,flights,hasMore:normalized.length>RESULT_LIMIT};
   if(JSON.stringify(result).includes(env.AVIASALES_API_TOKEN))invalid();
   return result;
  };
  return await Promise.race([operation(),new Promise((_,reject)=>{timeout=setTimeout(()=>{
   controller.abort();reject(new ApiError(502,'flight_provider_unavailable'));
  },10000)})]);
 }catch(error){
  if(error instanceof ApiError)throw error;
  fail('flight_provider_unavailable',502);
 }finally{
  clearTimeout(timeout);controller.abort();
  // Never await cancel: a malicious/failed upstream stream must not prolong timeout.
  try{readerRef.current?.cancel().catch(()=>{})}catch{}
 }
}

const BOARD_FIELDS=['origin','currency'];
export function parseLastMinuteQuery(params){
 if(!(params instanceof URLSearchParams)||[...params.keys()].some(k=>!BOARD_FIELDS.includes(k)||params.getAll(k).length!==1))fail();
 const origin=params.get('origin'),currency=params.get('currency');
 if(!IATA.test(origin??'')||!currencies.includes(currency))fail();
 return {origin,currency};
}
