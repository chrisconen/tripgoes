// Regenerates content/experiences.json from the partner catalogue.
// Run by hand when the catalogue changes: node scripts/sync-experiences.mjs
// Curated notes and localized names already in the file are kept.
import {readFile,writeFile} from 'node:fs/promises';
const API='https://wegotrip.com/api/v1';
const MIN_PRODUCTS=20;

const HU_CITIES={Paris:'Párizs','New York City':'New York',Amsterdam:'Amszterdam',Rome:'Róma',Vienna:'Bécs',Prague:'Prága',Milan:'Milánó',Florence:'Firenze',Dubai:'Dubaj',Venice:'Velence',Lisbon:'Lisszabon',Naples:'Nápoly','Vatican City':'Vatikán',Istanbul:'Isztambul',Athens:'Athén',Singapore:'Szingapúr',Brussels:'Brüsszel','Abu Dhabi':'Abu-Dzabi','Cape Town':'Fokváros','Kraków':'Krakkó',Tokyo:'Tokió','Washington, D.C.':'Washington',Munich:'München',Cologne:'Köln',Warsaw:'Varsó',Moscow:'Moszkva',Copenhagen:'Koppenhága',Geneva:'Genf',Zurich:'Zürich',Turin:'Torino',Genoa:'Genova',Seville:'Sevilla',Lyon:'Lyon',Nice:'Nizza',Dresden:'Drezda',Leipzig:'Lipcse',Nuremberg:'Nürnberg',Bratislava:'Pozsony',Belgrade:'Belgrád',Bucharest:'Bukarest',Sofia:'Szófia',Zagreb:'Zágráb',Kyiv:'Kijev','Saint Petersburg':'Szentpétervár','Mexico City':'Mexikóváros',Cairo:'Kairó',Jerusalem:'Jeruzsálem',Beijing:'Peking',Seoul:'Szöul',Bangkok:'Bangkok'};
const HU_COUNTRIES={Australia:'Ausztrália',Austria:'Ausztria',Belgium:'Belgium',Czechia:'Csehország',France:'Franciaország',Germany:'Németország',Greece:'Görögország',Hungary:'Magyarország',Italy:'Olaszország',Japan:'Japán',Netherlands:'Hollandia',Poland:'Lengyelország',Portugal:'Portugália',Singapore:'Szingapúr','South Africa':'Dél-afrikai Köztársaság',Spain:'Spanyolország',Turkey:'Törökország','United Arab Emirates':'Egyesült Arab Emírségek','United Kingdom':'Egyesült Királyság','United States':'Egyesült Államok',Vatican:'Vatikán',Switzerland:'Svájc',Ireland:'Írország',Denmark:'Dánia',Sweden:'Svédország',Norway:'Norvégia',Finland:'Finnország',Croatia:'Horvátország',Slovenia:'Szlovénia',Slovakia:'Szlovákia',Romania:'Románia',Bulgaria:'Bulgária',Serbia:'Szerbia',Israel:'Izrael',Egypt:'Egyiptom',Morocco:'Marokkó',Mexico:'Mexikó',Brazil:'Brazília',Argentina:'Argentína',Canada:'Kanada',China:'Kína','South Korea':'Dél-Korea',Thailand:'Thaiföld',India:'India',Indonesia:'Indonézia',Malaysia:'Malajzia',Vietnam:'Vietnam',Iceland:'Izland',Estonia:'Észtország',Latvia:'Lettország',Lithuania:'Litvánia',Malta:'Málta',Cyprus:'Ciprus',Luxembourg:'Luxemburg',Monaco:'Monaco'};

// Spread the load; the catalogue is a courtesy, not a paid endpoint.
async function get(path,tries=4){
 for(let attempt=1;;attempt++){
  try{
   const response=await fetch(`${API}/${path}`,{headers:{'User-Agent':'tripgoes-config/1.0'}});
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
const samples=await pool(kept,4,async city=>{
 const {results}=await get(`products/?city_id=${city.id}&limit=40`);
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
const cities=kept.map(city=>{
 const before=previous.get(String(city.id))??{};
 // Their slug sometimes carries the id; ours is a plain name.
 const slug=city.slug.replace(new RegExp(`-${city.id}$`),'');
 return {slug:before.slug??slug,cityId:String(city.id),name:city.name,country:city.country,products:city.products,
  ...(before.hu??HU_CITIES[city.name]?{hu:before.hu??HU_CITIES[city.name]}:{}),
  ...(city.top?.length?{top:city.top}:{}),
  ...(before.notes?{notes:before.notes}:{})};
});
const used=new Set();
for(const city of cities)if(used.size===used.add(city.slug).size)throw Error(`Duplicate slug: ${city.slug}`);
const names={};
for(const name of [...new Set(cities.map(city=>city.country))].sort())names[name]=current.countries?.[name]??HU_COUNTRIES[name]??name;

await writeFile('content/experiences.json',JSON.stringify({...current,version:2,generated:new Date().toISOString().slice(0,10),minProducts:MIN_PRODUCTS,countries:names,cities},null,1)+'\n');
console.log(`Kept ${cities.length} cities in ${Object.keys(names).length} countries (${cities.at(-1).products}–${cities[0].products} products each).`);
const missing=cities.filter(city=>!city.hu).map(city=>city.name);
if(missing.length)console.log(`No Hungarian name for: ${missing.join(', ')} (the English name is used).`);
