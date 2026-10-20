import {readdir,readFile} from 'node:fs/promises';
import {readingRoom} from './reading-room.mjs';
export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const categories={
 planning:['Utazástervezés','Trip planning','hero'],
 lastminute:['Last minute stratégia','Last-minute strategy','barcelona'],
 flights:['Repülés','Flights','madeira'],
 accommodation:['Szállás','Stays','santorini'],
 cruises:['Hajóutak','Cruises','cruise'],
 citybreaks:['Városi kalandok','City breaks','rome'],
 beach:['Tengerpart és szigetek','Coast & islands','santorini'],
 budgets:['Tudatos költségek','Smarter budgets','barcelona'],
 responsible:['Tudatos utazás','Thoughtful travel','madeira'],
 tools:['Utazói eszköztár','Travel toolkit','hero']
};
export const wordCount=text=>String(text).trim().split(/\s+/u).filter(Boolean).length;
export const articleText=(a,lang)=>a[lang].sections.flatMap(s=>[s.heading,...s.paragraphs]).join(' ');
export function categoryLabel(key,lang){return (categories[key]||categories.planning)[lang==='hu'?0:1]}
export function articleImage(article){return article.artwork?.src||`/assets/${(categories[article.category]||categories.planning)[2]}.jpg`}
export async function loadArticles({draft=false}={}){
 let files=[];try{files=(await readdir('content/blog')).filter(f=>f.endsWith('.json')).sort()}catch(e){if(!draft)throw e}
 const articles=await Promise.all(files.map(async f=>JSON.parse(await readFile(`content/blog/${f}`,'utf8'))));
 let artwork={};try{artwork=JSON.parse(await readFile('content/article-images.json','utf8'))}catch(error){if(error.code!=='ENOENT')throw error}
 const slugs=new Set();
 for(const a of articles){
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.slug)||slugs.has(a.slug))throw Error(`Invalid/duplicate slug: ${a.slug}`);
  slugs.add(a.slug);
  if(artwork[a.slug])a.artwork=artwork[a.slug];
  if(!/^\d{4}-\d{2}-\d{2}$/.test(a.updated)||!Number.isFinite(Date.parse(a.updated))||new Date(a.updated).toISOString().slice(0,10)!==a.updated)throw Error(`Invalid article date: ${a.slug}`);
  if(!categories[a.category])throw Error(`Unknown category: ${a.slug} ${a.category}`);
  for(const lang of ['hu','en']){
   const c=a[lang];
   if(!c?.title||!c.excerpt||!Array.isArray(c.sections)||c.sections.length<3||c.sections.some(s=>!s.heading||!Array.isArray(s.paragraphs)||s.paragraphs.some(p=>typeof p!=='string'||!p.trim())))throw Error(`Incomplete article: ${a.slug}/${lang}`);
   if(wordCount(articleText(a,lang))<250)throw Error(`Short article: ${a.slug}/${lang}`);
  }
  for(const source of a.sources||[]){if(new URL(source.url).protocol!=='https:'||!source.title)throw Error(`Invalid source: ${a.slug}`)}
 }
 if(!draft&&articles.length<100)throw Error(`Expected at least 100 bilingual articles, found ${articles.length}`);
 return articles;
}
const e=escapeHTML;
export function journalCard(a,lang,{featured=false}={}){
 const c=a[lang],minutes=Math.max(2,Math.ceil(wordCount(articleText(a,lang))/200));
 return `<article class="journal-card${featured?' featured-story':''}" data-journal-card data-category="${e(a.category)}" data-search="${e(`${c.title} ${c.excerpt} ${categoryLabel(a.category,lang)}`.toLocaleLowerCase(lang))}">
 <a href="/${lang}/blog/${a.slug}/"><div class="journal-photo"><img src="${articleImage(a)}" width="700" height="480" loading="lazy" alt=""><span class="journal-arrow" aria-hidden="true">↗</span></div>
 <div class="journal-card-body"><div class="journal-meta"><span>${e(categoryLabel(a.category,lang))}</span><span>${minutes} ${lang==='hu'?'perc':'min'}</span></div><h3>${e(c.title)}</h3><p>${e(c.excerpt)}</p></div></a>${a.artwork?.credit?`<p class="journal-credit">${lang==='hu'?'Fotó':'Photo'}: <a href="${e(a.artwork.credit.url)}" target="_blank" rel="noopener noreferrer">${e(a.artwork.credit.author)}</a> · <a href="${e(a.artwork.credit.licenseUrl)}" target="_blank" rel="noopener noreferrer">${e(a.artwork.credit.license)}</a></p>`:''}</article>`;
}
export function journalIndex(articles,lang){
 const hu=lang==='hu';
 return `<main id="main" class="journal-page"><section class="journal-masthead container"><div><p class="eyebrow">THE TRIPGOES JOURNAL / VOL. 01</p><h1>${hu?'Kíváncsiságból<br><em>kaland.</em>':'Curiosity becomes<br><em>adventure.</em>'}</h1></div><div class="journal-intro"><span class="journal-count">${articles.length}<i>↗</i></span><p>${hu?'Eredeti útmutatók. Jobb kérdések. Tudatosabb döntések. A következő utad már az első jó ötlettel elkezdődik.':'Original guides. Better questions. More thoughtful decisions. Your next trip starts with one good idea.'}</p><small>${hu?'Magyarul és angolul · AI-val támogatott szerkesztés':'In Hungarian & English · AI-assisted editorial work'}</small></div></section>
 <section class="journal-library container" aria-label="${hu?'Cikkek keresése':'Find a story'}"><div class="journal-controls"><label class="journal-search"><span>${hu?'Mit fedeznél fel?':'What are you curious about?'}</span><input id="journal-search" type="search" placeholder="${hu?'Keress témát, úti célt, ötletet…':'Search a topic, destination, idea…'}" maxlength="120"></label><label class="journal-select"><span>${hu?'Téma':'Topic'}</span><select id="journal-category"><option value="all">${hu?'Minden téma':'Every topic'}</option>${Object.keys(categories).map(k=>`<option value="${k}">${e(categoryLabel(k,lang))}</option>`).join('')}</select></label></div>
 <div class="journal-filter-row"><p id="journal-results" role="status">${articles.length} ${hu?'útmutató':'guides'}</p><button id="journal-reset" class="text-link" type="button">${hu?'Szűrők törlése':'Clear filters'} ↗</button></div>
 <div class="journal-grid">${articles.map(a=>journalCard(a,lang)).join('')}</div><div id="journal-empty" class="empty-state" hidden><h2>${hu?'Erre még nincs történetünk.':'No story matches yet.'}</h2><p>${hu?'Próbálj rövidebb kifejezést vagy másik témát.':'Try a shorter search or a different topic.'}</p></div><div class="journal-more"><button class="button" id="journal-more" hidden>${hu?'További történetek':'More stories'} ↓</button></div></section>
 ${readingRoom(lang)}<section class="journal-manifesto container"><span class="eyebrow">${hu?'SZERKESZTŐSÉGI ALAPELV':'OUR EDITORIAL PROMISE'}</span><h2>${hu?'Több kapaszkodó.<br>Kevesebb hangzatos ígéret.':'More useful detail.<br>Fewer grand promises.'}</h2><p>${hu?'Saját útmutatókat közlünk, nem más blogok átmásolt fordításait. Nem állítunk személyes tapasztalatot olyan útról, amelyet nem jártunk be. Az árpéldák számolási példák; foglalás előtt mindig az adott szolgáltatónál ellenőrizd a feltételeket.':'We publish original guides, not copied translations of other blogs. We do not invent first-hand travel experience. Price examples illustrate calculations; always check the provider’s current terms before booking.'}</p><a class="text-link" href="/${lang}/score/">${hu?'Próbáld ki a TripScore elemzőt':'Try the TripScore checker'} ↗</a></section></main>`;
}
export function journalArticle(article,articles,lang){
 const hu=lang==='hu',c=article[lang],minutes=Math.max(2,Math.ceil(wordCount(articleText(article,lang))/200));
 const updated=new Intl.DateTimeFormat(hu?'hu-HU':'en-GB',{dateStyle:'long',timeZone:'UTC'}).format(new Date(article.updated));
 return `<main id="main" class="journal-article"><div class="container article-breadcrumb"><a href="/${lang}/">${hu?'Főoldal':'Home'}</a><span>/</span><a href="/${lang}/blog/">${hu?'Útinapló':'Journal'}</a><span>/</span><span>${e(categoryLabel(article.category,lang))}</span></div>
 <header class="article-header container"><p class="eyebrow">${e(categoryLabel(article.category,lang))} / TRIPGOES JOURNAL</p><h1>${e(c.title)}</h1><p class="article-deck">${e(c.excerpt)}</p><div class="article-byline"><span>${hu?'TripGoes útmutató':'A TripGoes guide'}</span><span>${minutes} ${hu?'perc olvasás':'min read'}</span><time datetime="${e(article.updated)}">${e(updated)}</time></div></header>
 <div class="article-cover container"><img src="${articleImage(article)}" width="1200" height="800" alt="${e(article.artwork?.alt?.[lang]||(hu?'Hangulatkép az utazási útmutatóhoz':'Illustrative travel photograph'))}"><span>${hu?'Illusztráció · nem konkrét foglalható ajánlat':'Illustration · not a specific bookable offer'}</span></div>
 ${article.artwork?.credit?`<div class="container"><p class="article-credit">${hu?'Fotó':'Photo'}: <a href="${e(article.artwork.credit.url)}" target="_blank" rel="noopener noreferrer">${e(article.artwork.credit.title)}</a> · ${e(article.artwork.credit.author)} · <a href="${e(article.artwork.credit.licenseUrl)}" target="_blank" rel="noopener noreferrer">${e(article.artwork.credit.license)}</a>${hu?' · A nézethez igazított kivágás.':' · Cropped to fit the layout.'}</p></div>`:''}
 <div class="article-layout container"><aside class="article-sidebar"><p class="eyebrow">${hu?'EBBEN A TÖRTÉNETBEN':'IN THIS STORY'}</p><nav aria-label="${hu?'Tartalomjegyzék':'Table of contents'}">${c.sections.map((s,i)=>`<a href="#section-${i+1}"><span>${String(i+1).padStart(2,'0')}</span>${e(s.heading)}</a>`).join('')}</nav><a class="article-score-link" href="/${lang}/score/"><span>TripScore ↗</span>${hu?'Egy jó árnál a teljes kép számít.':'A good price deserves the full picture.'}</a></aside>
 <article class="article-prose">${c.sections.map((s,i)=>`<section id="section-${i+1}"><h2>${e(s.heading)}</h2>${s.paragraphs.map(p=>`<p>${e(p)}</p>`).join('')}</section>`).join('')}
 ${article.sources?.length?`<section class="article-sources"><h2>${hu?'Források és további tájékozódás':'Sources & further reading'}</h2><ul>${article.sources.map(s=>`<li><a href="${e(s.url)}" rel="noopener noreferrer" target="_blank">${e(s.title)} ↗</a></li>`).join('')}</ul></section>`:''}
 <div class="editorial-note"><strong>${hu?'A cikk háttere':'About this guide'}</strong><p>${hu?'Eredeti, AI-val támogatott szerkesztőségi útmutató. Nem helyszíni beszámoló, nem fizetett partnerértékelés és nem foglalási ajánlat. A szolgáltatók változó feltételeit az eredeti forrásnál ellenőrizd.':'An original, AI-assisted editorial guide. This is not a first-hand trip report, paid partner review or booking offer. Check changing provider conditions at the original source.'}</p><a href="/${lang}/affiliate/">${hu?'Így kezeljük a partnerlinkeket':'How we handle partner links'}</a></div>
 </article></div></main>`;
}
