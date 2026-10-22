// Regenerates content/packages.json from the partner package feeds.
// The feeds are per-account, so their URLs come from the environment and
// never from the repository:
//   INVIA_FEED_BOMBS=... INVIA_FEED_DREAM=... node scripts/sync-packages.mjs
//
// Prices move daily, so the file carries the date it was read and the build
// labels it — the same honesty the cached fares already use.
import {readFile,writeFile} from 'node:fs/promises';

export const AFFILIATE_ID='9426177';
export const OFFER_HOST='www.invia.hu';
export const IMAGE_HOST='https://dcontent.inviacdn.net';
// The feed prices in forint, which is what the booking actually costs. The
// English pages show an approximate euro beside it, and an approximation is
// only worth printing when the rate behind it is real and dated.
const ECB='https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
async function euroRate(){
 try{
  const response=await fetch(ECB,{headers:{'User-Agent':'tripgoes-config/1.0 (https://tripgoes.com)'}});
  if(!response.ok)throw Error(`HTTP ${response.status}`);
  const xml=await response.text();
  const eur=Number(xml.match(/currency=['"]HUF['"]\s+rate=['"]([\d.]+)['"]/)?.[1]);
  const date=xml.match(/time=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1];
  if(!(eur>0)||!date)throw Error('no HUF rate in the ECB feed');
  return {eur,date,source:'ECB'};
 }catch(error){
  // No rate beats a stale guess: the euro line simply stays off.
  console.log(`No euro rate (${error.message}); English pages show forint only.`);
  return null;
 }
}
// Enough for a card and a small gallery; the feed ships ~70 per offer.
const PHOTOS=5;

const ENTITIES={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
const decode=value=>value
 .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
 .replace(/&#(\d+);/g,(all,code)=>String.fromCharCode(Number(code)))
 .replace(/&(\w+);/g,(all,name)=>ENTITIES[name]??all)
 .trim();
// The feed is machine-generated and shallow, so a dependency would buy
// nothing: one tag reader covers every field we read.
const tag=(xml,name)=>{
 const found=xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
 return found?decode(found[1]):'';
};
const all=(xml,name)=>[...xml.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`,'g'))].map(hit=>decode(hit[1]));
const num=value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;};

function parseOffer(xml,source){
 const url=tag(xml,'url');
 // Without our id the click earns nothing, so a stray offer is dropped
 // rather than shipped as a link that pays someone else.
 let link;
 try{link=new URL(url);}catch{return null;}
 if(link.hostname!==OFFER_HOST||link.searchParams.get('aid')!==AFFILIATE_ID)return null;
 const hotelId=tag(xml,'hotelinfo').match(/<id>(\d+)<\/id>/)?.[1];
 const from=tag(xml,'from'),to=tag(xml,'to');
 if(!hotelId||!/^\d{4}-\d{2}-\d{2}$/.test(from))return null;
 const photos=all(xml,'photo').filter(photo=>photo.startsWith(IMAGE_HOST)).slice(0,PHOTOS);
 const price=num(tag(xml,'totalprice'));
 // A card without a picture is not worth showing, and the handful that
 // carry none are the ones sold without a flight anyway.
 if(!price||price<=0||!photos.length)return null;
 // <length> counts calendar days with both ends included, so it should be
 // exactly one more than the nights the dates span. In about 7% of the feed
 // it is not: some records carry a <to> before their <from>. Then neither
 // number can be trusted, and an offer whose length we cannot state is not
 // one we are willing to sell.
 const nights=Math.round((Date.parse(to)-Date.parse(from))/86400000);
 if(!(nights>=1)||nights!==num(tag(xml,'length'))-1)return null;
 return {
  id:`${hotelId}-${from}`,source,
  country:tag(xml,'country'),locality:tag(xml,'locality'),
  hotel:tag(xml,'hotel'),stars:num(tag(xml,'hotelinfo').match(/<stars>([\d.]+)<\/stars>/)?.[1]),
  from,to,nights,
  price,currency:xml.match(/<totalprice currency="(\w+)"/)?.[1]??'HUF',
  discount:num(tag(xml,'discount'))??0,
  food:tag(xml,'food'),transport:tag(xml,'transportation'),
  airport:all(xml,'airport')[0]??'',
  type:tag(xml,'type'),
  image:photos[0]??'',photos,
  href:url,
 };
}

export function parseFeed(xml,source){
 return [...xml.matchAll(/<offer[^>]*>([\s\S]*?)<\/offer>/g)]
  .map(hit=>parseOffer(hit[1],source))
  .filter(Boolean);
}

if(process.argv[1]?.endsWith('sync-packages.mjs')){
 const feeds={bombs:process.env.INVIA_FEED_BOMBS,dream:process.env.INVIA_FEED_DREAM};
 const missing=Object.entries(feeds).filter(([,url])=>!url).map(([name])=>name);
 if(missing.length)throw Error(`Missing feed URL for: ${missing.join(', ')}. Set INVIA_FEED_BOMBS and INVIA_FEED_DREAM.`);
 const offers=[],seen=new Set();
 for(const [source,url] of Object.entries(feeds)){
  const response=await fetch(url,{headers:{'User-Agent':'tripgoes-config/1.0 (https://tripgoes.com)'}});
  if(!response.ok)throw Error(`${source}: HTTP ${response.status}`);
  const text=await response.text();
  const parsed=parseFeed(text,source);
  const total=(text.match(/<offer[\s>]/g)||[]).length;
  console.log(`${source}: ${parsed.length} offers (${total-parsed.length} dropped: no picture, no price, or dates that contradict the stated length)`);
  // The dream feed repeats a few of the bargain feed's hotels; the first
  // one wins so an offer never appears twice in the same list.
  for(const offer of parsed)if(!seen.has(offer.id)){seen.add(offer.id);offers.push(offer);}
 }
 offers.sort((a,b)=>b.discount-a.discount||a.price-b.price);
 const countries={};
 for(const offer of offers)countries[offer.country]=(countries[offer.country]??0)+1;
 // Destinations only ever get added to this list. A country that drops out of
 // today's feed keeps its page, because the URL may already rank.
 const before=await readFile('content/packages.json','utf8').then(JSON.parse).catch(()=>({}));
 const MIN=3;
 const qualifying=Object.entries(countries).filter(([,count])=>count>=MIN).map(([name])=>name);
 const published=[...new Set([...(before.published??[]),...qualifying])].sort();
 // The same promise for destination-and-board pages: once one has earned a
 // URL it keeps it, whatever tomorrow's feed happens to carry.
 const boardCounts={};
 for(const offer of offers)boardCounts[`${offer.country}|${offer.food}`]=(boardCounts[`${offer.country}|${offer.food}`]??0)+1;
 const qualifyingBoards=Object.entries(boardCounts).filter(([,count])=>count>=MIN).map(([key])=>key);
 const publishedBoards=[...new Set([...(before.publishedBoards??[]),...qualifyingBoards])].sort();
 const rate=await euroRate();
 if(rate)console.log(`1 EUR = ${rate.eur} HUF (${rate.source}, ${rate.date}).`);
 await writeFile('content/packages.json',JSON.stringify({
  version:1,generated:new Date().toISOString().slice(0,10),
  rate,published,publishedBoards,countries,offers,
 },null,1)+'\n');
 console.log(`${published.length} destinations and ${publishedBoards.length} destination+board pages (${published.length-qualifying.length}+${publishedBoards.length-qualifyingBoards.length} carried over from earlier feeds).`);
 const prices=offers.map(offer=>offer.price).sort((a,b)=>a-b);
 console.log(`Kept ${offers.length} offers in ${Object.keys(countries).length} countries (${prices[0].toLocaleString('hu')}–${prices.at(-1).toLocaleString('hu')} Ft).`);
}
