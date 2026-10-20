import {copy} from './locales.mjs';
import {cities,deals} from './data.mjs';
import {calculate,selectDeals,EXAMPLE_EUR_HUF} from './model.mjs';

import {createView} from './views.mjs';

import {initDiscovery} from './discovery.mjs';
import {initSharing} from './sharing.mjs';


const lang=location.pathname.split('/')[1]==='en'?'en':'hu';
const t=copy[lang], base=`/${lang}/`, page=document.body.dataset.page??(location.pathname.split('/')[2]||'');
const otherLang=lang==='hu'?'en':'hu';
const journalPage=page==='blog'||page==='guides';
const localizedPath=location.pathname.split('/').slice(2).join('/');
const $=(s,root=document)=>root.querySelector(s);
const $$=(s,root=document)=>[...root.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function readStore(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
function writeStore(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}}
let savedRaw=readStore('tripgoes-saved',[]);
let saved=new Set(Array.isArray(savedRaw)?savedRaw.filter(id=>deals.some(d=>d.id===id)):[]);
let filters={city:'Budapest',days:30,type:'all',budget:Infinity,scoreOnly:false,sort:'recommended'};
const query=new URLSearchParams(location.search);
if(cities.includes(query.get('city')))filters.city=query.get('city');
if(['7','14','30'].includes(query.get('days')))filters.days=Number(query.get('days'));
if(['all','flight','holiday','cruise','weekend'].includes(query.get('type')))filters.type=query.get('type');
if(['75000','150000','250000'].includes(query.get('budget')))filters.budget=Number(query.get('budget'));
let calcState={city:filters.city,travelers:2,bag:true,transfer:true},calcId='amalfi';
const view=()=>createView({lang,page,pathname:location.pathname,saved,filters,calcState,calcId});
const {icon,money,secondary,options,cityOptions,date,sparkline,categoryIcon}=view();
const dealCard=d=>view().dealCard(d);

function renderDeals(){const visible=selectDeals(deals,filters);$('#result-count').textContent=`${String(visible.length).padStart(2,'0')} ${t.results}`;$('#deal-grid').innerHTML=visible.length?visible.map(dealCard).join(''):`<div class="empty-state">${icon('search')}<h3>${t.noResults}</h3><p>${t.noResultsText}</p><button class="button reset-filters">${t.reset}</button></div>`;$$('[data-category]').forEach(b=>{b.classList.toggle('active',b.dataset.category===filters.type);b.setAttribute('aria-pressed',b.dataset.category===filters.type)});$('#search-form [name=type]').value=filters.type;}

function updateCalc(){const deal=deals.find(d=>d.id===calcId);const costs=calculate(deal,calcState);$('#calc-lines').innerHTML=Object.entries(costs.lines).filter(([key,value])=>value>0||key==='base').map(([key,value])=>`<div class="cost-line"><span>${t[key]}</span><strong>${money(value)}</strong></div>`).join('');$('#calc-total').textContent=money(costs.perPerson);$('#calc-secondary').textContent=`≈ ${secondary(costs.perPerson)}`;$('#calc-group').textContent=`${costs.travelers} × ${money(costs.perPerson)} = ${money(costs.group)}`;$('#calc-group').title=t.groupTotal;$('#route-city').textContent=calcState.city;$('#route-code').textContent=deal.airport;$('#route-destination').textContent=deal.destination[lang];$('#route-arrival').textContent=deal.arrival;}

function privacyBanner(){return readStore('tripgoes-privacy',false)?'':`<aside class="privacy-banner" aria-label="${t.cookies}"><div>${icon('shield')}<div><strong>${t.cookieTitle}</strong><p>${t.cookieText}</p></div></div><div class="privacy-actions"><a href="${base}privacy/">${t.cookieMore}</a><button class="button button-small accept-privacy">${t.cookieAccept}${icon('check')}</button></div></aside>`}
// Preserve the statically rendered document; add only interactive overlays.
$('#app').insertAdjacentHTML('beforeend',`<dialog id="dialog" aria-labelledby="dialog-title"><button class="dialog-close icon-button" aria-label="${t.close}">${icon('close')}</button><div id="dialog-content"></div></dialog><div id="toast" role="status" aria-live="polite"></div>`+privacyBanner());
$('.saved-count').textContent=saved.size||'';
if(page==='score')import('./checker.mjs').then(({initChecker})=>initChecker(lang));
if(journalPage)import('./journal.mjs').then(({initJournal})=>initJournal(lang));
if(page==='planner')import('./planner.mjs').then(({initPlanner})=>initPlanner(lang));
initDiscovery(lang);
initSharing(lang);
const dialog=$('#dialog');
function openDialog(content){$('#dialog-content').innerHTML=content;if(!dialog.open)dialog.showModal();document.body.classList.add('dialog-open');}
dialog.addEventListener('close',()=>document.body.classList.remove('dialog-open'));
$('.dialog-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
let toastTimer;
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4200);}
function showDetail(id){const d=deals.find(x=>x.id===id);if(!d)return;const costs=calculate(d,{city:filters.city});openDialog(`<img class="detail-cover" src="/assets/${d.image}.jpg" alt="${d.destination[lang]}"><div class="dialog-padding"><p class="eyebrow">${t.sample} · ${d.country[lang]}</p><h2 id="dialog-title">${d.destination[lang]}</h2><p class="dialog-lead">${d.name[lang]}</p><div class="detail-meta"><span>${d.airport} → ${d.arrival}</span><span>${t.sampleDate}: ${date(d)} 2026 · ${d.nights} ${t.nights}</span></div><div class="notice">${icon('shield')}${t.notBookable}</div><h3>${t.includes} · ${filters.city}</h3><p class="fine-print">${t.baseIncludes[d.type]}</p>${Object.entries(costs.lines).filter(([,v])=>v).map(([k,v])=>`<div class="cost-line"><span>${t[k]}</span><strong>${money(v)}</strong></div>`).join('')}<div class="detail-total"><span>${t.total} ${t.perPerson}</span><strong>${money(costs.perPerson)}</strong></div><p class="fine-print">${t.estimate}</p><div class="detail-history"><div><h3>${t.history}</h3><span class="pill">${t.sample} · ${d.score}/100</span></div>${sparkline(d,true)}<p>${t.historyNote}</p></div><button class="button adjust-calc" data-calc="${d.id}">${t.adjust}${icon('arrow')}</button><p class="fine-print">${t.modalDemo}</p></div>`)}
function showMethod(){openDialog(`<div class="dialog-padding method-content"><div class="method-mark">${icon('spark')}</div><p class="eyebrow">TRIPGOES / TRIPSCORE</p><h2 id="dialog-title">${t.methodTitle}</h2><p>${t.methodBody}</p><div class="score-bands">${t.methodBands.map((b,i)=>`<div class="band-${i}">${b}</div>`).join('')}</div><div class="notice">${icon('shield')}${t.methodNote}</div></div>`)}
function showSaved(){openDialog(`<div class="dialog-padding"><p class="eyebrow">YOUR NEXT CHAPTER</p><h2 id="dialog-title">${t.savedTitle}</h2>${saved.size?`<div class="saved-list">${deals.filter(d=>saved.has(d.id)).map(d=>`<div><img src="/assets/${d.image}.jpg" alt=""><button data-deal="${d.id}"><strong>${d.destination[lang]}</strong><span>${money(calculate(d,{city:filters.city}).perPerson)} ${t.perPerson}</span></button><button class="icon-button" data-remove-saved="${d.id}" aria-label="${t.unsave}: ${d.destination[lang]}">${icon('close')}</button></div>`).join('')}</div>`:`<p>${t.savedEmpty}</p>`}</div>`)}
function showPreferences(){let pref=readStore('tripgoes-preferences',{});if(!pref||typeof pref!=='object')pref={};openDialog(`<div class="dialog-padding preferences-dialog"><p class="eyebrow">TRIPGOES / 85+</p><h2 id="dialog-title">${t.preferences}</h2><p>${t.preferencesText}</p><form id="preferences-form"><label class="field">${t.calcCity}<select name="city">${cityOptions(pref.city||'Budapest')}</select></label><div class="preference-types">${['flight','holiday','cruise','weekend'].map(type=>`<label>${icon(categoryIcon[type])}<span>${t[type]}</span><input type="checkbox" name="types" value="${type}" ${!Array.isArray(pref.types)||pref.types.includes(type)?'checked':''}></label>`).join('')}</div><button type="submit" class="button">${t.savePreferences}${icon('check')}</button></form></div>`);$('#preferences-form').addEventListener('submit',e=>{e.preventDefault();const data=new FormData(e.target);const ok=writeStore('tripgoes-preferences',{city:data.get('city'),types:data.getAll('types')});dialog.close();toast(ok?t.preferencesSaved:t.storageError)})}
function toggleSave(id){saved.has(id)?saved.delete(id):saved.add(id);const ok=writeStore('tripgoes-saved',[...saved]);$$(`[data-save="${id}"]`).forEach(b=>{b.classList.toggle('is-saved',saved.has(id));b.setAttribute('aria-pressed',saved.has(id));b.setAttribute('aria-label',`${saved.has(id)?t.unsave:t.save}: ${deals.find(d=>d.id===id).destination[lang]}`)});$('.saved-count').textContent=saved.size||'';toast(ok?(saved.has(id)?t.favoriteAdded:t.favoriteRemoved):t.storageError)}
document.addEventListener('click',e=>{
 const el=e.target.closest('button,a');if(!el)return;
 if(el.dataset.deal){e.preventDefault();showDetail(el.dataset.deal)}
 if(el.dataset.save)toggleSave(el.dataset.save);
 if(el.dataset.removeSaved){toggleSave(el.dataset.removeSaved);showSaved()}
 if(el.classList.contains('method-trigger'))showMethod();
 if(el.classList.contains('saved-trigger'))showSaved();
 if(el.classList.contains('alert-trigger'))showPreferences();
 if(el.classList.contains('accept-privacy')){writeStore('tripgoes-privacy',true);$('.privacy-banner')?.remove()}
 if(el.classList.contains('clear-data')){try{['tripgoes-saved','tripgoes-preferences','tripgoes-privacy','tripgoes-score-draft-v1','tripgoes:planner:v1'].forEach(k=>localStorage.removeItem(k));saved.clear();$('.saved-count').textContent='';toast(t.cookieCleared)}catch{toast(t.storageError)}}
 if(el.classList.contains('menu-toggle')){const open=el.getAttribute('aria-expanded')!=='true';el.setAttribute('aria-expanded',open);$('.mobile-nav').hidden=!open}
 if(el.closest('.mobile-nav')){$('.mobile-nav').hidden=true;$('.menu-toggle').setAttribute('aria-expanded','false')}
 if(el.dataset.calc){dialog.close();if(page){location.href=`${base}?calc=${el.dataset.calc}#calculator`;return}calcId=el.dataset.calc;$('#calc-trip').value=calcId;updateCalc();$('#calculator').scrollIntoView({behavior:'smooth'});}
 if(el.dataset.category){filters.type=el.dataset.category;renderDeals();updateURL()}
 if(el.classList.contains('reset-filters')){filters={city:'Budapest',days:30,type:'all',budget:Infinity,scoreOnly:false,sort:'recommended'};for(const key of ['city','days','type','budget'])$(`#search-form [name=${key}]`).value=String(filters[key]);$('#score-only').checked=false;$('#sort').value='recommended';renderDeals();updateURL();}
});
function updateURL(){const q=new URLSearchParams();for(const key of ['city','days','type','budget'])if(filters[key]!==Infinity)q.set(key,filters[key]);history.replaceState(null,'',`${base}?${q}#deals`)}
if(!page){
 for(const key of ['city','days','type','budget'])$(`#search-form [name=${key}]`).value=String(filters[key]);
 $('#calc-city').value=calcState.city;
 renderDeals();updateCalc();
 $('#search-form').addEventListener('submit',e=>{e.preventDefault();const data=new FormData(e.target);filters={...filters,city:data.get('city'),type:data.get('type'),days:Number(data.get('days')),budget:Number(data.get('budget'))};calcState.city=filters.city;$('#calc-city').value=calcState.city;updateCalc();renderDeals();updateURL();$('#deals').scrollIntoView({behavior:'smooth'})});
 $('#score-only').addEventListener('change',e=>{filters.scoreOnly=e.target.checked;renderDeals()});
 $('#sort').addEventListener('change',e=>{filters.sort=e.target.value;renderDeals()});
 $('#calc-trip').addEventListener('change',e=>{calcId=e.target.value;updateCalc()});
 $('#calc-city').addEventListener('change',e=>{calcState.city=e.target.value;updateCalc()});
 $('#calc-travelers').addEventListener('change',e=>{calcState.travelers=Number(e.target.value);updateCalc()});
 $('#calc-bag').addEventListener('change',e=>{calcState.bag=e.target.checked;updateCalc()});
 $('#calc-transfer').addEventListener('change',e=>{calcState.transfer=e.target.checked;updateCalc()});
 if(deals.some(d=>d.id===query.get('calc'))){calcId=query.get('calc');$('#calc-trip').value=calcId;updateCalc();}
 const anchor=document.getElementById(location.hash.slice(1));if(anchor)requestAnimationFrame(()=>anchor.scrollIntoView());
}
document.documentElement.lang=lang;
