// Regenerates content/packages.json from the partner package feeds.
// The feeds are per-account, so their URLs come from the environment and
// never from the repository:
//   INVIA_FEED_BOMBS=... INVIA_FEED_DREAM=... node scripts/sync-packages.mjs
//
// Prices move daily, so the file carries the date it was read and the build
// labels it — the same honesty the cached fares already use.
import {writeFile} from 'node:fs/promises';

export const AFFILIATE_ID='9426177';
export const OFFER_HOST='www.invia.hu';
export const IMAGE_HOST='https://dcontent.inviacdn.net';
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
 return {
  id:`${hotelId}-${from}`,source,
  country:tag(xml,'country'),locality:tag(xml,'locality'),
  hotel:tag(xml,'hotel'),stars:num(tag(xml,'hotelinfo').match(/<stars>([\d.]+)<\/stars>/)?.[1]),
  from,to,nights:num(tag(xml,'length')),
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
  const parsed=parseFeed(await response.text(),source);
  console.log(`${source}: ${parsed.length} offers`);
  // The dream feed repeats a few of the bargain feed's hotels; the first
  // one wins so an offer never appears twice in the same list.
  for(const offer of parsed)if(!seen.has(offer.id)){seen.add(offer.id);offers.push(offer);}
 }
 offers.sort((a,b)=>b.discount-a.discount||a.price-b.price);
 const countries={};
 for(const offer of offers)countries[offer.country]=(countries[offer.country]??0)+1;
 await writeFile('content/packages.json',JSON.stringify({
  version:1,generated:new Date().toISOString().slice(0,10),
  countries,offers,
 },null,1)+'\n');
 const prices=offers.map(offer=>offer.price).sort((a,b)=>a-b);
 console.log(`Kept ${offers.length} offers in ${Object.keys(countries).length} countries (${prices[0].toLocaleString('hu')}–${prices.at(-1).toLocaleString('hu')} Ft).`);
}
