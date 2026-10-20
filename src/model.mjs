import {costTable} from './data.mjs';
export const EXAMPLE_EUR_HUF=400;
export function calculate(deal,{city='Budapest',travelers=2,bag=true,transfer=true}={}) {
 const count=Math.max(1,Math.min(8,Math.trunc(Number(travelers))||1));
 const lines={base:deal.base,accommodation:deal.accommodation??0,ground:(costTable[city]||costTable.Budapest)[deal.airport],baggage:bag?deal.bag:0,destinationTransfer:transfer?deal.transfer:0,port:deal.port};
 if(Object.values(lines).some(value=>typeof value!=='number'||!Number.isFinite(value)||value<0))throw new RangeError('Incomplete or invalid sample trip costs');
 const perPerson=Object.values(lines).reduce((sum,n)=>sum+n,0);
 return {lines,perPerson,group:perPerson*count,travelers:count};
}
export function selectDeals(deals,{type='all',city='Budapest',days=30,budget=Infinity,scoreOnly=false,sort='recommended'}={}) {
 return deals.filter(d=>(type==='all'||d.type===type)&&d.days<=Number(days)&&calculate(d,{city}).perPerson<=Number(budget)&&(!scoreOnly||d.score>=80))
 .sort((a,b)=>sort==='price'?calculate(a,{city}).perPerson-calculate(b,{city}).perPerson:sort==='score'?b.score-a.score:0);
}
