import test from 'node:test';
import assert from 'node:assert/strict';
import { articleCta, ARTICLE_CTA, ctaHref } from '../src/articlecta.mjs';
import { SEARCH_URL } from '../src/tools.mjs';

test('every category sends the reader somewhere bookable, in both languages', () => {
  for (const [category, entry] of Object.entries(ARTICLE_CTA)) {
    for (const lang of ['hu', 'en']) {
      const html = articleCta(category, lang);
      assert.ok(html.includes(entry[lang].title), `${category} has no ${lang} title`);
      assert.ok(html.includes(entry[lang].cta), `${category} has no ${lang} call to action`);
      assert.ok(html.includes(`href="${ctaHref(entry.route, lang)}"`), `${category} links wrong in ${lang}`);
      assert.ok(!html.includes('undefined'));
    }
  }
  // The live search sits on a different domain per language.
  assert.ok(articleCta('flights', 'en').includes(SEARCH_URL.en));
  assert.ok(articleCta('flights', 'hu').includes(SEARCH_URL.hu));
  assert.ok(articleCta('flights', 'hu').includes('rel="noopener"'));
});

test('an unknown category still carries a commercial link', () => {
  const html = articleCta('something-new', 'hu');
  assert.ok(html.includes('href="/hu/utak/"'), 'the fallback must not be a dead end');
  assert.ok(!html.includes('undefined'));
});
