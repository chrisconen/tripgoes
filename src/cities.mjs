const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function normalizeCity(value){
 if(typeof value!=='string'||/[\u0000-\u001f\u007f]/u.test(value))return '';
 const city=value.normalize('NFC').trim().replace(/\s+/gu,' ');
 return city.length<=120?city:'';
}
const fold=s=>String(s).normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim();
export function sampleCostCity(value){
 const city=normalizeCity(value),match=/^([^,]+), HU(?: \(.+\))?$/.exec(city);
 const name=match?match[1]:city;
 return ['Budapest','Győr','Debrecen','Szeged','Pécs'].find(candidate=>fold(candidate)===fold(name))??null;
}
export const cityCopy={
 hu:{cityHint:'Bármely város megadható. Az ajánlások csak a választást segítik.',cityPlaceholder:'Város, ország',unknown:'Még nem számítható',missingTransport:'A kijutás költsége még hiányzik.',globalNote:'Ezek rögzített repülőterű mintaútvonalak. A városválasztás nem keres új járatot. Ismeretlen kijutási költségnél nincs teljes ár; a keretszűrő ezeket a mintákat kihagyja.',customGround:'Saját kijutási költség oda-vissza / fő (Ft)',customGroundHint:'A választott várostól a minta indulórepteréig vagy kikötőjéig. Üresen a meglévő helyi mintaérték érvényes, ha van; 0 csak ismert nulla költséget jelent.',cityLoading:'Városjavaslatok betöltése…',cityLoaded:'Válassz várost a listából, vagy írd be saját településedet.',cityUnavailable:'A városlista most nem érhető el. Bármely várost beírhatsz.',noCityMatch:'Nincs találat a javaslatok között. A beírt település így is használható.'},
 en:{cityHint:'Enter any city worldwide. Suggestions are optional.',cityPlaceholder:'City, country',unknown:'Not enough information',missingTransport:'Getting-to-departure costs are still unknown.',globalNote:'These sample itineraries have fixed departure airports. Changing your city does not search for new flights. Unknown transport costs mean no complete total; budget filters exclude these samples.',customGround:'Your return travel to departure / person (EUR)',customGroundHint:'From your city to the sample departure airport or port. Leave blank to use a local sample estimate, if one exists; 0 means a known zero cost.',cityLoading:'Loading city suggestions…',cityLoaded:'Choose a city from the list or enter your own town.',cityUnavailable:'City suggestions are unavailable. You can still enter any city.',noCityMatch:'No suggestion matches. Your entered town can still be used.'}
};
export function cityInput({id='',name='city',value='',lang='hu',required=true}={}){
 const t=cityCopy[lang];
 return `<input ${id?`id="${escape(id)}"`:''} name="${escape(name)}" type="text" data-city-input autocomplete="off" maxlength="120" ${required?'required':''} placeholder="${t.cityPlaceholder}" value="${escape(normalizeCity(value))}">`;
}
const searchIndexes=new WeakMap();
export function findCities(rows,query,{limit=12}={}){
 const q=fold(normalizeCity(query));if(q.length<2)return [];
 let index=searchIndexes.get(rows);
 if(!index){index=rows.map(row=>({row,names:[row[0],row[1],...(row[5]||[])].map(fold),location:fold(`${row[0]}, ${row[2]}`)}));searchIndexes.set(rows,index)}
 const matches=[];
 for(const {row,names,location} of index){
  const main=names.slice(0,2),aliases=names.slice(2);
  const rank=main.includes(q)?0:main.some(n=>n.startsWith(q))?1:aliases.includes(q)?2:aliases.some(n=>n.startsWith(q))?3:main.some(n=>n.includes(q))||location.includes(q)?4:aliases.some(n=>n.includes(q))?5:6;
  if(rank<6)matches.push({row,rank});
 }
 return matches.sort((a,b)=>a.rank-b.rank||(b.row[6]||0)-(a.row[6]||0)||a.row[0].localeCompare(b.row[0])||a.row[4]-b.row[4]).slice(0,limit).map(m=>m.row);
}
let bound=false;
export function initCities(lang='hu'){
 if(bound)return;bound=true;
 const t=cityCopy[lang];let catalog=null,pending=null,active=null,ticket=0,timer;
 const countries=new Intl.DisplayNames([lang],{type:'region'});
 const list=document.createElement('datalist');list.id='global-city-suggestions';document.body.append(list);
 const status=document.createElement('p');status.id='global-city-status';status.className='sr-only';status.setAttribute('role','status');document.body.append(status);
 async function suggest(input){
  active=input;const version=++ticket;
  input.setAttribute('list',list.id);list.replaceChildren();
  const query=normalizeCity(input.value);if(query.length<2)return;
  if(!catalog){
   status.textContent=t.cityLoading;
   pending??=import('./cities-index.mjs').catch(error=>{pending=null;throw error});
   try{catalog=await pending}catch{if(version===ticket)status.textContent=t.cityUnavailable;return}
  }
  if(version!==ticket||active!==input||!input.isConnected)return;
  const rows=findCities(catalog.cityRows,query);
  for(const row of rows){
   const [name,,country,admin]=row,region=catalog.admin1Names[`${country}.${admin}`]||admin;
   const option=document.createElement('option');
   const proposed=`${name}, ${country}${region?` (${region})`:''}`;
   option.value=proposed.length<=120?proposed:`${name}, ${country}`;
   // Native datalists filter again: retain the entered alias/script in the label.
   option.label=`${countries.of(country)}${region?` · ${region}`:''} · ${query}`;
   list.append(option);
  }
  status.textContent=rows.length?t.cityLoaded:t.noCityMatch;
 }
 document.addEventListener('focusin',event=>{if(event.target.matches?.('[data-city-input]'))suggest(event.target)});
 document.addEventListener('input',event=>{if(event.target.matches?.('[data-city-input]')){clearTimeout(timer);ticket++;list.replaceChildren();timer=setTimeout(()=>suggest(event.target),120)}});
 document.addEventListener('focusout',event=>{if(event.target===active){clearTimeout(timer);ticket++;active=null}});
}
