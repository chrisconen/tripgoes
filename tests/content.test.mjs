import test from 'node:test';
import assert from 'node:assert/strict';
import {loadArticles,wordCount,articleText} from '../scripts/journal.mjs';

test('100 distinct original bilingual articles have substantial complete bodies',async()=>{
 const articles=await loadArticles();
 assert.ok(articles.length>=100);
 const titles={hu:new Set(),en:new Set()},paragraphs={hu:new Map(),en:new Map()};
 for(const a of articles){
  assert.equal(a.kind,'original',a.slug);
  for(const lang of ['hu','en']){
   assert.ok(!titles[lang].has(a[lang].title),`Duplicate title ${a.slug}`);titles[lang].add(a[lang].title);
   const body=a[lang].sections.flatMap(s=>s.paragraphs);
   assert.ok(wordCount(body.join(' '))>=250,`Short body ${a.slug}/${lang}`);
   assert.ok(articleText(a,lang).length>1000);
   assert.ok(!/\b(?:TODO|Lorem ipsum|TBD)\b/i.test(body.join(' ')),`Placeholder ${a.slug}`);
   for(const paragraph of body){
    const normalized=paragraph.toLowerCase().replace(/\s+/g,' ').trim();
    if(normalized.length<160)continue;
    assert.ok(!paragraphs[lang].has(normalized),`Repeated paragraph ${a.slug} and ${paragraphs[lang].get(normalized)}`);
    paragraphs[lang].set(normalized,a.slug);
   }
  }
 }
});
