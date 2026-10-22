import test from 'node:test';
import assert from 'node:assert/strict';
import { toolsPage, toolsBand, TOOLS, SEARCH_URL, searchUrl } from '../src/tools.mjs';

test('every tool is reachable in both languages and names its own limit', () => {
  for (const lang of ['hu', 'en']) {
    const html = toolsPage(lang);
    assert.equal((html.match(/class="tool-card/g) || []).length, TOOLS.length);
    assert.equal((html.match(/<h1>/g) || []).length, 1);
    for (const tool of TOOLS) {
      assert.ok(html.includes(tool[lang].name), `${tool.id} has no ${lang} name`);
      // Four of the five run on cached or self-entered data. Saying so is the
      // whole reason these are allowed on the page at all.
      assert.ok(html.includes(tool[lang].limit), `${tool.id} hides its ${lang} limit`);
      const href = tool.external ? searchUrl(lang) : `/${lang}/${tool.href}`;
      assert.ok(html.includes(`href="${href}"`), `${tool.id} links to the wrong place in ${lang}`);
    }
    // The White Label is single-language, so each locale has its own page;
    // sending an English visitor to the Hungarian one leaves them stuck.
    assert.ok(html.includes(SEARCH_URL[lang]) && html.includes('rel="noopener"'));
    assert.ok(!html.includes(SEARCH_URL[lang === 'en' ? 'hu' : 'en']), 'the other locale’s search page must not appear');
    // The whole card is one link; without a label its accessible name is every
    // word on the card, limit sentence included.
    for (const tool of TOOLS) assert.ok(html.includes(`aria-label="${tool[lang].name}"`), `${tool.id} has no ${lang} link label`);
    assert.ok(!html.includes('undefined'));
  }
});

test('the landing band carries the same cards and a way through to the page', () => {
  for (const lang of ['hu', 'en']) {
    const band = toolsBand(lang);
    assert.equal((band.match(/class="tool-card/g) || []).length, TOOLS.length);
    assert.ok(band.includes(`href="/${lang}/eszkozok/"`));
    assert.ok(!band.includes('<h1>'), 'the landing page already has its own h1');
    // The artwork belongs to the tools page; repeating it on the landing page
    // would compete with the trip photography that carries the offers.
    assert.ok(!band.includes('tool-banner'));
    assert.ok(band.includes('<h2 '));
  }
});

test('the artwork is drawn in code, never a photograph of somewhere we sell', () => {
  const html = toolsPage('hu');
  assert.equal((html.match(/<svg class="tool-art"/g) || []).length, TOOLS.length);
  // An <img> here would mean a generated or stock picture had crept in next to
  // real, bookable offers.
  assert.ok(!html.includes('<img'), 'tool artwork must stay vector, not imagery');
  // The one raster on the page is the decorative banner, and it stays
  // decorative: no alt text to read, nothing announced.
  assert.equal((html.match(/class="tool-banner/g) || []).length, 1);
  assert.ok(html.includes('role="presentation"'));
  // The mark repeats the name printed beside it, so it is decorative. It used
  // to carry a <title> naming the artwork key in English whatever the page
  // language was, which a Hungarian screen reader read out as "scales".
  assert.equal((html.match(/aria-hidden="true"/g) || []).length, TOOLS.length);
  assert.ok(!html.includes('<title'), 'the mark must not announce itself');
});

test('tool copy is escaped wherever it is rendered', () => {
  const dirty = { ...TOOLS[0], hu: { ...TOOLS[0].hu, name: '<img src=x>' } };
  const original = TOOLS[0];
  TOOLS[0] = dirty;
  try {
    const html = toolsPage('hu');
    assert.ok(html.includes('&lt;img src=x&gt;') && !html.includes('<img src=x>'));
  } finally {
    TOOLS[0] = original;
  }
});
