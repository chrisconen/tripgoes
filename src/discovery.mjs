export function initDiscovery(lang){
 const section=document.getElementById('page-discovery');
 if(!section)return;
 const hu=lang==='hu',track=section.querySelector('.discovery-track');
 const items=[...track.children],prev=section.querySelector('[data-discovery-prev]'),next=section.querySelector('[data-discovery-next]');
 const status=section.querySelector('.discovery-status'),modes=[...section.querySelectorAll('[data-discovery-mode]')],arrows=section.querySelector('.discovery-arrows');
 let mode='slider',frame=0;
 section.querySelector('.discovery-modes').hidden=false;arrows.hidden=false;
 function update(){
  frame=0;
  if(mode==='gallery'){status.textContent=`${items.length} ${hu?'cikk a galériában':'stories in the gallery'}`;return}
  const rect=track.getBoundingClientRect();
  const visible=items.map((item,index)=>({index,rect:item.getBoundingClientRect()})).filter(item=>item.rect.right>rect.left+15&&item.rect.left<rect.right-15);
  const first=(visible[0]?.index??0)+1,last=(visible.at(-1)?.index??0)+1;
  status.textContent=`${String(first).padStart(2,'0')}–${String(last).padStart(2,'0')} / ${items.length} ${hu?'cikk':'stories'}`;
  prev.disabled=track.scrollLeft<2;next.disabled=track.scrollLeft+track.clientWidth>=track.scrollWidth-2;
 }
 function move(direction){
  const step=items.length>1?items[1].offsetLeft-items[0].offsetLeft:track.clientWidth;
  const count=Math.max(1,Math.round(track.clientWidth/step));
  track.scrollBy({left:direction*step*count,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
 }
 prev.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));
 modes.forEach(button=>button.addEventListener('click',()=>{
  mode=button.dataset.discoveryMode;section.classList.toggle('discovery-gallery',mode==='gallery');
  modes.forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  arrows.hidden=mode==='gallery';track.tabIndex=mode==='gallery'?-1:0;
  track.setAttribute('aria-label',mode==='gallery'?(hu?'Ajánlott cikkek galériája':'Recommended articles gallery'):(hu?'Ajánlott cikkek; vízszintesen görgethető':'Recommended articles; scroll horizontally'));
  track.scrollLeft=0;update();
 }));
 track.addEventListener('keydown',event=>{
  if(event.target!==track||mode!=='slider')return;
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();move(event.key==='ArrowLeft'?-1:1)}
  if(event.key==='Home'||event.key==='End'){event.preventDefault();track.scrollTo({left:event.key==='Home'?0:track.scrollWidth,behavior:'instant'})}
 });
 track.addEventListener('scroll',()=>{if(!frame)frame=requestAnimationFrame(update)},{passive:true});
 if(typeof ResizeObserver!=='undefined')new ResizeObserver(update).observe(track);
 update();
}
