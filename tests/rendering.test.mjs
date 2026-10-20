import test from 'node:test';
import assert from 'node:assert/strict';
import {createView} from '../src/views.mjs';

test('home is readable without browser globals and includes working tool destinations',()=>{
 for(const lang of ['hu','en']){
  const view=createView({lang});
  const html=view.header()+view.home()+view.footer();
  assert.equal((html.match(/<main /g)||[]).length,1);
  assert.equal((html.match(/class="deal-card"/g)||[]).length,6);
  assert.ok(html.includes(`href="/${lang}/planner/"`));
  assert.ok(html.includes(`href="/${lang}/score/"`));
  assert.ok(html.includes(`href="/${lang}/blog/"`));
  assert.ok(!html.includes('undefined'));
 }
});
test('static navigation switches to the same article in the other language',()=>{
 const view=createView({lang:'hu',page:'blog',pathname:'/hu/blog/a-lastminute-ajanlat-teljes-koltsege/'});
 assert.ok(view.header().includes('href="/en/blog/a-lastminute-ajanlat-teljes-koltsege/"'));
});
test('unknown routes render the localized not-found main, not a sample home',()=>{
 for(const lang of ['hu','en']){
  const html=createView({lang,page:'404'}).infoPage();
  assert.ok(html.includes('<h1>'));
  assert.ok(!html.includes('class="hero'));
  assert.ok(!html.includes('undefined'));
 }
});
