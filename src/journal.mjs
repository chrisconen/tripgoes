export function initJournal(lang){
 const search=document.getElementById('journal-search');
 if(!search)return;
 const category=document.getElementById('journal-category'),cards=[...document.querySelectorAll('[data-journal-card]')],more=document.getElementById('journal-more');
 let limit=12;
 const normalize=s=>s.toLocaleLowerCase(lang).normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 function render(){
  const q=normalize(search.value.trim());
  const matching=cards.filter(card=>(category.value==='all'||card.dataset.category===category.value)&&normalize(card.dataset.search).includes(q));
  const visible=new Set(matching.slice(0,limit));cards.forEach(card=>{card.hidden=!visible.has(card)});
  document.getElementById('journal-results').textContent=`${matching.length} ${lang==='hu'?'útmutató':'guides'} · ${Math.min(limit,matching.length)} ${lang==='hu'?'látható':'shown'}`;
  document.getElementById('journal-empty').hidden=matching.length!==0;
  more.hidden=matching.length<=limit;
 }
 search.addEventListener('input',()=>{limit=12;render()});
 category.addEventListener('change',()=>{limit=12;render()});
 document.getElementById('journal-reset').addEventListener('click',()=>{search.value='';category.value='all';limit=12;render();search.focus()});
 more.addEventListener('click',()=>{limit+=12;render()});
 render();
}
