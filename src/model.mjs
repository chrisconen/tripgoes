import {costTable} from './data.mjs';
import {sampleCostCity} from './cities.mjs';
export const EXAMPLE_EUR_HUF=400;
export function calculate(deal,{city='Budapest',travelers=2,bag=true,transfer=true,ground}={}) {
 const count=Math.max(1,Math.min(8,Math.trunc(Number(travelers))||1));
 const knownCity=sampleCostCity(city);
 const transport=ground===undefined?(knownCity?costTable[knownCity][deal.airport]??null:null):ground;
 const lines={base:deal.base,accommodation:deal.accommodation??0,ground:transport,baggage:bag?deal.bag:0,destinationTransfer:transfer?deal.transfer:0,port:deal.port};
 if(Object.entries(lines).some(([key,value])=>!(key==='ground'&&value===null)&&(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1_000_000_000)))throw new RangeError('Incomplete or invalid sample trip costs');
 const knownSubtotal=Math.round(Object.values(lines).reduce((sum,n)=>sum+(n??0),0)*100)/100;
 const complete=transport!==null,perPerson=complete?knownSubtotal:null;
 return {lines,perPerson,group:complete?Math.round(perPerson*count*100)/100:null,travelers:count,complete,knownSubtotal};
}
export function selectDeals(deals,{type='all',city='Budapest',days=30,budget=Infinity,scoreOnly=false,sort='recommended'}={}) {
 return deals.filter(d=>{const price=calculate(d,{city}).perPerson;return (type==='all'||d.type===type)&&d.days<=Number(days)&&(Number(budget)===Infinity||(price!==null&&price<=Number(budget)))&&(!scoreOnly||d.score>=80)})
 .sort((a,b)=>{if(sort==='price'){const pa=calculate(a,{city}).perPerson,pb=calculate(b,{city}).perPerson;return pa===pb?0:pa===null?1:pb===null?-1:pa-pb}return sort==='score'?b.score-a.score:0});
}
