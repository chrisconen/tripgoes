import test from 'node:test';
import assert from 'node:assert/strict';
import {SCORE_DRAFT_KEY,MAX_DRAFT_LENGTH,createDraft,parseDraft,readDraft,saveDraft,deleteDraft} from '../src/score-draft.mjs';
import {checkerPage} from '../src/checker.mjs';

const now='2026-10-20T12:00:00.000Z';
const input=()=>({
 evidence:'user-entered',
 fields:{route:'BUD → BCN',departureDate:'2026-11-10',nights:'3',travelers:'2',currency:'EUR',
  price:'125.50',baggage:'0',transfer:'',accommodation:'',other:'',inclusions:'Return flights, 3 nights'},
 history:[{date:'2026-10-20',price:'200'},{date:'',price:''}],
});
function memory(){
 const data=new Map();const counts={read:0,write:0,remove:0};
 return {counts,data,getItem(key){counts.read++;return data.get(key)??null},setItem(key,value){counts.write++;data.set(key,value)},removeItem(key){counts.remove++;data.delete(key)}};
}

test('partial drafts preserve known zero and blank costs and incomplete observation rows',()=>{
 const value=input();value.history.push({date:'2026-10-19',price:''});
 const draft=createDraft(value,{now});
 assert.equal(draft.fields.baggage,'0');assert.equal(draft.fields.transfer,'');
 assert.deepEqual(parseDraft(JSON.stringify(draft)),draft);
 assert.equal(draft.history[2].price,'');
 assert.equal(draft.savedAt,now);
});

test('restoration allowlist excludes results, confirmations, provenance assertions and unknown fields',()=>{
 const value=input();value.analysis={score:100};value.comparable=true;value.verified=true;
 value.fields.comparable=true;value.fields.score=100;value.history[0].evidence='verified';
 const draft=createDraft(value,{now});
 assert.deepEqual(Object.keys(draft),['version','savedAt','evidence','fields','history']);
 assert.equal(draft.analysis,undefined);assert.equal(draft.comparable,undefined);
 assert.equal(draft.fields.score,undefined);assert.equal(draft.fields.comparable,undefined);
 assert.deepEqual(draft.history[0],{date:'2026-10-20',price:'200'});
 for(const evidence of ['verified',undefined,null,'official']){
  assert.throws(()=>createDraft({...value,evidence},{now}),TypeError);
 }
 const raw=JSON.stringify({...draft,analysis:{score:100},comparable:true});
 assert.equal(parseDraft(raw).analysis,undefined);assert.equal(parseDraft(raw).comparable,undefined);
});

test('sample drafts retain their sample origin through storage and later edits',()=>{
 const storage=memory(),value=input();value.evidence='sample';
 assert.equal(saveDraft(value,{storage,now}).status,'ok');
 const restored=readDraft(storage).draft;
 assert.equal(restored.evidence,'sample');
 restored.fields.price='101';
 assert.equal(saveDraft(restored,{storage,now}).draft.evidence,'sample');
 assert.equal(readDraft(storage).draft.evidence,'sample');
});

test('storage reads never write and explicit actions affect only the dedicated key',()=>{
 const storage=memory();storage.data.set('unrelated','keep');
 assert.equal(readDraft(storage).status,'missing');
 assert.equal(storage.counts.write,0);assert.equal(storage.counts.remove,0);
 assert.equal(saveDraft(input(),{storage,now}).status,'ok');
 assert.ok(storage.data.has(SCORE_DRAFT_KEY));assert.equal(storage.counts.write,1);
 assert.equal(readDraft(storage).status,'ok');assert.equal(storage.counts.write,1);
 assert.equal(deleteDraft(storage).status,'ok');
 assert.equal(storage.data.get('unrelated'),'keep');assert.equal(readDraft(storage).status,'missing');
});

test('malformed, unsupported, oversized and suspicious storage fails closed without deletion',()=>{
 const valid=createDraft(input(),{now});
 for(const raw of ['{', 'null', '[]', '42', ' '.repeat(MAX_DRAFT_LENGTH+1),
  JSON.stringify({...valid,version:2}),JSON.stringify({...valid,evidence:'verified'}),
  JSON.stringify({...valid,savedAt:'2026-02-30T12:00:00.000Z'}),
  JSON.stringify({...valid,fields:{...valid.fields,currency:'<img>'}})]){
  assert.equal(parseDraft(raw),null);
  const storage=memory();storage.data.set(SCORE_DRAFT_KEY,raw);
  assert.equal(readDraft(storage).status,'invalid');assert.equal(storage.counts.remove,0);
  assert.equal(storage.counts.write,0);
 }
});

test('draft schema bounds every string, amount, calendar, party size and history length',()=>{
 for(const change of [{route:'x'.repeat(121)},{route:'BUD\nBCN'},{inclusions:'x'.repeat(241)},
  {departureDate:'2026-02-30'},{departureDate:'2026-1-1'},{currency:'BTC'},
  {travelers:'0'},{travelers:'100'},{travelers:'2.5'},{nights:'366'},{nights:'-1'},
  {price:'1000000000.01'},{price:'1e2'},{price:'1.234'},{price:'NaN'},
  {price:123},{other:'-1'},{transfer:'1,00'},{baggage:null}]){
  const value=input();Object.assign(value.fields,change);
  assert.throws(()=>createDraft(value,{now}),TypeError,JSON.stringify(change));
 }
 const thirty=input();thirty.history=Array.from({length:30},()=>({date:'',price:''}));
 assert.equal(createDraft(thirty,{now}).history.length,30);
 thirty.history.push({date:'',price:''});assert.throws(()=>createDraft(thirty,{now}),TypeError);
 for(const history of [null,[null],[{date:'2026-02-30',price:'1'}],[{date:'',price:'Infinity'}]]){
  assert.throws(()=>createDraft({...input(),history},{now}),TypeError);
 }
});

test('denied or full storage produces unavailable status without false success',()=>{
 const storage={getItem(){throw Error('denied')},setItem(){throw Error('quota')},removeItem(){throw Error('denied')}};
 assert.equal(readDraft(storage).status,'unavailable');
 assert.equal(saveDraft(input(),{storage,now}).status,'unavailable');
 assert.equal(deleteDraft(storage).status,'unavailable');
 const bad=input();bad.fields.price='-1';
 assert.equal(saveDraft(bad,{storage,now}).status,'invalid');
});

test('existing saved draft survives an invalid save attempt',()=>{
 const storage=memory();saveDraft(input(),{storage,now});
 const before=storage.data.get(SCORE_DRAFT_KEY),bad=input();bad.history=Array(31).fill({date:'',price:''});
 assert.equal(saveDraft(bad,{storage,now}).status,'invalid');
 assert.equal(storage.data.get(SCORE_DRAFT_KEY),before);
});

test('both locales expose explicit non-submit draft controls and accessible status',()=>{
 for(const lang of ['hu','en']){
  const html=checkerPage(lang);
  for(const action of ['save','load','delete'])assert.ok(html.includes(`type="button" id="lab-draft-${action}"`));
  assert.match(html,/id="lab-draft-status"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.ok(!html.includes('undefined'));
 }
});
