export class ApiError extends Error{constructor(status,code){super(code);this.status=status;this.code=code}}
export const fail=(code='invalid_request',status=400)=>{throw new ApiError(status,code)};
export const currencies=['EUR','HUF','USD','GBP','CHF']; // All use 100 minor units per major unit.
export function text(value,max=120,{optional=false}={}){
 if(typeof value!=='string'||/[\u0000-\u001f\u007f]/u.test(value)||!value.isWellFormed())fail();
 const result=value.normalize('NFC').trim().replace(/\s+/gu,' ');
 if((!result&&!optional)||result.length>max)fail();return result;
}
export const key=value=>value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
function object(value,allowed){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))fail();
 return value;
}
function id(value){if(typeof value!=='string'||!/^[-a-zA-Z0-9_.:]{1,100}$/.test(value))fail();return value}
function stamp(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)fail();return value}
function date(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail();return value}
export function sources(env){
 let rows;try{rows=JSON.parse(env.SOURCES_JSON||'[]')}catch{fail('configuration_unavailable',503)}
 try{
  if(!Array.isArray(rows)||rows.length>20)fail();const seen=new Set();
  return rows.map(row=>{
   object(row,['id','name','kind','allowedHosts','maxAgeMinutes','enabled']);
   if(!/^[-a-z0-9]{1,40}$/.test(row.id)||seen.has(row.id)||!['editorial','provider'].includes(row.kind)||typeof row.enabled!=='boolean')fail();
   if(!Number.isInteger(row.maxAgeMinutes)||row.maxAgeMinutes<1||row.maxAgeMinutes>1440||!Array.isArray(row.allowedHosts)||!row.allowedHosts.length||row.allowedHosts.length>10)fail();
   const hosts=row.allowedHosts.map(host=>{if(typeof host!=='string'||host.length>253||!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(host))fail();return host});
   seen.add(row.id);return {...row,name:text(row.name,100),allowedHosts:hosts};
  });
 }catch{fail('configuration_unavailable',503)}
}
export function validateBatch(value,registry){
 object(value,['sourceId','batchId','offers']);const source=registry.find(s=>s.id===value.sourceId&&s.enabled);
 if(!source)fail('source_not_enabled');id(value.batchId);
 if(!Array.isArray(value.offers)||!value.offers.length||value.offers.length>20)fail('invalid_batch_size');
 const rows=value.offers.map(raw=>{
  object(raw,['externalId','title','origin','destination','departureDate','returnDate','travelers','currency','totalPriceMinor','inclusions','bookingUrl','observedAt','expiresAt']);
  const result={externalId:id(raw.externalId),title:text(raw.title,180),origin:text(raw.origin),destination:text(raw.destination),departureDate:date(raw.departureDate),returnDate:date(raw.returnDate),travelers:raw.travelers,currency:raw.currency,totalPriceMinor:raw.totalPriceMinor,inclusions:text(raw.inclusions,1000),bookingUrl:raw.bookingUrl,observedAt:stamp(raw.observedAt),expiresAt:stamp(raw.expiresAt)};
  if(!Number.isInteger(result.travelers)||result.travelers<1||result.travelers>20||!currencies.includes(result.currency)||!Number.isSafeInteger(result.totalPriceMinor)||result.totalPriceMinor<0||result.totalPriceMinor>100000000000)fail();
  if(result.returnDate<result.departureDate||Date.parse(result.returnDate)-Date.parse(result.departureDate)>366*86400000)fail('invalid_time_window');
  let url;try{url=new URL(result.bookingUrl)}catch{fail('invalid_booking_url')}
  if(typeof result.bookingUrl!=='string'||result.bookingUrl.length>2048||url.protocol!=='https:'||url.username||url.password||url.port||!source.allowedHosts.includes(url.hostname)||url.hash)fail('invalid_booking_url');
  result.bookingUrl=url.href;return result;
 });
 return {source,batchId:value.batchId,offers:rows};
}
export function validateFreshBatch(batch,now){
 for(const row of batch.offers){
  const observed=Date.parse(row.observedAt),expires=Date.parse(row.expiresAt),maxAge=batch.source.maxAgeMinutes*60000;
  if(observed>now||observed<=now-maxAge||expires<=now||expires>observed+maxAge||row.departureDate<=new Date(now).toISOString().slice(0,10)||Date.parse(row.departureDate)>now+730*86400000)fail('invalid_time_window');
 }
}
export function validateWithdrawal(value,registry){
 object(value,['sourceId','batchId','externalIds']);
 const source=registry.find(s=>s.id===value.sourceId);if(!source)fail('unknown_source');
 if(!Array.isArray(value.externalIds)||!value.externalIds.length||value.externalIds.length>20)fail('invalid_batch_size');
 const externalIds=value.externalIds.map(id);if(new Set(externalIds).size!==externalIds.length)fail();
 return {source,batchId:id(value.batchId),externalIds};
}
export function filters(params){
 const allowed=['origin','destination','currency','limit'];
 if([...params.keys()].some(k=>!allowed.includes(k)||params.getAll(k).length!==1))fail();
 const limit=params.get('limit')??'20';if(!/^(?:[1-9]|1[0-9]|20)$/.test(limit))fail();
 const currency=params.get('currency')||'';if(currency&&!currencies.includes(currency))fail();
 const city=value=>key(text(value||'',120,{optional:true}).replace(/, [A-Z]{2}(?: \(.+\))?$/,''));
 return {origin:city(params.get('origin')),destination:city(params.get('destination')),currency,limit:Number(limit)};
}
export async function sha256(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('')}
export async function readJSON(request){
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')fail('json_required',415);
 if(request.headers.has('content-encoding'))fail('encoding_not_supported',415);
 const declared=request.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>65536))fail('body_too_large',413);
 if(!request.body)fail();const reader=request.body.getReader();const chunks=[];let size=0,timeout;
 const read=async()=>{try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536)fail('body_too_large',413);chunks.push(value)}}finally{if(size>65536)await reader.cancel().catch(()=>{})}};
 try{await Promise.race([read(),new Promise((_,reject)=>{timeout=setTimeout(()=>{reader.cancel().catch(()=>{});reject(new ApiError(408,'body_timeout'))},5000)})])}finally{clearTimeout(timeout)}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{fail('invalid_json')}
}
