import {mkdir,cp,writeFile,readFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {copy} from '../src/locales.mjs';
import {loadArticles,journalIndex,journalArticle,articleImage,escapeHTML} from './journal.mjs';
import {checkerPage} from '../src/checker.mjs';
import {renderRecommendations} from './recommendations.mjs';
import {renderSharing} from '../src/sharing.mjs';
import {createView} from '../src/views.mjs';
import {plannerPage} from '../src/planner.mjs';
import {offersPage} from '../src/offers.mjs';
import {flightPage} from '../src/flights.mjs';
import {lastMinutePage} from '../src/lastminute.mjs';
import {validateExperiences,experiencesPage} from '../src/experiences.mjs';
import {validateActivities,activityCards,IMAGE_HOSTS} from '../src/activities.mjs';
import {validateServices,servicesPage,servicePolicy} from '../src/services.mjs';
import {validatePackages,packagesPage,packageGrid,packagesJsonLd,pageTitle,boardTitle,boardDescription,hasPage,foodSlug,allByAir,featuredOffer,featuredCard,COUNTRIES as PACKAGE_COUNTRIES,IMAGE_HOST as PACKAGE_IMAGES,MIN_FOR_PAGE} from '../src/packages.mjs';
import {toolsPage} from '../src/tools.mjs';
import {apiBase} from '../src/api-config.mjs';

const origin=(process.env.SITE_ORIGIN||'https://tripgoes.com').replace(/\/$/,'');
if(new URL(origin).protocol!=='https:')throw Error('SITE_ORIGIN must use HTTPS.');
const draft=process.env.DRAFT_BUILD==='1';
const articles=await loadArticles({draft});
// Start clean: a renamed or dropped page would otherwise linger and ship.
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
await cp('src','dist/src',{recursive:true});
await cp('assets','dist/assets',{recursive:true});
// HTML parsing normalizes CRLF; hash the same bytes on Windows and in CI.
const template=(await readFile('index.html','utf8')).replaceAll('\r\n','\n');
const travelpayoutsCode=template.match(/<script nowprocket[^>]*>([\s\S]*?)<\/script>/)?.[1];
if(!travelpayoutsCode)throw Error('Travelpayouts loader missing from shared head.');
const travelpayoutsHash=createHash('sha256').update(travelpayoutsCode).digest('base64');
const shell=template.replaceAll('{{origin}}',origin).replaceAll('{{travelpayoutsHash}}',travelpayoutsHash);
const experienceConfig=JSON.parse(await readFile('content/experiences.json','utf8'));
const experiences=experienceConfig.cities?.length?validateExperiences(experienceConfig):null;
const activityConfig=JSON.parse(await readFile('content/activities.json','utf8'));
const activities=experiences?validateActivities(activityConfig,experiences.cities):null;
// Our own cards, so the route needs the picture host and nothing else.
const widgetCSP=experiences?{scriptExtra:'',imgExtra:IMAGE_HOSTS.map(host=>` ${host}`).join(''),frameSrc:"'none'",connectExtra:[]}:null;
// The landing page shows real inventory, so it needs the real numbers.
const highlights=experiences?{total:experiences.cities.length,
 cities:experiences.cities.slice(0,8).map(city=>({slug:city.slug,title:city.title.hu,titleEn:city.title.en,products:city.products,sample:city.samples[0]??''}))}:null;
const packageConfig=JSON.parse(await readFile('content/packages.json','utf8'));
const packages=packageConfig.offers?.length?validatePackages(packageConfig):null;
// Complete trips are our own cards, so the route needs the picture host only.
const packageCSP=packages?{scriptExtra:'',imgExtra:[PACKAGE_IMAGES,...IMAGE_HOSTS].map(host=>` ${host}`).join(''),frameSrc:"'none'",connectExtra:[]}:null;
// The landing page leads with real trips: the deepest discounts first, then
// the long-haul ones. The feed is already sorted by discount.
// Where a destination also has bookable activities, the page says so. Our
// package countries are named in Hungarian and the activity cities in
// English, so the existing translation table is the bridge.
const CITY_ACTIVITY_CAP=4;
function activitiesForCountry(hungarianName,lang){
 if(!experiences||!activities)return '';
 const english=PACKAGE_COUNTRIES[hungarianName];
 if(!english)return '';
 const cities=experiences.cities.filter(city=>city.country===english);
 const products=cities.flatMap(city=>activities.catalogue.get(city.slug)??[]).slice(0,CITY_ACTIVITY_CAP);
 if(!products.length)return '';
 return activityCards(products,lang,{city:cities[0].title[lang],generated:activities.generated});
}
const packageFrom=packages?Math.min(...packages.offers.map(offer=>offer.price)):0;
const packageYears=packages?[...new Set(packages.offers.map(offer=>offer.from.slice(0,4)))].sort().join('–'):'';
// The featured slot takes the deepest discount, so the band below it starts
// at the next one rather than repeating it.
const featured=packages?featuredOffer(packages.offers):null;
const restOfOffers=packages?packages.offers.filter(offer=>offer!==featured):[];
const tripView=packages?lang=>({
 total:packages.offers.length,
 featured:featuredCard(featured,lang,{generated:packages.generated,rate:packages.rate}),
 deals:packageGrid(restOfOffers.slice(0,8),lang,{rate:packages.rate}),
 dream:packageGrid(packages.offers.filter(offer=>offer.source==='dream').slice(0,8),lang,{generated:packages.generated,rate:packages.rate}),
 destinations:packages.countries.filter(country=>country.count>=MIN_FOR_PAGE).slice(0,12)
  .map(country=>`<a href="/${lang}/utak/${country.slug}/">${escapeHTML(country.title[lang])}<span>${country.count}</span></a>`).join(''),
}):null;
const serviceConfig=JSON.parse(await readFile('content/services.json','utf8'));
const services=serviceConfig.widgets?.length?validateServices(serviceConfig):null;
const serviceCSP=services?servicePolicy(services):null;
const routes=['','about','contact','imprint','privacy','cookies','affiliate','guides','score','planner','flights','last-minute','eszkozok',...(packages?['utak']:[]),...(experiences?['experiences']:[]),...(services?['services']:[])];
// The homepage carried noindex, so the strongest page on the site was kept
// out of search entirely. Trust pages are indexed too, because a commercial
// site is judged on them; /guides/ stays out, it repeats the /blog/ list.
const INDEXED=new Set(['','about','contact','imprint','score','planner','eszkozok']);
if(apiBase&&(new URL(apiBase).protocol!=='https:'||new URL(apiBase).username||new URL(apiBase).password||new URL(apiBase).search||new URL(apiBase).hash))throw Error('Invalid public API endpoint.');
function render({lang,route='',title,description=copy[lang].metaDescription,content='',indexable=false,image='/assets/hero.jpg',imageAlt='',ogType='website',pageOverride}){
 const path=route?`${route}/`:'';
 const canonical=`${origin}/${lang}/${path}`;
 const view=createView({lang,page:route.split('/')[0],pathname:`/${lang}/${path}`,trips:route?null:tripView?.(lang),highlights:highlights&&{...highlights,cities:highlights.cities.map(city=>({...city,title:lang==='en'?city.titleEn:city.title}))}});
 const main=content||(route?view.infoPage():view.home());
 const extras=renderSharing({url:canonical,title,image:new URL(image,origin).href,lang})+renderRecommendations(articles,lang,{slug:route.startsWith('blog/')?route.slice(5):'',seed:route});
 const values={route:path,lang,title:escapeHTML(title),description:escapeHTML(description),canonical,robots:indexable?'index,follow':'noindex,follow',content:view.header()+main+extras+view.footer(),image,imageAlt:escapeHTML(imageAlt||(lang==='hu'?'TripGoes utazási inspiráció':'TripGoes travel inspiration')),ogType,preload:!route||ogType==='article'?`<link rel="preload" href="${image}" as="image">`:''};
 values.page=pageOverride??route.split('/')[0];
 const section=route.split('/')[0];
 const widgets=section==='experiences'?widgetCSP:section==='services'?serviceCSP:(section==='utak'||!section)?packageCSP:null;
 values.scriptExtra=widgets?widgets.scriptExtra:'';
 values.imgExtra=widgets?widgets.imgExtra:'';
 values.frameSrc=widgets?widgets.frameSrc:"'none'";
 values.styleExtra=widgets?.styleExtra??'';
 values.connectSrc=[...(widgets?widgets.connectExtra:[]),'https://emrldco.com','https://www.travelpayouts.com/check_auth',...(['flights','last-minute'].includes(route)?["'self'"]:[]),...(['offers','flights','last-minute'].includes(route)&&apiBase?[new URL(apiBase).origin]:[])].join(' ');
 values.extraStyles=values.page==='eszkozok'?'<link rel="stylesheet" href="/src/tools.css">':(values.page==='utak'||values.page==='')?'<link rel="stylesheet" href="/src/packages.css"><link rel="stylesheet" href="/src/tools.css">':['flights','last-minute','experiences','services'].includes(values.page)?'<link rel="stylesheet" href="/src/flights.css">':route==='offers'?'<link rel="stylesheet" href="/src/offers.css">':route==='score'?'<link rel="stylesheet" href="/src/draft.css">':route==='planner'?'<link rel="stylesheet" href="/src/planner.css">':'';
 return shell.replace(/\{\{(\w+)\}\}/g,(match,key)=>values[key]??match);
}
const sitemap=[];
for(const lang of ['hu','en']){
 for(const route of routes){
  const dir=`dist/${lang}/${route}`;await mkdir(dir,{recursive:true});
  if(route==='services'){
   await writeFile(`${dir}/index.html`,render({lang,route,title:lang==='hu'?'Útikellékek — mobilnet, transzfer, bérautó, kártérítés | TripGoes':'Travel essentials — data, transfers, car hire, compensation | TripGoes',description:lang==='hu'?'Mobilnet, reptéri transzfer, bérautó és kártérítés késett járatra. A keresés és a foglalás a szolgáltató oldalán zárul.':'Mobile data, airport transfers, car hire and delayed-flight compensation. Search and booking finish on the provider’s site.',content:`<main id="main">${servicesPage(services,lang)}</main>`,indexable:true}));
   sitemap.push(`${origin}/${lang}/${route}/`);
   continue;
  }
  if(route==='experiences'){
   const hubTitle=lang==='hu'?`Élmények — foglalható programok ${experiences.cities.length} városban | TripGoes`:`Experiences — bookable activities in ${experiences.cities.length} cities | TripGoes`;
   await writeFile(`${dir}/index.html`,render({lang,route,title:hubTitle,description:lang==='hu'?'Válassz várost, és nézd meg a foglalható belépőket, sétákat és vezetett programokat. A foglalás és a fizetés a szolgáltató oldalán történik.':'Pick a city and see the bookable tickets, walks and guided activities. Booking and payment take place on the provider’s website.',content:`<main id="main">${experiencesPage(experiences,lang,'',activityCards(activities.catalogue.get(experiences.cities[0].slug)??[],lang,{city:experiences.cities[0].title[lang],generated:activities.generated}))}</main>`,indexable:true}));
   sitemap.push(`${origin}/${lang}/${route}/`);
   // One page per city: the picker navigates, so a visitor loads one widget.
   for(const city of experiences.cities){
    const cityRoute=`${route}/${city.slug}`,cityDir=`dist/${lang}/${cityRoute}`;await mkdir(cityDir,{recursive:true});
    const name=city.title[lang];
    await writeFile(`${cityDir}/index.html`,render({lang,route:cityRoute,pageOverride:'experiences',title:lang==='hu'?`${name} — foglalható programok és belépők | TripGoes`:`${name} — bookable activities and tickets | TripGoes`,description:city.intro[lang],content:`<main id="main">${experiencesPage(experiences,lang,city.slug,activityCards(activities.catalogue.get(city.slug)??[],lang,{city:city.title[lang],generated:activities.generated}))}</main>`,indexable:city.indexable}));
    if(city.indexable)sitemap.push(`${origin}/${lang}/${cityRoute}/`);
   }
   continue;
  }
  if(route==='utak'){
   await writeFile(`${dir}/index.html`,render({lang,route,
    title:lang==='hu'?`Komplett utazások ${packageYears} — ${packages.offers.length} ajánlat már ${packageFrom.toLocaleString('hu-HU')} Ft/fő-től | TripGoes`:`Complete trips ${packageYears} — ${packages.offers.length} offers from HUF ${packageFrom.toLocaleString('en-GB')} per person | TripGoes`,
    description:lang==='hu'?'Repülőjegy, szállás és ellátás egy árban. Szűrhető ár, hossz, ellátás és induló repülőtér szerint; a foglalás az utazásszervező oldalán zárul.':'Flight, hotel and board for one price. Filter by price, length, board and departure airport; booking finishes on the tour operator’s website.',
    content:`<main id="main">${packagesPage(packages,lang)}${packagesJsonLd(packages.offers.slice(0,40),lang)}</main>`,indexable:true}));
   sitemap.push(`${origin}/${lang}/${route}/`);
   // One page per destination: a country with a handful of offers stays in
   // the full catalogue instead of becoming a thin page of its own.
   for(const country of packages.countries.filter(hasPage)){
    const countryRoute=`${route}/${country.slug}`,countryDir=`dist/${lang}/${countryRoute}`;await mkdir(countryDir,{recursive:true});
    const name=country.title[lang];
    const here=packages.offers.filter(offer=>offer.slug===country.slug);
    await writeFile(`${countryDir}/index.html`,render({lang,route:countryRoute,pageOverride:'utak',
     title:pageTitle(country,lang),
     description:country.count
      ?(lang==='hu'?`${country.count} foglalható utazás ${name} célpontjaira, már ${country.from.toLocaleString('hu-HU')} Ft/fő-től: ${allByAir(here)?'repülőjegy, szállás és ellátás egy árban':'szállás és ellátás egy árban, a legtöbbhöz repülőjeggyel'}. Az árak a ${packages.generated}-i állapot szerintiek.`:`${country.count} bookable trips to ${name} from HUF ${country.from.toLocaleString('en-GB')} per person: ${allByAir(here)?'flight, hotel and board for one price':'hotel and board for one price, most of them with a flight'}. Prices as of ${packages.generated}.`)
      :(lang==='hu'?`${name} jelenleg nincs a betöltött kínálatban. Nézd meg a többi úti célt és az aktuális ajánlatokat.`:`${name} is not in the loaded catalogue right now. See the other destinations and what is currently on offer.`),
     content:`<main id="main">${packagesPage(packages,lang,country.slug)}<div class="container">${activitiesForCountry(country.name,lang)}</div>${packagesJsonLd(here,lang,{name})}</main>`,
     // A page with nothing on it stays reachable but is not offered to search.
     indexable:country.count>0}));
    if(country.count)sitemap.push(`${origin}/${lang}/${countryRoute}/`);
   }
   // Destination and board together: "egyiptom all inclusive" is a search
   // people type, and the data already answers it.
   for(const board of packages.boards.filter(hasPage)){
    const boardRoute=`${route}/${board.slug}/${board.foodSlug}`,boardDir=`dist/${lang}/${boardRoute}`;await mkdir(boardDir,{recursive:true});
    const here=packages.offers.filter(offer=>offer.slug===board.slug&&foodSlug(offer.food)===board.foodSlug);
    await writeFile(`${boardDir}/index.html`,render({lang,route:boardRoute,pageOverride:'utak',
     title:boardTitle(board,lang),description:boardDescription(board,lang,allByAir(here)),
     content:`<main id="main">${packagesPage(packages,lang,board.slug,board.foodSlug)}${packagesJsonLd(here,lang,{name:board.title[lang]})}</main>`,
     indexable:board.count>0}));
    if(board.count)sitemap.push(`${origin}/${lang}/${boardRoute}/`);
   }
   continue;
  }
  if(route==='eszkozok'){
   await writeFile(`${dir}/index.html`,render({lang,route,
    title:lang==='hu'?'Eszközök — jegykereső, úttervező, árnapló | TripGoes':'Tools — fare search, trip planner, price diary | TripGoes',
    description:lang==='hu'?'Öt eszköz az utazási döntéshez: élő jegykereső, tárolt árak, last minute, teljes költség és saját árnapló. Mindegyik megmondja, honnan van az adata.':'Five tools for a travel decision: live fare search, cached prices, last minute, whole-trip costs and your own price diary. Each one names where its data comes from.',
    content:`<main id="main">${toolsPage(lang)}</main>`,indexable:true}));
   sitemap.push(`${origin}/${lang}/${route}/`);
   continue;
  }
  if(route==='last-minute'){
   await writeFile(`${dir}/index.html`,render({lang,route,title:lang==='hu'?'Last minute — tárolt repülőjegyárak a következő hét napra | TripGoes':'Last minute — cached fares for the next seven days | TripGoes',description:lang==='hu'?'A következő hét indulási nap legolcsóbb tárolt egyirányú jegyára Budapestről, napi egy ajánlattal. Nem utazási csomag; az aktuális árat és feltételeket a szolgáltatónál ellenőrizd.':'The cheapest cached one-way fare from Budapest for each of the next seven departure days. Not a package; confirm current prices and conditions with the provider.',content:`<main id="main">${lastMinutePage(lang)}</main>`,indexable:false}));
   continue;
  }
  if(route==='flights'){
   await writeFile(`${dir}/index.html`,render({lang,route,title:lang==='hu'?'Repülőjegy-kereső — tárolt jegyárak | TripGoes':'Flight finder — cached fares | TripGoes',description:lang==='hu'?'Keress korábbi keresésekből származó, tárolt jegyárakat Budapesttől a világ repülőtereiig. Az aktuális árat és feltételeket a szolgáltatónál ellenőrizd.':'Explore cached fares from previous searches, from Budapest to airports around the world. Confirm current prices and conditions with the provider.',content:`<main id="main">${flightPage(lang)}</main>`,indexable:false}));
   continue;
  }
  const title=route==='planner'?(lang==='hu'?'Úttervező — teljes költség, több szabadidő | TripGoes':'Trip planner — whole-trip costs, more time away | TripGoes'):route==='score'?(lang==='hu'?'TripScore — átlátható utazási ajánlatellenőrző':'TripScore — a transparent travel deal checker'):route?`${copy[lang][route==='guides'?'guideTitle':route]} — TripGoes`:copy[lang].metaTitle;
  const description=route==='planner'?(lang==='hu'?'Hasonlíts össze három saját utazási ajánlatot: teljes költség, csoportkeret, éjszakák és használható órák. Számítás és választható mentés a böngésződben.':'Compare three travel offers of your own: whole-trip costs, group budget, nights and usable hours. Calculations and optional saving stay in your browser.'):undefined;
  await writeFile(`${dir}/index.html`,render({lang,route,title,description,content:route==='planner'?`<main id="main">${plannerPage(lang)}</main>`:route==='score'?checkerPage(lang):route==='guides'?journalIndex(articles,lang):'',indexable:INDEXED.has(route)}));
  if(INDEXED.has(route))sitemap.push(`${origin}/${lang}/`+(route?`${route}/`:''));
 }
 await mkdir(`dist/${lang}/blog`,{recursive:true});
 await writeFile(`dist/${lang}/blog/index.html`,render({lang,route:'blog',title:lang==='hu'?'Útinapló — 100 eredeti utazási útmutató | TripGoes':'Travel Journal — 100 original travel guides | TripGoes',description:lang==='hu'?'Utazástervezés, repülés, hajóutak és átlátható költségek. Száz eredeti magyar–angol útmutató a tudatosabb döntéshez.':'Planning, flights, cruises and transparent travel costs. One hundred original Hungarian and English guides for more thoughtful decisions.',content:journalIndex(articles,lang),indexable:!draft}));
 sitemap.push(`${origin}/${lang}/blog/`);
 for(const article of articles){
  const route=`blog/${article.slug}`,dir=`dist/${lang}/${route}`;await mkdir(dir,{recursive:true});
  await writeFile(`${dir}/index.html`,render({lang,route,title:`${article[lang].title} — TripGoes`,description:article[lang].excerpt,content:journalArticle(article,articles,lang),indexable:!draft,image:articleImage(article),imageAlt:article.artwork?.alt?.[lang],ogType:'article'}));
  sitemap.push(`${origin}/${lang}/${route}/`);
 }
}
await writeFile('dist/index.html',render({lang:'hu',title:copy.hu.metaTitle}));
await writeFile('dist/404.html',render({lang:'hu',title:'404 — TripGoes',content:createView({lang:'hu',page:'404'}).infoPage(),pageOverride:'404'}));
await writeFile('dist/robots.txt',`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
await writeFile('dist/sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemap.map(url=>`<url><loc>${url}</loc></url>`).join('')}</urlset>\n`);
await writeFile('dist/CNAME',new URL(origin).hostname+'\n');
await writeFile('dist/.nojekyll','');
console.log(`Built HU/EN platform + ${articles.length} original bilingual articles (${articles.length*2} article pages)${draft?' [DRAFT]':''}.`);
