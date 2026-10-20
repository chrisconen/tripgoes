import test from 'node:test';
import assert from 'node:assert/strict';
import {loadArticles} from '../scripts/journal.mjs';
import {recommendedArticles,renderRecommendations} from '../scripts/recommendations.mjs';

test('every article gets 12 distinct recommendations excluding itself, prioritizing its topic',async()=>{
 const articles=await loadArticles();
 for(const a of articles){
  const result=recommendedArticles(articles,{slug:a.slug});
  assert.equal(result.length,12);
  assert.equal(new Set(result.map(r=>r.slug)).size,12);
  assert.ok(!result.some(r=>r.slug===a.slug));
  assert.equal(result[0].category,a.category);
  assert.deepEqual(result,recommendedArticles(articles,{slug:a.slug}));
 }
 assert.equal(recommendedArticles(articles,{seed:'about'}).length,12);
});

test('recommendations are static localized links with manual gallery and carousel controls',async()=>{
 const articles=await loadArticles();
 for(const lang of ['hu','en']){
  const html=renderRecommendations(articles,lang,{slug:articles[0].slug});
  assert.equal([...html.matchAll(/class="discovery-item"/g)].length,12);
  assert.ok(!html.includes(`href="/${lang}/blog/${articles[0].slug}/"`));
  assert.ok(html.includes('data-discovery-mode="gallery"'));
  assert.ok(html.includes('data-discovery-next'));
  assert.ok(html.includes(`href="/${lang}/blog/`));
 }
});
