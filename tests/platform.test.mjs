import test from 'node:test';
import assert from 'node:assert/strict';
import {providers,providerDestination} from '../src/partners.mjs';
import {checkerPage} from '../src/checker.mjs';
import {escapeHTML} from '../scripts/journal.mjs';

test('outbound providers resolve only from the maintained HTTPS registry',()=>{
 assert.equal(providerDestination('https://evil.example'),null);
 assert.equal(providerDestination('__proto__'),null);
 for(const p of providers){assert.equal(new URL(providerDestination(p.id)).protocol,'https:');assert.equal(p.affiliate,false);assert.ok(Object.isFrozen(p))}
});
test('checker is independently rendered in both languages with explicit trust boundary',()=>{
 for(const lang of ['hu','en']){
  const html=checkerPage(lang);
  assert.ok(html.includes('id="score-form"'));
  assert.ok(html.includes('name="inclusions"'));
  assert.ok(html.includes('name="comparable"'));
  assert.ok(!html.includes('undefined'));
  assert.ok(!html.includes('<script'));
 }
});
test('untrusted editorial text is escaped in all HTML-sensitive characters',()=>{
 assert.equal(escapeHTML('<img onerror="x">&\'`'), '&lt;img onerror=&quot;x&quot;&gt;&amp;&#39;`');
});
