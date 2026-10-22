import {cityInput,cityCopy} from './cities.mjs';
import {copy} from './locales.mjs';
import {deals} from './data.mjs';
import {calculate,selectDeals,EXAMPLE_EUR_HUF} from './model.mjs';
import {infoContent} from './content.mjs';
import {providers,providerDestination} from './partners.mjs';
import {toolsBand} from './tools.mjs';

export function createView({lang='hu',page='',pathname=`/${lang}/`,saved=new Set(),
 filters={city:lang==='hu'?'Budapest':'',days:30,type:'all',budget:Infinity,scoreOnly:false,sort:'recommended'},
 calcState={city:lang==='hu'?'Budapest':'',travelers:2,bag:true,transfer:true},calcId='amalfi',highlights=null,trips=null}={}){
 const t={...copy[lang],...cityCopy[lang]},base=`/${lang}/`,otherLang=lang==='hu'?'en':'hu';
 const journalPage=page==='blog'||page==='guides';
 const localizedPath=pathname.split('/').slice(2).join('/');
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={
 arrow:'M4 12h16m-6-6 6 6-6 6',diagonal:'M5 19 19 5M5 5h14v14',
 plane:'m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13',
 heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
 pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
 calendar:'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2',
 search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
 sun:'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
 ship:'M4 14 12 10l8 4-2 6H6l-2-6ZM7 12V5h10v7M12 2v3M2 22c2 1 3-1 5-1s3 2 5 1 3-1 5 0 3 0 5-1',
 bag:'M5 7h14v15H5V7Zm3 0V3h8v4M9 11v7m6-7v7',
 check:'m5 12 4 4L19 6',chevron:'m8 4 8 8-8 8',close:'m6 6 12 12M6 18 18 6',
 globe:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18',
 menu:'M3 6h18M3 12h18M3 18h18',shield:'m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6l9-4Zm-5 10 3 3 7-7',
 spark:'m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8L12 2Z',
 wallet:'M3 6h17v15H3V6Zm0 0V3h15v3m-3 7h7v5h-7v-5',
 clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2'
};
const icon=(name,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.spark}"/></svg>`;
const brand=()=>`<a class="brand" href="${base}" aria-label="TripGoes">${icon('plane')}trip<span>goes</span><i>↗</i></a>`;
const money=n=>n===null?t.unknown:new Intl.NumberFormat(lang==='hu'?'hu-HU':'en-IE',{style:'currency',currency:lang==='hu'?'HUF':'EUR',maximumFractionDigits:0}).format(lang==='hu'?n:n/EXAMPLE_EUR_HUF);
const secondary=n=>n===null?'—':new Intl.NumberFormat(lang==='hu'?'en-IE':'hu-HU',{style:'currency',currency:lang==='hu'?'EUR':'HUF',maximumFractionDigits:0}).format(lang==='hu'?n/EXAMPLE_EUR_HUF:n);
const categoryIcon={all:'globe',flight:'plane',holiday:'sun',cruise:'ship',weekend:'bag'};
const options=(items,selected)=>items.map(([value,label])=>`<option value="${value}" ${String(selected)===String(value)?'selected':''}>${esc(label)}</option>`).join('');


function header(){return `<a class="skip" href="#main">${t.skip}</a>
 <div class="demo-bar"><span>${page==='last-minute'?'TRIPGOES / LAST MINUTE':page==='flights'?'TRIPGOES / FLIGHT FINDER':page==='offers'?'TRIPGOES / OFFER DESK':page==='planner'?'TRIPGOES / DECISION STUDIO':journalPage?'TRIPGOES JOURNAL':page==='score'?'TRIPSCORE LAB':page==='utak'?(lang==='hu'?'TRIPGOES / UTAZÁSOK':'TRIPGOES / TRIPS'):t.demo}</span><p>${page==='last-minute'?(lang==='hu'?'Tárolt egyirányú jegyárak a következő hét napra. Nem utazási csomag, szállást nem tartalmaz.':'Cached one-way fares for the next seven days. Not a package, and no accommodation is included.'):page==='flights'?(lang==='hu'?'Korábbi keresésekből származó, tárolt jegyárak. Az aktuális feltételeket a szolgáltatónál ellenőrizd.':'Cached fares from previous searches. Confirm current conditions with the provider.'):page==='offers'?(lang==='hu'?'Időbélyegzett ajánlatok, megjelölt forrásból. A foglalhatóságot a szolgáltatónál ellenőrizd.':'Timestamped offers with named sources. Check availability with the provider.'):page==='planner'?(lang==='hu'?'Saját ajánlatok, átlátható költségek. Az árakat nem ellenőrizzük a szolgáltatóknál.':'Your offers, transparent costs. We do not verify prices with providers.'):journalPage?(lang==='hu'?'Eredeti, AI-val támogatott útmutatók magyarul és angolul.':'Original, AI-assisted guides in Hungarian and English.'):page===''||page==='utak'?(lang==='hu'?'Valódi, foglalható utazások. Az árak a feed legutóbbi frissítésének napján érvényesek; a véglegeset a foglalási oldal mutatja.':'Real, bookable trips. Prices are those of the day the feed was last read; the booking page shows the final one.'):page==='score'?(lang==='hu'?'Saját adatokból számolunk. Az árakat és a foglalhatóságot nem hitelesítjük.':'Calculated from your inputs. Prices and availability are not authenticated.'):t.demoText}</p></div>
 <header class="header"><div class="container nav-wrap">${brand()}
 <nav class="desktop-nav" aria-label="${t.menu}"><a href="${base}utak/">${lang==='hu'?'Utazások':'Trips'}</a><a href="${base}eszkozok/">${lang==='hu'?'Eszközök':'Tools'}</a><a href="${base}experiences/">${lang==='hu'?'Élmények':'Experiences'}</a><a href="${base}services/">${lang==='hu'?'Útikellékek':'Essentials'}</a><a href="${base}blog/">${t.navGuides}</a></nav>
 <div class="nav-actions"><a class="language" href="/${otherLang}/${localizedPath}" lang="${otherLang}">${icon('globe')}${otherLang.toUpperCase()}</a><a class="button button-small nav-alert" href="https://search.tripgoes.com/">${lang==='hu'?'Repülőjegy':'Flights'}${icon('diagonal')}</a><button class="icon-button menu-toggle" aria-label="${t.menu}" aria-expanded="false">${icon('menu')}</button></div>
 </div><nav class="mobile-nav" hidden><a href="${base}utak/">${lang==='hu'?'Utazások':'Trips'}</a><a href="${base}eszkozok/">${lang==='hu'?'Eszközök':'Tools'}</a><a href="${base}experiences/">${lang==='hu'?'Élmények':'Experiences'}</a><a href="${base}services/">${lang==='hu'?'Útikellékek':'Essentials'}</a><a href="${base}blog/">${t.navGuides}</a><a href="https://search.tripgoes.com/">${lang==='hu'?'Repülőjegy-kereső':'Flight search'}</a></nav></header>`}
function footer(){return `<footer><div class="container footer-top"><div>${brand()}<h2>${t.footerLine.replace('\n','<br>')}</h2><p>${t.footerSmall}</p></div><div class="footer-links"><div><h3>${t.discover}</h3><a href="${base}utak/">${lang==='hu'?'Utazások':'Trips'}</a><a href="${base}eszkozok/">${lang==='hu'?'Eszközök':'Tools'}</a><a href="${base}experiences/">${lang==='hu'?'Élmények':'Experiences'}</a><a href="${base}services/">${lang==='hu'?'Útikellékek':'Essentials'}</a><a href="https://search.tripgoes.com/">${lang==='hu'?'Repülőjegy-kereső':'Flight search'}</a><a href="${base}last-minute/">Last minute</a><a href="${base}blog/">${t.navGuides}</a></div><div><h3>${t.information}</h3>${['about','contact','imprint','privacy','affiliate','cookies'].map(p=>`<a href="${base}${p}/">${t[p]}</a>`).join('')}</div></div></div><div class="container footer-bottom"><span>${t.rights}</span><a href="#app" aria-label="${t.back}">↑</a></div><p class="container city-attribution"><a href="/assets/CITY-SOURCES.md">${lang==='hu'?'Városjavaslatok':'City suggestions'}: GeoNames · CC BY 4.0</a></p><div class="footer-wordmark" aria-hidden="true">tripgoes<span>↗</span></div></footer>`}
function search(){return `<form id="search-form" class="search-panel container">
 <label>${icon('pin')}<span>${t.from}${cityInput({name:'city',value:filters.city,lang})}</span></label>
 <label>${icon('calendar')}<span>${t.when}<select name="days">${options([[7,t.days7],[14,t.days14],[30,t.days30]],filters.days)}</select></span></label>
 <label>${icon('sun')}<span>${t.type}<select name="type">${options(['all','flight','holiday','cruise','weekend'].map(c=>[c,t[c]]),filters.type)}</select></span></label>
 <label>${icon('wallet')}<span>${t.budget}<select name="budget">${options([[Infinity,t.anyBudget],[75000,money(75000)],[150000,money(150000)],[250000,money(250000)]],filters.budget)}</select></span></label>
 <button class="button" type="submit">${icon('search')}${t.search}</button></form>`}
// Real, bookable inventory. The numbers come from the shipped experiences
// configuration at build time, so nothing here is invented.
function tripShowcase(){
 if(!trips)return '';
 const hu=lang==='hu';
 const band=(eye,title,text,grid,id,link)=>`<section class="trip-showcase container" aria-labelledby="${id}">`
  +`<div class="section-heading"><div><p class="eyebrow">${eye}</p><h2 id="${id}">${title}</h2><p>${text}</p></div>`
  +(link?`<a class="text-link" href="${base}utak/">${link} ↗</a>`:'')+`</div>${grid}</section>`;
 return band(hu?'MOST ÉRI MEG':'BEST VALUE NOW',
   hu?'Komplett utak, a legnagyobb kedvezménnyel':'Complete trips, the deepest discounts',
   hu?'Repülőjegy, szállás és ellátás egy árban. Az induló repülőtér minden kártyán ott van.':'Flight, hotel and board for one price. Every card says which airport it departs from.',
   trips.deals,'deals-title',hu?`Mind a ${trips.total} utazás`:`All ${trips.total} trips`)
  +band(hu?'ÁLOMUTAK':'DREAM TRIPS',
   hu?'Maldív-szigetek, Mauritius, Karib-térség':'Maldives, Mauritius, the Caribbean',
   hu?'Hosszú távú célpontok, többségében négy- és ötcsillagos szállásokkal.':'Long-haul destinations, mostly four- and five-star hotels.',
   trips.dream,'dream-title','')
  +`<nav class="trip-destinations container" aria-label="${hu?'Úti célok':'Destinations'}"><h2>${hu?'Hova mennél?':'Where to?'}</h2><div>${trips.destinations}</div></nav>`;
}
function home(){return `<main id="main">
 <section class="hero container"><div class="hero-copy"><div class="eyebrow"><span class="little-line"></span>${t.eyebrow}</div>
 <h1>${t.heroA}<br>${t.heroB}<br><span class="hero-accent">${t.heroC}<svg viewBox="0 0 550 18" preserveAspectRatio="none" aria-hidden="true"><path d="M5 12Q260-2 545 10M75 17Q300 4 500 12"/></svg></span></h1>
 <p class="hero-description">${t.heroText}</p><a class="button hero-cta" href="${base}utak/">${lang==='hu'?'Nézd meg az utazásokat':'Browse the trips'}${icon('diagonal')}</a><a class="text-link hero-secondary" href="${base}blog/">${lang==='hu'?'100 útmutató a következő kalandhoz':'100 guides for your next adventure'} ↗</a>
 <div class="hero-note">${icon('spark')}<span>${t.heroSmall}</span></div>
 <div class="hero-coordinate"><span>YOUR CITY. YOUR NEXT CHAPTER.</span><span>ANYWHERE → EVERYWHERE</span></div></div>
 <div class="hero-visual"><div class="hero-image"><img src="/assets/hero.jpg" alt="${t.photoPlace}" fetchpriority="high"><div class="hero-photo-label">${icon('pin')}<span>${t.photoPlace}</span><span>01 / 06</span></div></div>
 <div class="sun-stamp"><span>${t.sticker}</span>${icon('sun')}<span>${t.stickerBottom}</span></div>
 <div class="postcard"><span class="postcard-small">LA DOLCE VITA</span><span>${t.photoNote}</span><svg viewBox="0 0 95 45" aria-hidden="true"><path d="M3 8q64 35 82-3M70 8l16-6-2 17" fill="none" stroke="currentColor" stroke-width="2"/></svg></div></div></section>
 <div class="trust-strip container"><span>${icon('plane')}${t.strip1}</span><span>${icon('wallet')}${t.strip2}</span><span>${icon('shield')}${t.strip3}</span></div>
 ${tripShowcase()}
 ${toolsBand(lang)}
 <section id="how" class="how-section"><div class="container"><div class="how-intro"><p class="eyebrow">${t.howEye}</p><h2>${t.howTitle}</h2><p>${t.howText}</p></div><div class="steps">${t.steps.map(([num,title,desc],i)=>`<article><div class="step-top"><span>${num}</span>${icon(['search','spark','wallet'][i])}</div><h3>${title}</h3><p>${desc}</p></article>`).join('')}</div><button class="text-link method-trigger">${t.method}${icon('arrow')}</button></div></section>
 <section class="trust-section container">${icon('shield')}<div><h2>${t.trustTitle}</h2><p>${t.trustText}</p></div><a class="text-link" href="${base}about/">${t.trustLink}${icon('arrow')}</a></section>
 </main>`}
function sparkline(d,large=false){const vals=d.history;const min=Math.min(...vals)-10,max=Math.max(...vals)+10;const points=vals.map((v,i)=>`${i*100/(vals.length-1)},${36-(v-min)/(max-min)*30}`).join(' ');return `<svg class="${large?'history-chart':'sparkline'}" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 39H100" stroke="currentColor" opacity=".18" fill="none"/><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="${large?1:2}" vector-effect="non-scaling-stroke"/><circle cx="100" cy="${36-(vals.at(-1)-min)/(max-min)*30}" r="${large?1:2.8}" fill="currentColor"/></svg>`}
function date(d){return new Intl.DateTimeFormat(lang==='hu'?'hu-HU':'en-GB',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(2026,9,20+d.days)))}
function dealCard(d){const price=calculate(d,{city:filters.city}).perPerson;return `<article class="deal-card"><div class="card-photo"><a href="#${d.id}" data-deal="${d.id}" tabindex="-1" aria-hidden="true"><img src="/assets/${d.image}.jpg" alt="${esc(d.destination[lang])}" loading="lazy"></a><span class="trip-type">${icon(categoryIcon[d.type])}${t[d.type]}</span><button class="save-button ${saved.has(d.id)?'is-saved':''}" data-save="${d.id}" aria-label="${saved.has(d.id)?t.unsave:t.save}: ${d.destination[lang]}" aria-pressed="${saved.has(d.id)}">${icon('heart')}</button><div class="photo-bottom"><span>${d.tag[lang]}</span>${icon('diagonal')}</div></div>
 <div class="card-body"><div class="destination-row"><p>${d.country[lang]}</p><button class="score-badge method-trigger" aria-label="${t.score}: ${d.score}, ${t.sample}"><strong>${d.score}</strong><span>${t.score}<small>${t.sample}</small></span></button></div><h3><button data-deal="${d.id}">${d.destination[lang]}</button></h3><p class="card-subtitle">${d.name[lang]}</p><div class="trip-meta"><span>${icon('plane')}${d.airport} → ${d.arrival}</span><span>${icon('calendar')}${date(d)} · ${d.nights} ${t.nights}</span></div>
 <div class="card-price"><div><span class="base-price">${t.advertised}: ${money(d.base)}</span><span class="total-label">${t.total}${icon('check')}</span><strong>${money(price)}<small>${t.perPerson}</small></strong><span class="secondary-price">${price===null?t.missingTransport:`≈ ${secondary(price)}`}</span></div><div class="card-trend">${sparkline(d)}<span>${t.sample}</span></div></div><button class="card-cta" data-deal="${d.id}">${t.details}${icon('arrow')}</button></div></article>`}
function calculator(){const costs=calculate(deals.find(d=>d.id===calcId),calcState);return `<section id="calculator" class="calculator-section section container"><div class="calculator-story"><p class="eyebrow">${t.calcEye}</p><h2>${t.calcTitle.replace('\n','<br>')}</h2><p>${t.calcText}</p><div class="route-art"><div class="route-city"><small>${t.routeFrom}</small><strong id="route-city">${esc(calcState.city)||'—'}</strong><span id="route-code">${lang==='hu'?'Minta indulópontja:':'Sample departure:'} BUD</span></div><div class="route-line">${icon('plane')}<svg viewBox="0 0 280 110" aria-hidden="true"><path d="M6 95C70-20 170-20 275 75" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 6"/><circle cx="6" cy="95" r="4"/><circle cx="275" cy="75" r="4"/></svg></div><div class="route-destination"><small>${t.routeTo}</small><strong id="route-destination">${deals[0].destination[lang]}</strong><span id="route-arrival">NAP</span></div></div><p class="calculator-footnote">${icon('shield')}${t.estimate}</p></div>
 <div class="calculator"><div class="calc-heading">${icon('wallet')}<span>${t.calcCta}</span><span class="pill">${t.sample}</span></div><div class="calc-fields"><label class="field wide">${t.calcTrip}<select id="calc-trip">${options(deals.map(d=>[d.id,d.destination[lang]]),calcId)}</select></label><label class="field">${t.calcCity}${cityInput({id:'calc-city',value:calcState.city,lang})}</label><label class="field">${t.travelers}<select id="calc-travelers">${options([1,2,3,4,5,6,7,8].map(n=>[n,String(n)]),2)}</select></label></div><label class="field manual-ground">${t.customGround}<input id="calc-ground" type="number" min="0" max="${lang==='hu'?1000000000:2500000}" step="0.01" placeholder="${lang==='hu'?'Saját költség, ha ismert':'Your cost, if known'}"><small>${t.customGroundHint}</small></label><div class="calc-switches"><label><span>${t.luggage}<small>${t.luggageHint}</small></span><input id="calc-bag" type="checkbox" checked><span class="toggle"></span></label><label><span>${t.transfer}</span><input id="calc-transfer" type="checkbox" checked><span class="toggle"></span></label></div><div id="calc-lines">${Object.entries(costs.lines).filter(([key,value])=>value===null||value>0||key==='base').map(([key,value])=>`<div class="cost-line"><span>${t[key]}</span><strong>${money(value)}</strong></div>`).join('')}</div><div class="calc-total" aria-live="polite"><span>${t.total} ${t.perPerson}</span><strong id="calc-total">${money(costs.perPerson)}</strong><div><span id="calc-secondary">${costs.complete?`≈ ${secondary(costs.perPerson)}`:''}</span><span id="calc-group">${costs.complete?`${costs.travelers} × ${money(costs.perPerson)} = ${money(costs.group)}`:t.missingTransport}</span></div></div></div></section>`}
function infoPage(){
 const info=infoContent(lang,page);return `<main id="main" class="container info-page"><a class="text-link" href="${base}">${icon('arrow')}${t.back}</a><p class="eyebrow">${t.legalDraft}</p><h1>${info?info[0]:t.notFound}</h1>${info?info.slice(1).map(p=>`<p>${p}</p>`).join(''):''}${page==='cookies'?`<button class="button clear-data">${t.cookieClear}</button>`:''}</main>`}
return {header,footer,home,infoPage,dealCard,sparkline,date,icon,brand,money,secondary,options,categoryIcon};
}
