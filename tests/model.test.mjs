import test from 'node:test';
import assert from 'node:assert/strict';
import {calculate,selectDeals} from '../src/model.mjs';
import {deals} from '../src/data.mjs';
test('cost review fixes reject missing ground costs and use whole travellers',()=>{
 assert.equal(calculate(deals[0],{travelers:2.7}).travelers,2);
 assert.throws(()=>calculate({...deals[0],airport:'UNKNOWN'}),RangeError);
 assert.throws(()=>calculate({...deals[0],base:NaN}),RangeError);
});
test('Amalfi includes return transport, bag, transfer and group multiplication',()=>{
 const r=calculate(deals[0]); assert.equal(r.perPerson,122700);assert.equal(r.group,245400);
 assert.equal(calculate(deals[0],{bag:false,transfer:false,city:'Győr',travelers:3}).perPerson,99900);
 assert.equal(calculate(deals[0],{bag:false,transfer:false,city:'Győr',travelers:3}).group,299700);
});
test('cruise port costs remain even when baggage and transfer are disabled',()=>{
 const d=deals.find(d=>d.id==='cruise');
 assert.equal(calculate(d,{city:'Pécs',bag:false,transfer:false,travelers:1}).perPerson,219900);
});
test('flight totals include accommodation, not just the advertised fare',()=>{
 assert.equal(calculate(deals.find(d=>d.id==='rome')).perPerson,87700);
 assert.equal(calculate(deals.find(d=>d.id==='madeira')).perPerson,205900);
});
test('budget filter uses complete costs from selected city',()=>{
 assert.deepEqual(selectDeals(deals,{budget:80000}).map(d=>d.id),['barcelona']);
 assert.equal(selectDeals(deals,{city:'Debrecen',budget:80000}).length,0);
});
test('category, timeframe and score compose predictably',()=>{
 assert.equal(selectDeals(deals,{type:'cruise',days:7}).length,0);
 assert.deepEqual(selectDeals(deals,{days:7,scoreOnly:true}).map(d=>d.id),['amalfi']);
 assert.equal(selectDeals(deals,{scoreOnly:true}).length,5);
});
test('sorting is stable and does not mutate source',()=>{
 const ids=deals.map(d=>d.id);
 assert.equal(selectDeals(deals,{sort:'price'})[0].id,'barcelona');
 assert.equal(selectDeals(deals,{sort:'score'})[0].id,'amalfi');
 assert.deepEqual(deals.map(d=>d.id),ids);
});
test('traveller count is bounded and unknown city falls back safely',()=>{
 assert.equal(calculate(deals[0],{travelers:99}).travelers,8);
 assert.equal(calculate(deals[0],{travelers:0}).travelers,1);
 assert.equal(calculate(deals[0],{city:'unknown'}).perPerson,122700);
});
