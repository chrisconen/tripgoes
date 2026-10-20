import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCity,sampleCostCity,findCities,cityInput} from '../src/cities.mjs';
import {cityRows,admin1Names} from '../src/cities-index.mjs';
import {createView} from '../src/views.mjs';

test('city entry accepts worldwide Unicode towns beyond the suggestions',()=>{
 for(const city of ['東京','São Paulo, BR','دبي','Cape Town, ZA','Ōamaru','A tiny village'])assert.equal(normalizeCity(city),city);
 assert.equal(normalizeCity('  New   York  '),'New York');
 assert.equal(normalizeCity('x'.repeat(121)),'');
 assert.equal(normalizeCity('Paris\nFrance'),'');
 assert.equal(normalizeCity({city:'Budapest'}),'');
});
test('local sample cost lookup requires an explicit matching Hungarian place',()=>{
 assert.equal(sampleCostCity('Győr'),'Győr');
 assert.equal(sampleCostCity('Gyor, HU (Gyor-Moson-Sopron)'),'Győr');
 for(const city of ['Paris','Budapest, US','Budapest <img>','__proto__',''])assert.equal(sampleCostCity(city),null);
});
test('catalogue has global, unique records and finds accented and non-Latin aliases',()=>{
 assert.ok(cityRows.length>30000);
 assert.equal(new Set(cityRows.map(r=>r[4])).size,cityRows.length);
 for(const query of ['Tokyo','東京','Bécs','München','São Paulo','Nairobi','Sydney','Buenos Aires','Dubai']){
  const matches=findCities(cityRows,query);
  assert.ok(matches.length,query);assert.ok(matches.length<=12,query);
 }
 assert.ok(findCities(cityRows,'Paris').some(r=>r[2]==='FR'));
 assert.equal(findCities(cityRows,'').length,0);
 assert.equal(findCities(cityRows,'zzzzxxyy unlikelytown').length,0);
 assert.ok(admin1Names['US.CA']);
});
test('free city text is escaped in fields and all city pickers are open inputs',()=>{
 const value='"><img src=x onerror=alert(1)>';
 assert.ok(!cityInput({value}).includes('<img'));
 for(const lang of ['hu','en']){
  const html=createView({lang,filters:{city:value,days:30,type:'all',budget:Infinity,scoreOnly:false,sort:'recommended'},calcState:{city:value,travelers:2,bag:true,transfer:true}}).home();
  assert.ok(html.includes('data-city-input'));
  assert.ok(!html.includes('<select name="city"'));
  assert.ok(!html.includes('<select id="calc-city"'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('NaN'));
 }
});
