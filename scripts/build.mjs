import {mkdir,cp,writeFile,readFile} from 'node:fs/promises';
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
import {validateExperiences,experiencesPage,widgetPolicy} from '../src/experiences.mjs';
import {apiBase} from '../src/api-config.mjs';

const origin=(process.env.SITE_ORIGIN||'https://tripgoes.com').replace(/\/$/,'');
if(new URL(origin).protocol!=='https:')throw Error('SITE_ORIGIN must use HTTPS.');
const draft=process.env.DRAFT_BUILD==='1';
const articles=await loadArticles({draft});
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
const experiences=experienceConfig.sections.length?validateExperiences(experienceConfig):null;
const widgetCSP=experiences?widgetPolicy(experiences.widget):null;
const routes=['','about','contact','imprint','privacy','cookies','affiliate','guides','score','planner','offers','flights','last-minute',...(experiences?['experiences']:[])];
if(apiBase&&(new URL(apiBase).protocol!=='https:'||new URL(apiBase).username||new URL(apiBase).password||new URL(apiBase).search||new URL(apiBase).hash))throw Error('Invalid public API endpoint.');
function render({lang,route='',title,description=copy[lang].metaDescription,content='',indexable=false,image='/assets/hero.jpg',imageAlt='',ogType='website',pageOverride}){
 const path=route?`${route}/`:'';
 const canonical=`${origin}/${lang}/${path}`;
 const view=createView({lang,page:route.split('/')[0],pathname:`/${lang}/${path}`});
 const main=content||(route?view.infoPage():view.home());
 const extras=renderSharing({url:canonical,title,image:new URL(image,origin).href,lang})+renderRecommendations(articles,lang,{slug:route.startsWith('blog/')?route.slice(5):'',seed:route});
 const values={route:path,lang,title:escapeHTML(title),description:escapeHTML(description),canonical,robots:indexable?'index,follow':'noindex,follow',content:view.header()+main+extras+view.footer(),image,imageAlt:escapeHTML(imageAlt||(lang==='hu'?'TripGoes utazási inspiráció':'TripGoes travel inspiration')),ogType,preload:!route||ogType==='article'?`<link rel="preload" href="${image}" as="image">`:''};
 values.page=pageOverride??route.split('/')[0];
 const widgets=route==='experiences'&&widgetCSP;
 values.scriptExtra=widgets?widgetCSP.scriptExtra:'';
 values.imgExtra=widgets?widgetCSP.imgExtra:'';
 values.frameSrc=widgets?widgetCSP.frameSrc:"'none'";
 values.connectSrc=[...(widgets?widgetCSP.connectExtra:[]),'https://emrldco.com','https://www.travelpayouts.com/check_auth',...(['flights','last-minute'].includes(route)?["'self'"]:[]),...(['offers','flights','last-minute'].includes(route)&&apiBase?[new URL(apiBase).origin]:[])].join(' ');
 values.extraStyles=['flights','last-minute'].includes(route)?'<link rel="stylesheet" href="/src/flights.css">':route==='offers'?'<link rel="stylesheet" href="/src/offers.css">':route==='score'?'<link rel="stylesheet" href="/src/draft.css">':route==='planner'?'<link rel="stylesheet" href="/src/planner.css">':'';
 return shell.replace(/\{\{(\w+)\}\}/g,(match,key)=>values[key]??match);
}
const sitemap=[];
for(const lang of ['hu','en']){
 for(const route of routes){
  const dir=`dist/${lang}/${route}`;await mkdir(dir,{recursive:true});
  if(route==='experiences'){
   await writeFile(`${dir}/index.html`,render({lang,route,title:lang==='hu'?'Élmények — foglalható programok és belépők | TripGoes':'Experiences — bookable tours and tickets | TripGoes',description:lang==='hu'?'Foglalható belépők, séták és kirándulások partnereink kínálatából, városonként. A foglalás és a fizetés a szolgáltató oldalán történik.':'Bookable tickets, walks and day trips from our partners, city by city. Booking and payment take place on the provider’s website.',content:`<main id="main">${experiencesPage(experiences,lang)}</main>`,indexable:true}));
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
  if(route==='offers'){
   await writeFile(`${dir}/index.html`,render({lang,route,title:lang==='hu'?'Ajánlatkereső — árak, időbélyeg és forrás | TripGoes':'Offer search — prices, timestamps and sources | TripGoes',content:`<main id="main">${offersPage(lang)}</main>`,indexable:false}));
   continue;
  }
  const title=route==='planner'?(lang==='hu'?'Úttervező — teljes költség, több szabadidő | TripGoes':'Trip planner — whole-trip costs, more time away | TripGoes'):route==='score'?(lang==='hu'?'TripScore — átlátható utazási ajánlatellenőrző':'TripScore — a transparent travel deal checker'):route?`${copy[lang][route==='guides'?'guideTitle':route]} — TripGoes`:copy[lang].metaTitle;
  const description=route==='planner'?(lang==='hu'?'Hasonlíts össze három saját utazási ajánlatot: teljes költség, csoportkeret, éjszakák és használható órák. Számítás és választható mentés a böngésződben.':'Compare three travel offers of your own: whole-trip costs, group budget, nights and usable hours. Calculations and optional saving stay in your browser.'):undefined;
  await writeFile(`${dir}/index.html`,render({lang,route,title,description,content:route==='planner'?`<main id="main">${plannerPage(lang)}</main>`:route==='score'?checkerPage(lang):route==='guides'?journalIndex(articles,lang):'',indexable:route==='score'||route==='planner'}));
  if(route==='score'||route==='planner')sitemap.push(`${origin}/${lang}/${route}/`);
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
