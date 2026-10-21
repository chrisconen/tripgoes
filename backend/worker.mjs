import {ApiError,fail,sources,validateBatch,validateWithdrawal,filters,sha256,readJSON} from './validation.mjs';
import {saveBatch,withdrawBatch,listOffers,offerHistory,status,expire,cachedFlightPrices,lastMinuteBoard} from './repository.mjs';
import {parseFlightQuery,parseLastMinuteQuery,hasFlightCredentials} from './aviasales.mjs';

function response(data,status,origin,requestId,extra={}){
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",'X-Request-ID':requestId,Vary:'Origin',...extra};
 if(origin)headers['Access-Control-Allow-Origin']=origin;
 return new Response(status===204?null:JSON.stringify(data),{status,headers});
}
async function authenticate(request,env){
 const token=env.INGEST_TOKEN;
 if(typeof token!=='string'||token.length<32)fail('ingestion_not_configured',503);
 const header=request.headers.get('authorization')||'';
 if(header.length>256||!header.startsWith('Bearer '))fail('unauthorized',401);
 const [a,b]=await Promise.all([sha256(token),sha256(header.slice(7))]);let difference=0;
 for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);
 if(difference)fail('unauthorized',401);
}
export async function handleRequest(request,env,now=Date.now()){
 const requestId=crypto.randomUUID();let allowedOrigin=null;
 try{
  const url=new URL(request.url);if(url.search.length>1500)fail('query_too_long',414);
  const admin=url.pathname.startsWith('/v1/admin/'),origin=request.headers.get('origin');
  const allowed=(env.ALLOWED_ORIGINS||'https://tripgoes.com').split(',').map(v=>v.trim());
  // Administration is CLI-to-server only. Never accept browser-origin writes.
  if(origin&&(admin||!allowed.includes(origin)))fail('origin_not_allowed',403);
  if(origin)allowedOrigin=origin;
  if(env.DEPLOYMENT==='production'&&!env.RATE_LIMITER)fail('rate_limit_unavailable',503);
  if(env.RATE_LIMITER){
   const ip=request.headers.get('cf-connecting-ip')||'unidentified';
   const {success}=await env.RATE_LIMITER.limit({key:`${admin?'admin':'public'}:${ip}`});
   if(!success)fail('rate_limited',429);
  }
  const history=/^\/v1\/offers\/([a-f0-9]{64})\/history$/.exec(url.pathname);
  const publicRoute=['/v1/health','/v1/offers','/v1/flights','/v1/flights/status','/v1/lastminute'].includes(url.pathname)||history;
  const ingest=url.pathname==='/v1/admin/ingest',withdraw=url.pathname==='/v1/admin/withdraw',adminStatus=url.pathname==='/v1/admin/status';
  if(!publicRoute&&!ingest&&!withdraw&&!adminStatus)fail('not_found',404);
  if(request.method==='OPTIONS'&&publicRoute)return response(null,204,allowedOrigin,requestId,{'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Max-Age':'600'});
  if(((ingest||withdraw)&&request.method!=='POST')||(!(ingest||withdraw)&&request.method!=='GET'))fail('method_not_allowed',405);
  if(admin)await authenticate(request,env);
  if(!env.DB)fail('storage_unavailable',503);
  const registry=sources(env);
  let data,httpStatus=200;
  if(url.pathname==='/v1/health'){
   await env.DB.prepare('SELECT 1 ok FROM offers LIMIT 1').first();
   data={service:'tripgoes-data-api',version:1,status:'ok',asOf:new Date(now).toISOString(),enabledSources:registry.filter(s=>s.enabled).length};
  }else if(url.pathname==='/v1/offers')data=await listOffers(env.DB,registry,filters(url.searchParams),now);
  else if(url.pathname==='/v1/flights/status'){
   if(url.search)fail();
   data={configured:hasFlightCredentials(env),source:'cached-fares'};
  }
  else if(url.pathname==='/v1/flights')data=await cachedFlightPrices(env,parseFlightQuery(url.searchParams,now),now);
  else if(url.pathname==='/v1/lastminute')data=await lastMinuteBoard(env,parseLastMinuteQuery(url.searchParams),now);
  else if(history)data=await offerHistory(env.DB,registry,history[1],now);
  else if(adminStatus)data=await status(env.DB,registry,now);
  else if(withdraw){data=await withdrawBatch(env.DB,validateWithdrawal(await readJSON(request),registry),now);httpStatus=data.replayed?200:201}
  else{
   const raw=await readJSON(request),batch=validateBatch(raw,registry,now);
   data=await saveBatch(env.DB,batch,now);httpStatus=data.replayed?200:201;
  }
  return response(data,httpStatus,allowedOrigin,requestId);
 }catch(error){
  const known=error instanceof ApiError,status=known?error.status:503;
  return response({error:{code:known?error.code:'service_unavailable',requestId}},status,allowedOrigin,requestId,status===429?{'Retry-After':'60'}:{});
 }
}
export async function expireOffers(env,now=Date.now()){if(!env.DB)throw Error('storage_unavailable');await expire(env.DB,now)}
export default {fetch(request,env){return handleRequest(request,env)},async scheduled(event,env){await expireOffers(env,event.scheduledTime)}};
