import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,stat,readdir } from 'node:fs/promises';
import {loadArticles,articleImage,escapeHTML} from '../scripts/journal.mjs';
import {createHash} from 'node:crypto';

test('Travelpayouts runs once in every head under a matching, narrow CSP',async()=>{
 const files=(await readdir('dist',{recursive:true})).filter(path=>path.endsWith('.html'));
 for(const file of files){
  const html=await readFile(`dist/${file}`,'utf8');
  const head=html.split('</head>')[0];
  const loaders=[...head.matchAll(/<script nowprocket([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.equal(loaders.length,1,file);
  assert.equal(html.split('https://emrldco.com/NTg4NDk2.js?t=588496').length-1,1,file);
  const hash=createHash('sha256').update(loaders[0][2].replaceAll('\r\n','\n')).digest('base64');
  assert.ok(head.includes(`'sha256-${hash}'`),file);
  for(const attribute of ['data-noptimize="1"','data-cfasync="false"','data-wpfc-render="false"','seraph-accel-crit="1"','data-no-defer="1"','data-cmp-ab="2"'])assert.ok(loaders[0][1].includes(attribute),file);
  assert.ok(head.indexOf('<script nowprocket')<head.indexOf('<script type="module"'),file);
  assert.ok(!head.includes("'unsafe-eval'"),file);
  // Inline styling is allowed on one route only, and only for style-src: the
  // service widgets style themselves inline, including inside a shadow root.
  const services=/services/.test(file);
  assert.equal(head.includes("'unsafe-inline'"),services,file);
  if(services)assert.ok(/style-src [^;]*'unsafe-inline'/.test(head)&&!/script-src [^;]*'unsafe-inline'/.test(head),file);
  const connect=head.match(/connect-src ([^;]+);/)[1];
  assert.ok(connect.includes('https://emrldco.com'),file);
  assert.equal(connect.includes('workers.dev'),/[/\\](?:flights|last-minute)[/\\]/.test(file),file);
  assert.equal(connect.includes("'self'"),/[/\\](?:flights|last-minute)[/\\]/.test(file),file);
 }
});

test('both locales have correct custom-domain metadata and complete templates',async()=>{
 for(const lang of ['hu','en']){
  for(const route of ['', 'guides/', 'about/', 'contact/', 'imprint/', 'privacy/', 'cookies/', 'affiliate/','score/','planner/','flights/','last-minute/','blog/']){
   const html=await readFile(`dist/${lang}/${route}index.html`,'utf8');
   assert.ok(html.includes(`href="https://tripgoes.com/${lang}/${route}"`));
   assert.ok(html.includes(`hreflang="hu" href="https://tripgoes.com/hu/${route}"`));
   assert.ok(html.includes(`hreflang="en" href="https://tripgoes.com/en/${route}"`));
   assert.ok(!html.includes('{{'));
   assert.ok(!html.includes('chatgpt.site'));
  }
 }
});

test('every page has a readable static main and complete shared navigation',async()=>{
 const files=(await readdir('dist',{recursive:true})).filter(path=>path.endsWith('.html'));
 for(const file of files){
  const html=await readFile(`dist/${file}`,'utf8');
  assert.equal([...html.matchAll(/<main /g)].length,1,file);
  assert.equal([...html.matchAll(/<footer>/g)].length,1,file);
  assert.ok(html.includes('class="desktop-nav"'),file);
  assert.ok(html.includes('<h1>'),file);
  assert.ok(!html.includes('undefined'),file);
 }
 const app=await readFile('src/app.mjs','utf8');
 assert.ok(!app.includes("$('#app').innerHTML="),'Static content must not be discarded');
 const notFound=await readFile('dist/404.html','utf8');
 assert.ok(notFound.includes('data-page="404"'));
 assert.ok(!notFound.includes('class="hero container"'));
});
test('deployment includes domain and assets without source-only private material',async()=>{
 assert.equal((await readFile('dist/CNAME','utf8')).trim(),'tripgoes.com');
 for(const path of ['src/app.mjs','src/styles.css','src/score.mjs','src/platform.css','assets/hero.jpg','assets/manrope-bold.ttf','404.html','sitemap.xml']){
  assert.ok((await stat(`dist/${path}`)).size>0);
 }
 for(const path of ['master_plan.md','masterplan.md','.git/config','.openai/hosting.json','backend/worker.mjs','backend/migrations/0001_initial.sql','.tmp/cloudflare-session.json']){
  await assert.rejects(stat(`dist/${path}`),{code:'ENOENT'});
 }
});
test('every bilingual article is statically readable and has matching locale metadata',async()=>{
 const articles=await loadArticles();
 const sitemap=await readFile('dist/sitemap.xml','utf8');
 for(const a of articles)for(const lang of ['hu','en']){
  const path=`/${lang}/blog/${a.slug}/`,html=await readFile(`dist${path}index.html`,'utf8');
  assert.ok(html.includes('<article class="article-prose">'),path);
  assert.ok(html.includes('<h1>'),path);
  assert.ok(html.includes(`hreflang="en" href="https://tripgoes.com/en/blog/${a.slug}/"`),path);
  assert.ok(html.includes(`hreflang="hu" href="https://tripgoes.com/hu/blog/${a.slug}/"`),path);
  assert.ok(sitemap.includes(`https://tripgoes.com${path}`));
  assert.ok(a.artwork,`Missing article artwork: ${a.slug}`);
  assert.ok(html.includes(`property="og:image" content="https://tripgoes.com${articleImage(a)}"`),path);
  assert.ok(html.includes(`alt="${escapeHTML(a.artwork.alt[lang])}"`),path);
  assert.ok(html.includes(`href="${escapeHTML(a.artwork.credit.url)}"`),path);
  assert.ok(html.includes(`href="${escapeHTML(a.artwork.credit.licenseUrl)}"`),path);
  assert.ok(!html.includes('{{'));
 }
});
test('generated HTML contains no broken local page or asset links',async()=>{
 const files=await readdir('dist',{recursive:true});
 const checked=new Set();
 for(const file of files.filter(path=>path.endsWith('.html'))){
  const html=await readFile(`dist/${file}`,'utf8');
  for(const match of html.matchAll(/(?:href|src)="([^"]+)"/g)){
   const value=match[1];
   if(!value.startsWith('/')||value.startsWith('//'))continue;
   const pathname=new URL(value,'https://tripgoes.com').pathname;
   const local=`dist${decodeURIComponent(pathname)}${pathname.endsWith('/')?'index.html':''}`;
   if(checked.has(local))continue;
   checked.add(local);
   assert.ok((await stat(local)).isFile(),`${file} → ${value}`);
  }
 }
 assert.ok(checked.size>=205);
});

test('every page has one localized sharing bar and 12 static article recommendations',async()=>{
 const files=(await readdir('dist',{recursive:true})).filter(path=>path.endsWith('.html'));
 assert.ok(files.length>=222);
 for(const file of files){
  const html=await readFile(`dist/${file}`,'utf8');
  assert.equal([...html.matchAll(/id="page-sharing"/g)].length,1,file);
  assert.equal([...html.matchAll(/id="page-discovery"/g)].length,1,file);
  assert.equal([...html.matchAll(/class="discovery-item"/g)].length,12,file);
  assert.equal([...html.matchAll(/class="share-link share-/g)].length,6,file);
  const lang=file.replaceAll('\\','/').startsWith('en/')?'en':'hu';
  assert.ok(html.includes(`data-share-lang="${lang}"`),file);
  assert.ok(html.includes('data-share-copy'),file);
 }
});

// The commission wording is a deliberate business decision, not an oversight:
// it is kept off every page a visitor browses. Only the dedicated affiliate
// page, which exists to state the relationship, may carry it.
test('no page outside the affiliate notice tells visitors about commission',async()=>{
 const files=(await readdir('dist',{recursive:true})).filter(path=>path.endsWith('.html'));
 const banned=[/jutalékot kaphatunk/i,/jutalék mértéke/i,/earn a commission/i,/receive a commission/i,/commission size/i];
 const allowed=/affiliate/;
 let checked=0;
 for(const file of files){
  if(allowed.test(file))continue;
  checked++;
  const html=await readFile(`dist/${file}`,'utf8');
  for(const pattern of banned)assert.ok(!pattern.test(html),`${file} still carries ${pattern}`);
 }
 assert.ok(checked>300,`only ${checked} pages checked`);
});

// Deleting a line that happened to carry a closing tag once nested a whole
// section inside the hero image. The tests passed; only the browser showed it.
test('every page closes the containers it opens',async()=>{
 const files=(await readdir('dist',{recursive:true})).filter(path=>path.endsWith('.html'));
 for(const file of files){
  const html=await readFile(`dist/${file}`,'utf8');
  for(const tag of ['div','section','main','article','ul','li']){
   const open=(html.match(new RegExp(`<${tag}[\\s>]`,'g'))||[]).length;
   const close=(html.match(new RegExp(`</${tag}>`,'g'))||[]).length;
   assert.equal(open,close,`${file}: ${open} <${tag}> vs ${close} </${tag}>`);
  }
 }
});

// The homepage shipped with noindex, which is why nothing could rank: the
// strongest page on the site told Google to skip it. Assert the split
// directly, in the meta tag and in the sitemap, so it cannot drift back.
test('the pages we want found are indexable and listed in the sitemap',async()=>{
 const sitemap=await readFile('dist/sitemap.xml','utf8');
 const indexed=['','about/','contact/','imprint/','score/','planner/','experiences/','services/','blog/','utak/'];
 // Volatile fares, the commission notice and the duplicate journal index.
 const hidden=['privacy/','cookies/','affiliate/','guides/','flights/','last-minute/'];
 for(const lang of ['hu','en']){
  for(const route of indexed){
   const html=await readFile(`dist/${lang}/${route}index.html`,'utf8');
   assert.ok(html.includes('content="index,follow"'),`/${lang}/${route} is noindex`);
   assert.ok(sitemap.includes(`<loc>https://tripgoes.com/${lang}/${route}</loc>`),`/${lang}/${route} is missing from the sitemap`);
  }
  for(const route of hidden){
   const html=await readFile(`dist/${lang}/${route}index.html`,'utf8');
   assert.ok(html.includes('content="noindex,follow"'),`/${lang}/${route} should stay out of search`);
   assert.ok(!sitemap.includes(`<loc>https://tripgoes.com/${lang}/${route}</loc>`),`/${lang}/${route} should stay out of the sitemap`);
  }
 }
 // Destination pages come and go with the feed, so check every one that was
 // built rather than naming them.
 const destinations=(await readdir('dist/hu/utak',{withFileTypes:true})).filter(entry=>entry.isDirectory()).map(entry=>entry.name);
 assert.ok(destinations.length>=8,`only ${destinations.length} destination pages`);
 for(const lang of ['hu','en'])for(const slug of destinations){
  const html=await readFile(`dist/${lang}/utak/${slug}/index.html`,'utf8');
  assert.ok(html.includes('content="index,follow"'),`/${lang}/utak/${slug}/ is noindex`);
  assert.ok(sitemap.includes(`<loc>https://tripgoes.com/${lang}/utak/${slug}/</loc>`),`/${lang}/utak/${slug}/ is missing from the sitemap`);
 }
 // No empty path segments: a doubled slash is a separate, duplicate URL.
 assert.ok(!/\/\/<\/loc>/.test(sitemap),'the sitemap carries a doubled slash');
 // The bare root repeats the Hungarian homepage, so it only points at it.
 const root=await readFile('dist/index.html','utf8');
 assert.ok(root.includes('content="noindex,follow"'));
 assert.ok(root.includes('rel="canonical" href="https://tripgoes.com/hu/"'));
});
