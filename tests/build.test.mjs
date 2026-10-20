import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,stat } from 'node:fs/promises';

test('both locales have correct custom-domain metadata and complete templates',async()=>{
 for(const lang of ['hu','en']){
  for(const route of ['', 'guides/', 'about/', 'contact/', 'imprint/', 'privacy/', 'cookies/', 'affiliate/']){
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
 for(const path of ['src/app.mjs','src/styles.css','assets/hero.jpg','assets/manrope-bold.ttf','404.html']){
  assert.ok((await stat(`dist/${path}`)).size>0);
 }
 for(const path of ['master_plan.md','.git/config','.openai/hosting.json']){
  await assert.rejects(stat(`dist/${path}`),{code:'ENOENT'});
 }
});
