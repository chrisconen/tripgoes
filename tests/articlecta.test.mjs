import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
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

// Every article used to end on the affiliate notice and nothing else: a
// hundred guides, in two languages, that led nowhere commercial.
test('every built article body links out to something bookable', async () => {
  const commercial = /\/(utak|experiences|eszkozok)\/|tripgoes\.com\//;
  for (const lang of ['hu', 'en']) {
    const slugs = (await readdir(`dist/${lang}/blog`, { withFileTypes: true })).filter(entry => entry.isDirectory());
    assert.ok(slugs.length >= 100, `only ${slugs.length} articles in ${lang}`);
    for (const { name } of slugs) {
      const html = await readFile(`dist/${lang}/blog/${name}/index.html`, 'utf8');
      const body = html.match(/<article class="article-prose">([\s\S]*?)<\/article>/)[1];
      const hrefs = [...body.matchAll(/href="([^"]+)"/g)].map(hit => hit[1]).filter(href => !href.includes('/affiliate/'));
      assert.ok(hrefs.some(href => commercial.test(href)), `/${lang}/blog/${name}/ leads nowhere: ${hrefs.join(', ') || 'no links at all'}`);
    }
  }
});
