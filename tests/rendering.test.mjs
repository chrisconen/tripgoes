import test from 'node:test';
import assert from 'node:assert/strict';
import {createView} from '../src/views.mjs';

test('home is readable without browser globals and leads with real trips',()=>{
 const trips={total:263,deals:'<ul class="pkg-grid"><li class="pkg-card">A</li></ul>',
  dream:'<ul class="pkg-grid"><li class="pkg-card">B</li></ul>',
  destinations:'<a href="/hu/utak/maldiv-szigetek/">Maldív-szigetek<span>18</span></a>'};
 for(const lang of ['hu','en']){
  const view=createView({lang,trips});
  const html=view.header()+view.home()+view.footer();
  assert.equal((html.match(/<main /g)||[]).length,1);
  // The invented sample offers are gone; the homepage leads with real inventory.
  assert.equal((html.match(/class="deal-card"/g)||[]).length,0);
  assert.ok(!html.includes('id="deal-grid"')&&!html.includes('id="search-form"')&&!html.includes('id="calculator"'));
  assert.equal((html.match(/class="trip-showcase/g)||[]).length,2,'bargains and long-haul');
  assert.equal((html.match(/class="pkg-card"/g)||[]).length,2);
  assert.ok(html.includes('trip-destinations'));
  // The menu is four of our own pages now, and the dead #deals anchor is gone.
  for(const route of ['utak','experiences','services','blog'])assert.ok(html.includes(`href="/${lang}/${route}/"`),route);
  assert.ok(!html.includes('#deals')&&!html.includes('?type='),'the removed deal section is not linked');
  assert.ok(!html.includes('undefined'));
 }
});
// The build passes no trips until the feed has been synced; the page still has
// to render rather than print "undefined" where the cards belong.
test('home renders without any trip data',()=>{
 const html=createView({lang:'hu'}).home();
 assert.ok(html.includes('<main ')&&html.includes('class="hero'));
 assert.ok(!html.includes('trip-showcase')&&!html.includes('undefined'));
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
