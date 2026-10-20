import {ApiError,fail,key,sha256,validateFreshBatch} from './validation.mjs';
const iso=now=>new Date(now).toISOString();
export async function saveBatch(db,batch,now){
 const {source,batchId,offers}=batch;
 const hash=await sha256(JSON.stringify({sourceId:source.id,batchId,offers}));
 const receipt=()=>db.prepare('SELECT payload_hash,offer_count FROM import_batches WHERE source_id=? AND batch_id=?').bind(source.id,batchId).first();
 const replay=previous=>{if(previous.payload_hash!==hash)fail('idempotency_conflict',409);return {batchId,accepted:previous.offer_count,replayed:true}};
 const previous=await receipt();if(previous)return replay(previous);
 validateFreshBatch(batch,now);
 const statements=[db.prepare('INSERT INTO import_batches(source_id,batch_id,payload_hash,offer_count,received_at) VALUES(?,?,?,?,?)').bind(source.id,batchId,hash,offers.length,iso(now))];
 for(const offer of offers){
  const comparison=[key(offer.origin),key(offer.destination),offer.departureDate,offer.returnDate,offer.travelers,offer.currency,offer.inclusions];
  const id=await sha256(JSON.stringify([source.id,offer.externalId,comparison]));
  const {externalId,...payload}=offer;
  statements.push(db.prepare(`INSERT INTO offers(id,source_id,external_id,origin_key,destination_key,currency,departure_date,observed_at,expires_at,payload,status,updated_at)
   VALUES(?,?,?,?,?,?,?,?,?,?,'active',?) ON CONFLICT(id) DO UPDATE SET observed_at=excluded.observed_at,expires_at=excluded.expires_at,payload=excluded.payload,status='active',updated_at=excluded.updated_at
   WHERE excluded.observed_at>offers.observed_at`).bind(id,source.id,externalId,key(offer.origin),key(offer.destination),offer.currency,offer.departureDate,offer.observedAt,offer.expiresAt,JSON.stringify(payload),iso(now)));
  statements.push(db.prepare(`INSERT INTO observations(offer_id,observed_at,total_price_minor,expires_at,booking_url,received_at) VALUES(?,?,?,?,?,?) ON CONFLICT(offer_id,observed_at) DO NOTHING`).bind(id,offer.observedAt,offer.totalPriceMinor,offer.expiresAt,offer.bookingUrl,iso(now)));
 }
 try{await db.batch(statements)}catch(error){
  const raced=await receipt();if(raced)return replay(raced);
  if(String(error?.message).includes('observation_conflict'))throw new ApiError(409,'observation_conflict');
  throw error;
 }
 return {batchId,accepted:offers.length,replayed:false};
}
export async function withdrawBatch(db,batch,now){
 const {source,batchId,externalIds}=batch;
 const hash=await sha256(JSON.stringify({action:'withdraw',sourceId:source.id,batchId,externalIds}));
 const receipt=()=>db.prepare('SELECT payload_hash,offer_count FROM import_batches WHERE source_id=? AND batch_id=?').bind(source.id,batchId).first();
 const replay=previous=>{if(previous.payload_hash!==hash)fail('idempotency_conflict',409);return {batchId,accepted:previous.offer_count,replayed:true}};
 const previous=await receipt();if(previous)return replay(previous);
 const statements=[db.prepare('INSERT INTO import_batches(source_id,batch_id,payload_hash,offer_count,received_at) VALUES(?,?,?,?,?)').bind(source.id,batchId,hash,externalIds.length,iso(now))];
 for(const externalId of externalIds){
  statements.push(db.prepare('INSERT INTO withdrawals(source_id,external_id,withdrawn_at) VALUES(?,?,?) ON CONFLICT(source_id,external_id) DO UPDATE SET withdrawn_at=excluded.withdrawn_at WHERE excluded.withdrawn_at>withdrawals.withdrawn_at').bind(source.id,externalId,iso(now)));
  statements.push(db.prepare("UPDATE offers SET status='withdrawn',updated_at=? WHERE source_id=? AND external_id=? AND observed_at<=?").bind(iso(now),source.id,externalId,iso(now)));
 }
 try{await db.batch(statements)}catch(error){const raced=await receipt();if(raced)return replay(raced);throw error}
 return {batchId,accepted:externalIds.length,replayed:false};
}
function freshClause(registry,now){
 const enabled=registry.filter(s=>s.enabled);
 if(!enabled.length)return {sql:'0',args:[]};
 const args=[];
 const sql=enabled.map(source=>{args.push(source.id,iso(now-source.maxAgeMinutes*60000));return '(source_id=? AND observed_at>?)'}).join(' OR ');
 return {sql:`(${sql}) AND status='active' AND observed_at<=? AND expires_at>? AND departure_date>? AND NOT EXISTS(SELECT 1 FROM withdrawals w WHERE w.source_id=offers.source_id AND w.external_id=offers.external_id AND w.withdrawn_at>=offers.observed_at)`,args:[...args,iso(now),iso(now),iso(now).slice(0,10)]};
}
function publicOffer(row,registry){
 const source=registry.find(s=>s.id===row.source_id&&s.enabled);if(!source)return null;
 const payload=JSON.parse(row.payload);
 payload.expiresAt=new Date(Math.min(Date.parse(payload.expiresAt),Date.parse(payload.observedAt)+source.maxAgeMinutes*60000,Date.parse(payload.departureDate))).toISOString();
 const link=new URL(payload.bookingUrl);
 if(link.protocol!=='https:'||link.username||link.password||!source.allowedHosts.includes(link.hostname))return null;
 return {id:row.id,...payload,source:{id:source.id,name:source.name,kind:source.kind}};
}
export async function listOffers(db,registry,filter,now){
 const clause=freshClause(registry,now);const args=[...clause.args];let sql=clause.sql;
 if(filter.origin){sql+=' AND instr(origin_key,?)>0';args.push(filter.origin)}
 if(filter.destination){sql+=' AND instr(destination_key,?)>0';args.push(filter.destination)}
 if(filter.currency){sql+=' AND currency=?';args.push(filter.currency)}
 args.push(filter.limit+1);
 const {results}=await db.prepare(`SELECT id,source_id,payload FROM offers WHERE ${sql} ORDER BY observed_at DESC,id ASC LIMIT ?`).bind(...args).all();
 const rows=results.map(row=>publicOffer(row,registry)).filter(Boolean);
 return {asOf:iso(now),offers:rows.slice(0,filter.limit),hasMore:rows.length>filter.limit};
}
export async function offerHistory(db,registry,id,now){
 const clause=freshClause(registry,now);
 const row=await db.prepare(`SELECT id,source_id,payload FROM offers WHERE id=? AND ${clause.sql}`).bind(id,...clause.args).first();
 const offer=row&&publicOffer(row,registry);if(!offer)fail('offer_not_found',404);
 const {results}=await db.prepare('SELECT observed_at,total_price_minor FROM observations WHERE offer_id=? AND observed_at>=? AND observed_at<=? ORDER BY observed_at DESC LIMIT 90').bind(id,iso(now-90*86400000),iso(now)).all();
 return {offerId:id,asOf:iso(now),currency:offer.currency,basis:'per_person',source:offer.source,history:results.map(r=>({observedAt:r.observed_at,totalPriceMinor:r.total_price_minor}))};
}
export async function status(db,registry,now){
 const counts=await db.prepare('SELECT (SELECT count(*) FROM offers) offers,(SELECT count(*) FROM observations) observations,(SELECT count(*) FROM import_batches) batches').first();
 const lastMaintenance=await db.prepare("SELECT completed_at FROM maintenance WHERE name='expiry'").first();
 return {asOf:iso(now),counts,enabledSources:registry.filter(s=>s.enabled).map(s=>s.id),lastExpiryRun:lastMaintenance?.completed_at??null};
}
export async function expire(db,now){
 const time=iso(now);
 await db.batch([
  db.prepare("UPDATE offers SET status='expired' WHERE id IN (SELECT id FROM offers WHERE status='active' AND (expires_at<=? OR departure_date<=?) LIMIT 1000)").bind(time,time.slice(0,10)),
  db.prepare("INSERT INTO maintenance(name,completed_at) VALUES('expiry',?) ON CONFLICT(name) DO UPDATE SET completed_at=excluded.completed_at").bind(time)
 ]);
}
