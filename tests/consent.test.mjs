import test from 'node:test';
import assert from 'node:assert/strict';
import { readConsent, writeConsent, consentBanner, copy, CONSENT_KEY, GRANTED, DENIED } from '../src/consent.mjs';
import { PIXEL_ID, pixelConfigured, initPixel, OUTBOUND_EVENT } from '../src/marketing.mjs';

const fakeStorage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), data };
};

test('a decision is only remembered when it is one of the two answers', () => {
  const storage = fakeStorage();
  assert.equal(readConsent(storage), null, 'nothing is assumed before anyone answers');
  assert.ok(writeConsent(GRANTED, storage));
  assert.equal(readConsent(storage), GRANTED);
  assert.ok(writeConsent(DENIED, storage));
  assert.equal(readConsent(storage), DENIED);
  for (const rubbish of ['yes', '', null, undefined, 'true']) {
    assert.equal(writeConsent(rubbish, storage), false, String(rubbish));
  }
  assert.equal(storage.data.get(CONSENT_KEY), DENIED, 'rubbish never overwrites a real answer');
  // Storage that throws must not take the page down with it.
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(readConsent(broken), null);
  assert.equal(writeConsent(GRANTED, broken), false);
});

test('refusing is offered as plainly as agreeing', () => {
  for (const lang of ['hu', 'en']) {
    const html = consentBanner(lang);
    assert.ok(html.includes(copy[lang].yes) && html.includes(copy[lang].no));
    // Same element, same class: no dark pattern where one choice is a
    // button and the other a grey whisper.
    const buttons = [...html.matchAll(/<button type="button" class="([^"]+)" data-consent="([^"]+)"/g)];
    assert.equal(buttons.length, 2);
    assert.ok(buttons.every(([, classes]) => classes.includes('button')), 'both answers are buttons');
    assert.deepEqual(buttons.map(([, , choice]) => choice).sort(), [DENIED, GRANTED].sort());
    assert.ok(html.includes(`href="/${lang}/cookies/"`), 'the banner says where to read more');
    assert.ok(html.includes('role="dialog"') && html.includes('aria-labelledby'));
    assert.ok(!html.includes('undefined'));
  }
});

test('only a plausible pixel id turns tracking on', () => {
  for (const bad of ['', 'abc', '12345', null, undefined, '12345678901234567890123', '12 34567890']) {
    assert.equal(pixelConfigured(bad), false, String(bad));
  }
  assert.ok(pixelConfigured('1234567890123'));
  // Whatever is shipped has to pass the same check as anything else.
  assert.equal(pixelConfigured(PIXEL_ID), /^\d{6,20}$/.test(PIXEL_ID));
  // Without a document there is nothing to attach to, and nothing is faked.
  assert.equal(initPixel(''), null);
  assert.equal(OUTBOUND_EVENT, 'OutboundOffer');
});
