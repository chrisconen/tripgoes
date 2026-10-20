import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,stat,readdir } from 'node:fs/promises';
import {loadArticles} from '../scripts/journal.mjs';

test('both locales have correct custom-domain metadata and complete templates',async()=>{
 for(const lang of ['hu','en']){
  for(const route of ['', 'guides/', 'about/', 'contact/', 'imprint/', 'privacy/', 'cookies/', 'affiliate/','score/','blog/']){
   const html=await readFile(`dist/${lang}/${route}index.html`,'utf8');
   assert.ok(html.includes(`href="https://tripgoes.com/${lang}/${route}"`));
   assert.ok(html.includes(`hreflang="hu" href="https://tripgoes.com/hu/${route}"`));
   assert.ok(html.includes(`hreflang="en" href="https://tripgoes.com/en/${route}"`));
   assert.ok(!html.includes('{{'));
   assert.ok(!html.includes('chatgpt.site'));
  }
 }
});
test('deployment includes domain and assets without source-only private material',async()=>{
 assert.equal((await readFile('dist/CNAME','utf8')).trim(),'tripgoes.com');
 for(const path of ['src/app.mjs','src/styles.css','src/score.mjs','src/platform.css','assets/hero.jpg','assets/manrope-bold.ttf','404.html','sitemap.xml']){
  assert.ok((await stat(`dist/${path}`)).size>0);
 }
 for(const path of ['master_plan.md','masterplan.md','.git/config','.openai/hosting.json']){
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
