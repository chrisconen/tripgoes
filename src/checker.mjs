import {analyzeOffer,SCORE_RULES} from './score.mjs';
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const copy={
 hu:{
  eye:'TRIPSCORE LAB / 01',title:'Jó ár?<br><em>Nézzünk mögé.</em>',intro:'Egy kedvezőnek tűnő ajánlat még nem a teljes történet. Add meg a költségeket, vesd össze a saját ártörténeteddel, és lásd, mire alapozhatod a döntésed.',
  private:'A számítás a böngésződben fut. Nem küldjük el az adataidat.',sample:'Példa betöltése',clear:'Tiszta lap',offer:'Az ajánlatod',offerHint:'Minden ár egy főre, a teljes utazásra vonatkozik. Az ismert, nulla költséghez írj 0-t; az üres mező nem jelent ingyenes szolgáltatást.',
  route:'Útvonal / utazás',departure:'Indulás',nights:'Éjszakák',travelers:'Utazók',currency:'Pénznem',price:'Hirdetett alapár / fő',baggage:'Poggyász / fő',transfer:'Kijutás és transzfer / fő',accommodation:'További szállás / fő',other:'Egyéb díjak / fő',inclusions:'Mit tartalmaz a teljes ár?',inclusionsHint:'Pl. retúr repülés, 3 éj, kézipoggyász. Ugyanezt a tartalmat kell összevetni minden korábbi árral.',
  history:'Az összehasonlítás alapja',historyHint:'Legalább 5 külön napon rögzített, azonos útra és indulásra vonatkozó teljes ár. A megfigyelések legalább 7 napot fedjenek le; a legújabb legfeljebb 14 napos legyen. A 90 napnál régebbi adatokat kizárjuk.',
  date:'Megfigyelés napja',total:'Teljes ár / fő',remove:'Sor törlése',add:'Új megfigyelés',confirm:'Minden megadott korábbi ár ugyanarra az útvonalra, indulási dátumra, éjszakaszámra, utazólétszámra és szolgáltatástartalomra vonatkozik.',
  analyze:'Ajánlat elemzése',empty:'A jó döntés<br>itt kezdődik.',emptyText:'Először a teljes költséget rakjuk össze. Pontszámot csak elegendő, összevethető előzményből számolunk.',
  result:'Az elemzésed',sampleBadge:'MINTAADATOK',manualBadge:'SAJÁT BEVITEL · NEM HITELESÍTETT',score:'Árpozíció',coverage:'Adatlefedettség',median:'Megfigyelt medián',difference:'Eltérés a mediántól',group:'Összes utazó',observations:'külön nap',span:'napos időtáv',noScore:'Még nincs megalapozott pontszám.',invalid:'Ellenőrizd a megadott adatokat.',invalidHint:'Tölts ki minden költséget, adj meg érvényes jövőbeli indulást, egész utazólétszámot és szolgáltatástartalmat.',
  confirmError:'Az összehasonlíthatóságot is ellenőrizd és jelöld be.',rowError:'A megkezdett előzménysorokban a dátum és az ár is szükséges.',staleResult:'Módosult a bevitel. Az új eredményhez futtasd újra az elemzést.',
  save:'Összehasonlításhoz adom',saved:'Hozzáadva',export:'Elemzés letöltése',compare:'Egymás mellett tisztábban.',compareIntro:'Legfeljebb három elemzés, csak erre a megnyitásra. Különböző szolgáltatások pontszáma nem minőségi rangsor.',delete:'Eltávolítás',
  method:'Mit jelent a szám?',methodText:'Az árpozíció a megadott napi teljes árak mediánjához viszonyít. A mediánnál 50 pont jár; minden 1% eltérés 1,5 pontot változtat az eredményen, 0 és 100 közé korlátozva. Ez tervezési heurisztika, nem piaci minősítés vagy árjóslat.',
  methodCoverage:'Az adatlefedettség külön mutató: a megfigyelési napok számát, időtávját és frissességét jelzi. Saját bevitel esetén legfeljebb 60, mintánál 20. Nem annak valószínűsége, hogy az út jó vagy foglalható.',
  methodTrust:'Az elemző nem ellenőrzi a szolgáltatónál az árakat, a szabad helyeket vagy a tartalmat. A teljes árba neked kell minden releváns tételt beírnod. Azonos napi több külön árból először napi mediánt számítunk.',
  flagsTitle:'Amit az eredmény mellé tudnod kell',below:'a megadott medián alatt',above:'a megadott medián felett',equal:'a megadott mediánnal egyező',read:'Tanulj meg jobban összehasonlítani',countLabel:'Összehasonlított megfigyelések',limit:'Legfeljebb 30 sort adhatsz meg.',compareFull:'Már három elemzésed van. Előbb távolíts el egyet.',downloaded:'Az elemzés letöltése elindult.',sampleNote:'Betöltött szemléltető adatok. Szerkesztés után is mintaként jelöljük; saját elemzéshez válaszd a Tiszta lap gombot.'
 },
 en:{
  eye:'TRIPSCORE LAB / 01',title:'A good price?<br><em>Look closer.</em>',intro:'An attractive headline fare is only part of the story. Add the whole trip cost, compare your own price observations, and see what your decision rests on.',
  private:'Everything is calculated in your browser. Your inputs are not sent away.',sample:'Load an example',clear:'Start fresh',offer:'Your offer',offerHint:'All prices are per person for the whole trip. Enter 0 for a known zero cost; an empty field does not mean a service is free.',
  route:'Route / trip',departure:'Departure',nights:'Nights',travelers:'Travellers',currency:'Currency',price:'Headline price / person',baggage:'Baggage / person',transfer:'Ground transport / person',accommodation:'Extra accommodation / person',other:'Other fees / person',inclusions:'What does the total include?',inclusionsHint:'For example: return flights, 3 nights, cabin bag. Every historical price must cover exactly the same services.',
  history:'Your comparison baseline',historyHint:'At least 5 distinct observation days for the same trip and departure. Observations must span at least 7 days, with the newest no more than 14 days old. Records over 90 days old are excluded.',
  date:'Observation date',total:'Total / person',remove:'Remove row',add:'Add an observation',confirm:'Every historical total refers to the same route, departure date, nights, traveller count and included services.',
  analyze:'Analyse this offer',empty:'A better decision<br>starts here.',emptyText:'First, build the whole trip cost. A score only appears when there is enough comparable history.',
  result:'Your analysis',sampleBadge:'SAMPLE DATA',manualBadge:'YOUR INPUT · UNVERIFIED',score:'Price position',coverage:'Evidence coverage',median:'Observed median',difference:'Difference from median',group:'All travellers',observations:'distinct days',span:'day span',noScore:'Not enough evidence for a score yet.',invalid:'Check your inputs.',invalidHint:'Complete every cost, use a valid future departure, a whole traveller count and describe the included services.',
  confirmError:'Check and confirm that the observations are comparable.',rowError:'Every started history row needs both a date and a price.',staleResult:'Your inputs changed. Run the analysis again for an updated result.',
  save:'Add to comparison',saved:'Added',export:'Download analysis',compare:'Clearer, side by side.',compareIntro:'Up to three analyses for this session only. Scores for different services are not a quality ranking.',delete:'Remove',
  method:'What does the number mean?',methodText:'Price position compares the total with the median of your daily observations. The median earns 50 points; each 1% difference changes the result by 1.5 points, bounded between 0 and 100. This is a planning heuristic, not a market rating or a prediction.',
  methodCoverage:'Evidence coverage is separate: it describes the number, date span and freshness of observation days. It is capped at 60 for user inputs and 20 for samples. It is not the probability of a good or available trip.',
  methodTrust:'The checker does not verify provider prices, availability or inclusions. You must enter every relevant cost. Multiple distinct prices on the same day are first combined into a daily median.',
  flagsTitle:'Read this alongside your result',below:'below your observed median',above:'above your observed median',equal:'equal to your observed median',read:'Learn to compare with more confidence',countLabel:'Compared observations',limit:'You can add up to 30 rows.',compareFull:'Three analyses are already saved. Remove one first.',downloaded:'Your analysis download has started.',sampleNote:'Illustrative data loaded. Edits remain marked as sample data; choose Start fresh for your own analysis.'
 }
};
const flags={
 'sample-data':['Az adatok szemléltető minták.','These are illustrative sample data.'],
 'user-entered-data':['Az adatok a saját beviteledből származnak; nincsenek hitelesítve.','These are your inputs and have not been authenticated.'],
 'insufficient-history':['Legalább 5 külön megfigyelési nap szükséges.','At least 5 distinct observation days are needed.'],
 'insufficient-date-coverage':['Az előzményeknek legalább 7 napot kell átfogniuk.','The observations must span at least 7 days.'],
 'stale-history':['A legutóbbi megfigyelés 14 napnál régebbi.','The latest observation is over 14 days old.'],
 'invalid-history-records':['Hibás előzményadatokat kizártunk.','Invalid historical records were excluded.'],
 'duplicate-history':['Az ismétlődő adatokat csak egyszer számítjuk.','Duplicate observations count once.'],
 'same-day-history-aggregated':['Azonos napi külön árakból napi mediánt számítottunk.','Different prices on one day were combined into a daily median.'],
 'future-history':['Jövőbeli megfigyelési napot kizártunk.','Future observation dates were excluded.'],
 'out-of-window-history':['90 napnál régebbi adatot kizártunk.','Observations older than 90 days were excluded.'],
 'non-comparable-history':['Eltérő tartalmú előzményeket kizártunk.','Non-comparable observations were excluded.'],
 'mixed-evidence-excluded':['A saját és mintaadatokat nem keverjük.','User inputs and sample data are not mixed.'],
 'verification-unavailable':['Böngészős bevitelből nem igazolható hiteles forrás.','A browser input cannot authenticate its source.'],
 'availability-unchecked':['A jelenlegi foglalhatóság nincs ellenőrizve.','Current availability has not been checked.'],
 'heuristic-score':['A pontszám átlátható heurisztika, nem jövőbeli árjóslat.','The score is a transparent heuristic, not a price prediction.'],
 'supplied-inclusions-unverified':['A megadott szolgáltatástartalmat nem hitelesítettük.','The supplied inclusions have not been verified.']
};
const input=(name,label,type='text',extra='')=>`<label class="lab-field"><span>${label}</span><input name="${name}" type="${type}" ${extra}></label>`;
export function checkerPage(lang){
 const t=copy[lang],hu=lang==='hu';
 return `<main id="main" class="score-page"><section class="lab-hero container"><div><p class="eyebrow">${t.eye}</p><h1>${t.title}</h1></div><div><p class="lab-intro">${t.intro}</p><span class="lab-private">◈ ${t.private}</span><div class="lab-hero-actions"><button id="lab-example" class="button button-lime">${t.sample} ↗</button><button id="lab-clear" class="text-link">${t.clear}</button></div></div></section>
 <div class="lab-workspace container"><form id="score-form" class="lab-form"><section class="lab-form-section"><div class="lab-section-title"><span>01</span><h2>${t.offer}</h2></div><p>${t.offerHint}</p><div class="lab-fields">
 ${input('route',t.route,'text','required maxlength="120" placeholder="BUD → BCN"')}${input('departureDate',t.departure,'date','required')}
 ${input('nights',t.nights,'number','required min="0" max="365" step="1" value="3"')}${input('travelers',t.travelers,'number','required min="1" max="99" step="1" value="2"')}
 <label class="lab-field"><span>${t.currency}</span><select name="currency"><option ${hu?'selected':''}>HUF</option><option ${hu?'':'selected'}>EUR</option><option>GBP</option><option>USD</option></select></label>${input('price',t.price,'number','required min="0.01" max="1000000000" step="0.01" placeholder="49900"')}
 ${['baggage','transfer','accommodation','other'].map(k=>input(k,t[k],'number','required min="0" max="1000000000" step="0.01" placeholder="0"')).join('')}
 <label class="lab-field lab-wide"><span>${t.inclusions}</span><input name="inclusions" required maxlength="240" placeholder="${hu?'Retúr repülés, 3 éj, kézipoggyász':'Return flights, 3 nights, cabin bag'}"><small>${t.inclusionsHint}</small></label></div></section>
 <section class="lab-form-section"><div class="lab-section-title"><span>02</span><h2>${t.history}</h2></div><p>${t.historyHint}</p><div class="lab-history-head"><span>${t.date}</span><span>${t.total}</span><span></span></div><div id="lab-history"></div><button type="button" id="lab-add" class="text-link">+ ${t.add}</button><label class="lab-confirm"><input type="checkbox" name="comparable"><span>${t.confirm}</span></label></section>
 <div id="lab-message" role="status" class="lab-message"></div><button type="submit" class="button lab-submit">${t.analyze} ↗</button></form>
 <aside class="lab-result-wrap"><div id="lab-result" class="lab-result" aria-live="polite"><span class="eyebrow">TRIPSCORE</span><div class="lab-empty-orbit"><span>?</span><small>0 — 100</small></div><h2>${t.empty}</h2><p>${t.emptyText}</p><div class="lab-result-rule"></div><small>${t.private}</small></div></aside></div>
 <section class="container lab-comparison" id="lab-comparison" hidden><div class="section-heading"><div><p class="eyebrow">SIDE BY SIDE</p><h2>${t.compare}</h2><p>${t.compareIntro}</p></div></div><div id="lab-comparison-grid"></div></section>
 <section class="lab-method container"><div><p class="eyebrow">TRIPSCORE / ${SCORE_RULES.version}</p><h2>${t.method}</h2><a href="/${lang}/blog/" class="text-link">${t.read} ↗</a></div><div><details open><summary>${t.score}</summary><p>${t.methodText}</p></details><details><summary>${t.coverage}</summary><p>${t.methodCoverage}</p></details><details><summary>${hu?'Az adatok határai':'The limits of the data'}</summary><p>${t.methodTrust}</p></details></div></section></main>`;
}
export function initChecker(lang){
 const form=document.getElementById('score-form');if(!form)return;
 const t=copy[lang],hu=lang==='hu',history=document.getElementById('lab-history'),message=document.getElementById('lab-message'),result=document.getElementById('lab-result');
 let evidence='user-entered',latest=null,comparisons=[],sequence=0;
 const today=()=>new Date().toISOString().slice(0,10);
 const shifted=days=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
 const money=(value,currency)=>new Intl.NumberFormat(hu?'hu-HU':'en-GB',{style:'currency',currency,maximumFractionDigits:2}).format(value);
 const field=name=>form.elements.namedItem(name);
 function row(date='',price=''){
  const n=++sequence,el=document.createElement('div');el.className='lab-history-row';
  el.innerHTML=`<input type="date" aria-label="${t.date} ${n}" value="${e(date)}" max="${today()}" data-history-date><input type="number" aria-label="${t.total} ${n}" min="0.01" max="1000000000" step="0.01" value="${e(price)}" data-history-price><button type="button" class="lab-row-remove" aria-label="${t.remove} ${n}">×</button>`;
  el.querySelector('button').addEventListener('click',()=>{el.remove();invalidate()});history.append(el);
 }
 function invalidate(){if(latest){latest=null;message.textContent=t.staleResult;result.querySelectorAll('[data-result-action]').forEach(b=>b.disabled=true);result.classList.add('result-outdated')}}
 for(let i=0;i<5;i++)row();
 document.getElementById('lab-add').addEventListener('click',()=>{if(history.children.length>=30){message.textContent=t.limit;return}row();invalidate()});
 form.addEventListener('input',event=>{invalidate();if(['route','departureDate','nights','travelers','currency','inclusions'].includes(event.target.name))field('comparable').checked=false});
 document.getElementById('lab-clear').addEventListener('click',()=>{form.reset();evidence='user-entered';history.replaceChildren();for(let i=0;i<5;i++)row();latest=null;result.innerHTML=`<span class="eyebrow">TRIPSCORE</span><div class="lab-empty-orbit"><span>?</span><small>0 — 100</small></div><h2>${t.empty}</h2><p>${t.emptyText}</p>`;result.classList.remove('result-outdated');message.textContent='';field('route').focus()});
 document.getElementById('lab-example').addEventListener('click',()=>{
  const values={route:'BUD → BCN',departureDate:shifted(21),nights:3,travelers:2,currency:hu?'HUF':'EUR',price:hu?49900:125,baggage:hu?12000:30,transfer:hu?8000:20,accommodation:hu?60000:150,other:0,inclusions:hu?'Retúr repülés, 3 éj, feladott poggyász':'Return flights, 3 nights, checked baggage'};
  for(const [k,v]of Object.entries(values))field(k).value=v;
  history.replaceChildren();[30,24,18,12,6,1].forEach((day,i)=>row(shifted(-day),hu?[158000,151000,154000,148000,146000,143000][i]:[395,378,385,370,365,358][i]));
  evidence='sample';field('comparable').checked=true;invalidate();message.textContent=t.sampleNote;form.requestSubmit();
 });
 form.addEventListener('submit',event=>{
  event.preventDefault();message.textContent='';
  const rows=[...history.children].map(el=>({date:el.querySelector('[data-history-date]').value,price:el.querySelector('[data-history-price]').value})).filter(r=>r.date||r.price);
  if(rows.some(r=>!r.date||!r.price)){message.textContent=t.rowError;invalidate();return}
  if(rows.length&&!field('comparable').checked){message.textContent=t.confirmError;invalidate();return}
  const data=Object.fromEntries(new FormData(form));
  const inclusionList=data.inclusions.split(',').map(s=>s.trim()).filter(Boolean);
  const signature={currency:data.currency,route:data.route,departureDate:data.departureDate,nights:data.nights,travelers:data.travelers,inclusions:inclusionList};
  const offer={...signature,price:data.price,fees:Object.fromEntries(['baggage','transfer','accommodation','other'].map(k=>[k,data[k]])),evidence,history:rows.map(r=>({...signature,...r,evidence}))};
  const analyzedAt=new Date().toISOString(),analysis=analyzeOffer(offer,{now:analyzedAt});
  latest={offer,analysis,analyzedAt};renderResult();if(evidence==='sample')message.textContent=t.sampleNote;
  if(matchMedia('(max-width:760px)').matches)result.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});
 });
 function renderResult(){
  const {analysis:a,offer}=latest;result.classList.remove('result-outdated');
  if(a.status==='invalid'){result.innerHTML=`<span class="eyebrow">TRIPSCORE</span><h2>${t.invalid}</h2><p>${t.invalidHint}</p>`;message.textContent=t.invalid;return}
  const badge=evidence==='sample'?t.sampleBadge:t.manualBadge;
  const chart=a.observations.length>1?`<svg class="lab-chart" role="img" aria-label="${hu?'A megadott napi teljes árak alakulása':'Your supplied daily total prices'}" viewBox="0 0 400 100"><path d="M0 95H400M0 50H400M0 5H400" class="chart-grid"/><polyline points="${chartPoints(a.observations)}" /></svg>`:'';
  result.innerHTML=`<div class="lab-result-top"><span>${t.result}</span><span class="lab-evidence">${badge}</span></div><h2 class="lab-route">${e(offer.route)}</h2>
  <div class="lab-score"><strong>${a.score??'—'}</strong><div><span>/ 100</span><b>${t.score}</b></div></div>${a.score===null?`<p>${t.noScore}</p>`:`<p class="lab-verdict">${Math.abs(a.savingsPct)}% ${a.savingsPct>0?t.below:a.savingsPct<0?t.above:t.equal}</p>`}
  <dl class="lab-metrics"><div><dt>${t.total}</dt><dd>${money(a.totalCost,a.currency)}</dd></div><div><dt>${t.median}</dt><dd>${a.median===null?'—':money(a.median,a.currency)}</dd></div><div><dt>${t.coverage}</dt><dd>${a.confidence.score}<small>/100</small></dd></div><div><dt>${t.group}</dt><dd>${money(a.groupCost,a.currency)}</dd></div></dl>
  ${chart}<p class="lab-observations">${a.sampleCount} ${t.observations} · ${a.historyDays} ${t.span}${chart?`<br>${hu?'A grafikon pontjai megfigyelési sorrendet jelölnek, nem időarányos távolságot.':'Chart points follow observation order, not proportional time intervals.'}`:''}</p><details class="lab-result-details" open><summary>${t.flagsTitle}</summary><ul>${a.flags.map(f=>`<li>${e((flags[f]||[f,f])[hu?0:1])}</li>`).join('')}</ul></details>
  <div class="lab-result-actions"><button type="button" class="button button-lime" data-result-action="compare">${t.save} +</button><button type="button" class="text-link" data-result-action="download">${t.export} ↓</button></div>`;
 }
 function chartPoints(observations){
  const values=observations.map(o=>o.price),min=Math.min(...values),max=Math.max(...values),range=max-min||1;
  return values.map((v,i)=>`${(i/(values.length-1)*390+5).toFixed(1)},${(90-(v-min)/range*80).toFixed(1)}`).join(' ');
 }
 result.addEventListener('click',event=>{
  const action=event.target.closest('[data-result-action]')?.dataset.resultAction;if(!action||!latest)return;
  if(action==='compare'){
   if(comparisons.length===3){message.textContent=t.compareFull;return}
   comparisons.push(structuredClone(latest));renderComparisons();message.textContent=t.saved;
  }else{
   const report={...latest,disclaimer:t.methodTrust,method:t.methodText,coverageMeaning:t.methodCoverage};
   const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
   const link=document.createElement('a');link.href=url;link.download=`tripgoes-analysis-${today()}.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);message.textContent=t.downloaded;
  }
 });
 function renderComparisons(){
  document.getElementById('lab-comparison').hidden=!comparisons.length;
  document.getElementById('lab-comparison-grid').innerHTML=comparisons.map(({offer:o,analysis:a},i)=>`<article class="lab-compare-card"><span class="eyebrow">${a.evidence==='sample'?t.sampleBadge:t.manualBadge}</span><h3>${e(o.route)}</h3><p>${e(o.departureDate)} · ${e(o.nights)} ${hu?'éj':t.nights.toLowerCase()} · ${e(o.travelers)} ${hu?'fő':t.travelers.toLowerCase()}</p><strong>${a.score??'—'}<small>/100</small></strong><dl><div><dt>${t.total}</dt><dd>${money(a.totalCost,a.currency)}</dd></div><div><dt>${t.coverage}</dt><dd>${a.confidence.score}/100</dd></div></dl><button type="button" class="text-link" data-remove-analysis="${i}">${t.delete} ×</button></article>`).join('');
 }
 document.getElementById('lab-comparison-grid').addEventListener('click',event=>{const button=event.target.closest('[data-remove-analysis]');if(button){comparisons.splice(Number(button.dataset.removeAnalysis),1);renderComparisons()}});
}
