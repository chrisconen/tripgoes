import {journalCard,escapeHTML} from './journal.mjs';

// Stable across builds; recommendations are editorial, never paid placements.
export function recommendedArticles(articles,{slug='',seed=''}={}){
 const current=articles.find(a=>a.slug===slug);
 const pool=articles.filter(a=>a.slug!==slug);
 const hash=[...seed+slug].reduce((sum,c)=>(sum*31+c.codePointAt(0))>>>0,0);
 const rotate=list=>list.length?[...list.slice(hash%list.length),...list.slice(0,hash%list.length)]:[];
 const relevant=current?rotate(pool.filter(a=>a.category===current.category)):[];
 const remaining=rotate(pool.filter(a=>!relevant.includes(a)));
 return [...relevant,...remaining].slice(0,12);
}

export function renderRecommendations(articles,lang,{slug='',seed=''}={}){
 const hu=lang==='hu',selected=recommendedArticles(articles,{slug,seed});
 return `<section id="page-discovery" class="discovery" aria-labelledby="discovery-heading">
 <div class="container"><div class="discovery-heading"><div><p class="eyebrow">${hu?'MÉG EGY KIS INSPIRÁCIÓ':'KEEP YOUR CURIOSITY MOVING'}</p><h2 id="discovery-heading">${hu?'A következő történet<br><em>már vár rád.</em>':'Your next story<br><em>is waiting.</em>'}</h2><p>${hu?'Tizenkét új nézőpont a következő kalandodhoz.':'Twelve fresh perspectives for your next adventure.'}</p></div><div class="discovery-tools"><a class="text-link" href="/${lang}/blog/">${hu?'Mind a 100 útmutató':'All 100 guides'} ↗</a><div class="discovery-modes" role="group" aria-label="${hu?'Cikkajánló nézete':'Recommended reading view'}" hidden><button type="button" data-discovery-mode="slider" aria-pressed="true">${hu?'Lapozó':'Slider'}</button><button type="button" data-discovery-mode="gallery" aria-pressed="false">${hu?'Galéria':'Gallery'}</button></div></div></div>
 <div class="discovery-track" id="discovery-track" tabindex="0" role="region" aria-label="${hu?'Ajánlott cikkek; vízszintesen görgethető':'Recommended articles; scroll horizontally'}">${selected.map((a,i)=>`<div class="discovery-item"><span class="discovery-number" aria-hidden="true">${String(i+1).padStart(2,'0')}</span>${journalCard(a,lang)}</div>`).join('')}</div>
 <div class="discovery-bottom"><p class="discovery-status" role="status" aria-live="polite">${selected.length} ${hu?'ajánlott cikk':'recommended stories'}</p><div class="discovery-arrows" hidden><button type="button" data-discovery-prev aria-controls="discovery-track" aria-label="${hu?'Előző cikkek':'Previous articles'}">←</button><button type="button" data-discovery-next aria-controls="discovery-track" aria-label="${hu?'Következő cikkek':'Next articles'}">→</button></div><span class="discovery-hint">${escapeHTML(hu?'Húzd oldalra, és fedezz fel többet.':'Swipe across. Discover a little more.')}</span></div></div></section>`;
}
