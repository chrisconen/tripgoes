import {cityInput,cityCopy,normalizeCity,initCities} from './cities.mjs';
import {copy} from './locales.mjs';

import {createView} from './views.mjs';

import {initDiscovery} from './discovery.mjs';
import {initSharing} from './sharing.mjs';


const lang=location.pathname.split('/')[1]==='en'?'en':'hu';
const t={...copy[lang],...cityCopy[lang]}, base=`/${lang}/`, page=document.body.dataset.page??(location.pathname.split('/')[2]||'');
const otherLang=lang==='hu'?'en':'hu';
const journalPage=page==='blog'||page==='guides';
const localizedPath=location.pathname.split('/').slice(2).join('/');
const $=(s,root=document)=>root.querySelector(s);
const $$=(s,root=document)=>[...root.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function readStore(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
function writeStore(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}}
const query=new URLSearchParams(location.search);
const view=()=>createView({lang,page,pathname:location.pathname});
const {icon,money,secondary,options,date,sparkline,categoryIcon}=view();

function privacyBanner(){return readStore('tripgoes-privacy',false)?'':`<aside class="privacy-banner" aria-label="${t.cookies}"><div>${icon('shield')}<div><strong>${t.cookieTitle}</strong><p>${t.cookieText}</p></div></div><div class="privacy-actions"><a href="${base}privacy/">${t.cookieMore}</a><button class="button button-small accept-privacy">${t.cookieAccept}${icon('check')}</button></div></aside>`}
// Preserve the statically rendered document; add only interactive overlays.
$('#app').insertAdjacentHTML('beforeend',`<dialog id="dialog" aria-labelledby="dialog-title"><button class="dialog-close icon-button" aria-label="${t.close}">${icon('close')}</button><div id="dialog-content"></div></dialog><div id="toast" role="status" aria-live="polite"></div>`+privacyBanner());
if(query.has('city'))$('.language').href=`/${otherLang}/${localizedPath}?${query.toString()}${location.hash}`;
if(page==='score')import('./checker.mjs').then(({initChecker})=>initChecker(lang));
if(journalPage)import('./journal.mjs').then(({initJournal})=>initJournal(lang));
if(page==='planner')import('./planner.mjs').then(({initPlanner})=>initPlanner(lang));
if(page==='offers')Promise.all([import('./offers.mjs'),import('./api-config.mjs')]).then(([{initOffers},{apiBase}])=>initOffers(lang,{apiBase}));
if(page==='flights')Promise.all([import('./flights.mjs'),import('./api-config.mjs')]).then(([{initFlights},{apiBase}])=>initFlights(lang,{apiBase}));
if(page==='experiences')import('./worldmap.mjs').then(({initWorldMap})=>initWorldMap(lang));
if(page==='utak')import('./packagefilter.mjs').then(({initPackageFilter})=>initPackageFilter(lang));
if(page==='utak'||page==='')import('./packagegallery.mjs').then(({initPackageGallery})=>initPackageGallery());
if(page==='last-minute')Promise.all([import('./lastminute.mjs'),import('./api-config.mjs')]).then(([{initLastMinute},{apiBase}])=>initLastMinute(lang,{apiBase}));
initCities(lang);
initDiscovery(lang);
initSharing(lang);
const dialog=$('#dialog');
function openDialog(content){$('#dialog-content').innerHTML=content;if(!dialog.open)dialog.showModal();document.body.classList.add('dialog-open');}
dialog.addEventListener('close',()=>document.body.classList.remove('dialog-open'));
$('.dialog-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
let toastTimer;
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4200);}
document.addEventListener('click',e=>{
 const el=e.target.closest('button,a');if(!el)return;
 if(el.classList.contains('method-trigger'))showMethod();
 if(el.classList.contains('alert-trigger'))showPreferences();
 if(el.classList.contains('accept-privacy')){writeStore('tripgoes-privacy',true);$('.privacy-banner')?.remove()}
 if(el.classList.contains('menu-toggle')){const open=el.getAttribute('aria-expanded')!=='true';el.setAttribute('aria-expanded',open);$('.mobile-nav').hidden=!open}
 if(el.closest('.mobile-nav')){$('.mobile-nav').hidden=true;$('.menu-toggle').setAttribute('aria-expanded','false')}
});
document.documentElement.lang=lang;
