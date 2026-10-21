// Regenerates content/experiences.json from the partner catalogue.
// Run by hand when the catalogue changes: node scripts/sync-experiences.mjs
// Curated notes and localized names already in the file are kept.
import {readFile,writeFile} from 'node:fs/promises';
const API='https://wegotrip.com/api/v1';
const AGENT='tripgoes-config/1.0 (https://tripgoes.com)';
const MIN_PRODUCTS=20;

const HU_CITIES={Paris:'Párizs','New York City':'New York',Amsterdam:'Amszterdam',Rome:'Róma',Vienna:'Bécs',Prague:'Prága',Milan:'Milánó',Florence:'Firenze',Dubai:'Dubaj',Venice:'Velence',Lisbon:'Lisszabon',Naples:'Nápoly','Vatican City':'Vatikán',Istanbul:'Isztambul',Athens:'Athén',Singapore:'Szingapúr',Brussels:'Brüsszel','Abu Dhabi':'Abu-Dzabi','Cape Town':'Fokváros','Kraków':'Krakkó',Tokyo:'Tokió','Washington, D.C.':'Washington',Munich:'München',Cologne:'Köln',Warsaw:'Varsó',Moscow:'Moszkva',Copenhagen:'Koppenhága',Geneva:'Genf',Zurich:'Zürich',Turin:'Torino',Genoa:'Genova',Seville:'Sevilla',Lyon:'Lyon',Nice:'Nizza',Dresden:'Drezda',Leipzig:'Lipcse',Nuremberg:'Nürnberg',Bratislava:'Pozsony',Belgrade:'Belgrád',Bucharest:'Bukarest',Sofia:'Szófia',Zagreb:'Zágráb',Kyiv:'Kijev','Saint Petersburg':'Szentpétervár','Mexico City':'Mexikóváros',Cairo:'Kairó',Jerusalem:'Jeruzsálem',Beijing:'Peking',Seoul:'Szöul',Bangkok:'Bangkok'};
const HU_COUNTRIES={Australia:'Ausztrália',Austria:'Ausztria',Belgium:'Belgium',Czechia:'Csehország',France:'Franciaország',Germany:'Németország',Greece:'Görögország',Hungary:'Magyarország',Italy:'Olaszország',Japan:'Japán',Netherlands:'Hollandia',Poland:'Lengyelország',Portugal:'Portugália',Singapore:'Szingapúr','South Africa':'Dél-afrikai Köztársaság',Spain:'Spanyolország',Turkey:'Törökország','United Arab Emirates':'Egyesült Arab Emírségek','United Kingdom':'Egyesült Királyság','United States':'Egyesült Államok',Vatican:'Vatikán',Switzerland:'Svájc',Ireland:'Írország',Denmark:'Dánia',Sweden:'Svédország',Norway:'Norvégia',Finland:'Finnország',Croatia:'Horvátország',Slovenia:'Szlovénia',Slovakia:'Szlovákia',Romania:'Románia',Bulgaria:'Bulgária',Serbia:'Szerbia',Israel:'Izrael',Egypt:'Egyiptom',Morocco:'Marokkó',Mexico:'Mexikó',Brazil:'Brazília',Argentina:'Argentína',Canada:'Kanada',China:'Kína','South Korea':'Dél-Korea',Thailand:'Thaiföld',India:'India',Indonesia:'Indonézia',Malaysia:'Malajzia',Vietnam:'Vietnam',Iceland:'Izland',Estonia:'Észtország',Latvia:'Lettország',Lithuania:'Litvánia',Malta:'Málta',Cyprus:'Ciprus',Luxembourg:'Luxemburg',Monaco:'Monaco'};

// Spread the load; the catalogue is a courtesy, not a paid endpoint.
async function get(path,tries=4){
 for(let attempt=1;;attempt++){
  try{
   const response=await fetch(`${API}/${path}`,{headers:{'User-Agent':AGENT}});
   if(!response.ok)throw Error(`HTTP ${response.status}`);
   return await response.json();
  }catch(error){
   if(attempt===tries)throw error;
   await new Promise(resolve=>setTimeout(resolve,2000*attempt));
  }
 }
}
async function pages(path){
 const out=[];
 for(let page=1;;page++){
  const data=await get(`${path}${path.includes('?')?'&':'?'}limit=100&page=${page}`);
  out.push(...data.results);
  if(!data.next)return out;
 }
}
const pool=async(items,size,worker)=>{
 const results=[],queue=[...items.entries()];
 await Promise.all(Array.from({length:size},async()=>{
  for(let next=queue.shift();next;next=queue.shift())results[next[0]]=await worker(next[1]);
 }));
 return results;
};

// Map coordinates, by GeoNames id so nothing is matched on a name.
async function wikidataCoordinates(ids){
 const query=`SELECT ?geo ?coord WHERE { VALUES ?geo {${ids.map(id=>`"${id}"`).join(' ')}} ?city wdt:P1566 ?geo; wdt:P625 ?coord. }`;
 const response=await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`,{headers:{'User-Agent':AGENT,Accept:'application/sparql-results+json'}});
 if(!response.ok)throw Error(`Wikidata HTTP ${response.status}`);
 const found=new Map();
 for(const row of (await response.json()).results.bindings){
  const point=/^Point\((-?[\d.]+) (-?[\d.]+)\)$/.exec(row.coord.value);
  if(point&&!found.has(row.geo.value))found.set(row.geo.value,{lat:Number(point[2]),lon:Number(point[1])});
 }
 return found;
}
async function nominatimCoordinates(name,country){
 const query=new URLSearchParams({city:name,country,format:'json',limit:'1'});
 const response=await fetch(`https://nominatim.openstreetmap.org/search?${query}`,{headers:{'User-Agent':AGENT}});
 if(!response.ok)throw Error(`Nominatim HTTP ${response.status}`);
 const [hit]=await response.json();
 // One request per second is the published courtesy limit.
 await new Promise(resolve=>setTimeout(resolve,1200));
 return hit?{lat:Number(hit.lat),lon:Number(hit.lon)}:null;
}

const current=JSON.parse(await readFile('content/experiences.json','utf8'));
const countries=(await pages('countries/')).filter(country=>(country.products_count??0)>=MIN_PRODUCTS);
console.log(`${countries.length} countries carry at least ${MIN_PRODUCTS} products.`);
const lists=await pool(countries,4,country=>pages(`cities/?country_id=${country.id}&has_products=true`).then(cities=>cities.map(city=>({...city,country:country.name}))));
const candidates=lists.flat();
console.log(`${candidates.length} cities to measure.`);
const measured=await pool(candidates,4,async city=>({...city,products:(await get(`products/?city_id=${city.id}&limit=1`)).count}));
const kept=measured.filter(city=>city.products>=MIN_PRODUCTS).sort((a,b)=>b.products-a.products);

// A few real program names per city, so the page says something of its own
// before the widget loads. The catalogue order is fixed, so pick the
// best-reviewed and keep the title as the partner writes it.
// The full product records: these render as our own cards, so we need the
// picture, the price and the rating, not just a title.
const CARDS=12;
const catalogue={};
const samples=await pool(kept,4,async city=>{
 const {results}=await get(`products/?city_id=${city.id}&limit=40`);
 catalogue[city.id]=results
  .filter(product=>product.status==='approved'&&product.title&&product.slug&&product.locale?.code==='en'&&(product.price??0)>0)
  .sort((a,b)=>(b.ratings_count??0)*(b.rating??0)-(a.ratings_count??0)*(a.rating??0))
  .slice(0,CARDS)
  .map(product=>({id:product.id,slug:product.slug,title:product.title.trim().slice(0,160),
   price:Math.round(product.price*100)/100,currency:product.request_currency?.code??'EUR',
   rating:product.rating??0,ratings:product.ratings_count??0,
   image:product.preview||product.cover||''}));
 return results
  .filter(product=>product.status==='approved'&&product.title&&product.locale?.code==='en')
  .sort((a,b)=>(b.ratings_count??0)*(b.rating??0)-(a.ratings_count??0)*(a.rating??0))
  .map(product=>product.title.replace(new RegExp(`^${city.name}: *`,'i'),'').trim().slice(0,80))
  // The catalogue carries near-identical variants of the same attraction.
  .filter((title,index,all)=>all.findIndex(other=>other.slice(0,18)===title.slice(0,18))===index)
  .slice(0,4);
});
kept.forEach((city,index)=>{city.top=samples[index];});

const previous=new Map(current.cities?.map(city=>[city.cityId,city])??[]);
const unplaced=kept.filter(city=>!previous.get(String(city.id))?.lat);
const located=unplaced.length?await wikidataCoordinates(unplaced.map(city=>String(city.id))):new Map();
for(const city of unplaced){
 const point=located.get(String(city.id))??await nominatimCoordinates(city.name,city.country);
 if(!point)throw Error(`No coordinates for ${city.name} (${city.id}); add them by hand.`);
 located.set(String(city.id),point);
}
const cities=kept.map(city=>{
 const before=previous.get(String(city.id))??{};
 // Their slug sometimes carries the id; ours is a plain name.
 const slug=city.slug.replace(new RegExp(`-${city.id}$`),'');
 return {slug:before.slug??slug,cityId:String(city.id),providerSlug:city.slug,name:city.name,country:city.country,products:city.products,
  ...(before.hu??HU_CITIES[city.name]?{hu:before.hu??HU_CITIES[city.name]}:{}),
  lat:Number((before.lat??located.get(String(city.id)).lat).toFixed(4)),
  lon:Number((before.lon??located.get(String(city.id)).lon).toFixed(4)),
  ...(city.top?.length?{top:city.top}:{}),
  ...(before.notes?{notes:before.notes}:{})};
});
// Two cities on the same pixel means the lower one can never be clicked: the
// Vatican sits inside Rome, and its tours already appear in Rome's list.
const MIN_KM=15;
const km=(a,b)=>{const R=6371,rad=Math.PI/180,dLat=(b.lat-a.lat)*rad,dLon=(b.lon-a.lon)*rad,
 h=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLon/2)**2;
 return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));};
const placed=[];
for(const city of cities.slice()){
 const clash=placed.find(other=>km(other,city)<MIN_KM);
 if(clash){
  console.log(`Dropping ${city.name}: ${Math.round(km(clash,city))} km from ${clash.name}, the dots would sit on top of each other.`);
  cities.splice(cities.indexOf(city),1);
 } else placed.push(city);
}

const used=new Set();
for(const city of cities)if(used.size===used.add(city.slug).size)throw Error(`Duplicate slug: ${city.slug}`);
const names={};
for(const name of [...new Set(cities.map(city=>city.country))].sort())names[name]=current.countries?.[name]??HU_COUNTRIES[name]??name;

await writeFile('content/activities.json',JSON.stringify({version:1,generated:new Date().toISOString().slice(0,10),
 cities:Object.fromEntries(cities.map(city=>[city.slug,catalogue[Number(city.cityId)]??[]]))},null,1));
await writeFile('content/experiences.json',JSON.stringify({...current,version:2,generated:new Date().toISOString().slice(0,10),minProducts:MIN_PRODUCTS,countries:names,cities},null,1)+'\n');
console.log(`Kept ${cities.length} cities in ${Object.keys(names).length} countries (${cities.at(-1).products}–${cities[0].products} products each).`);
const missing=cities.filter(city=>!city.hu).map(city=>city.name);
if(missing.length)console.log(`No Hungarian name for: ${missing.join(', ')} (the English name is used).`);
