import test from 'node:test';
import assert from 'node:assert/strict';
import { offersPage, initOffers, buildOffersUrl, safeBookingUrl, validateOffersPayload, validateHistoryPayload, renderOfferCard, renderOfferHistory, createOfferClock } from '../src/offers.mjs';

const now = Date.parse('2026-10-20T12:00:00.000Z');
const offer = (changes = {}) => ({
  id: 'route_1', title: 'Example route', origin: 'Budapest', destination: 'Barcelona',
  departureDate: '2026-11-02', returnDate: '2026-11-05', travelers: 2, currency: 'EUR', totalPriceMinor: 12345,
  bookingUrl: 'https://booking.example/route?a=1&b=2', observedAt: '2026-10-20T11:00:00.000Z', expiresAt: '2026-10-20T13:00:00.000Z',
  source: { id: 'editor_1', name: 'Example source', kind: 'editorial' }, inclusions: 'Transport and mandatory charges', ...changes,
});
const response = (offers = [offer()], changes = {}) => ({ asOf: '2026-10-20T12:00:00.000Z', offers, hasMore: false, ...changes });
const history = (changes = {}) => ({ offerId: 'route_1', asOf: '2026-10-20T12:00:00.000Z', currency: 'EUR', basis: 'per_person', source: offer().source, history: [
  { observedAt: '2026-10-20T11:00:00.000Z', totalPriceMinor: 12345 },
  { observedAt: '2026-10-19T11:00:00.000Z', totalPriceMinor: 12000 },
], ...changes });

test('offers validate into a bounded independent schema without mutating source data', () => {
  const input = response([offer({ extra: 'discarded' })]);
  const before = JSON.stringify(input);
  const result = validateOffersPayload(input, now);
  assert.equal(result.offers.length, 1);
  assert.equal(result.offers[0].totalPriceMinor, 12345);
  assert.equal('extra' in result.offers[0], false);
  result.offers[0].source.name = 'Changed';
  assert.equal(JSON.stringify(input), before);
});

test('expiry is exclusive at the exact boundary and empty remains a valid response', () => {
  assert.equal(validateOffersPayload(response(), now).expiredCount, 0);
  const expired = validateOffersPayload(response(), Date.parse(offer().expiresAt));
  assert.equal(expired.offers.length, 0);
  assert.equal(expired.expiredCount, 1);
  assert.deepEqual(validateOffersPayload(response([]), now), { ...response([]), expiredCount: 0 });
  assert.equal(renderOfferCard(offer(), 'en', Date.parse(offer().expiresAt)), '');
});

test('invalid offers fail the whole response instead of masquerading as empty results', () => {
  const bad = [
    { totalPriceMinor: -1 }, { totalPriceMinor: 1.5 }, { totalPriceMinor: Number.MAX_SAFE_INTEGER + 1 }, { totalPriceMinor: '12345' },
    { travelers: 0 }, { travelers: 1.5 }, { travelers: 1000 }, { currency: 'eur' },
    { id: '../secret' }, { title: '' }, { origin: 'x'.repeat(121) }, { destination: null },
    { departureDate: '2026-02-30' }, { returnDate: '2026-01-01' }, { observedAt: 'yesterday' },
    { expiresAt: '2026-10-20T10:00:00.000Z' }, { observedAt: '2026-02-30T12:00:00.000Z' },
    { observedAt: '2026-10-20T12:01:00.000Z' },
    { inclusions: '' }, { inclusions: 'x'.repeat(3001) }, { bookingUrl: 'javascript:alert(1)' },
    { source: { ...offer().source, kind: 'verified' } },
  ];
  for (const changes of bad) assert.throws(() => validateOffersPayload(response([offer(changes)]), now), TypeError, JSON.stringify(changes));
  for (const data of [null, [], response([offer(), offer()]), response([], { hasMore: 'false' }), response([], { asOf: 'bad' }), response(Array.from({ length: 21 }, (_, i) => offer({ id: `r_${i}` })))]) {
    assert.throws(() => validateOffersPayload(data, now), TypeError);
  }
});

test('booking URLs permit HTTPS only and refuse embedded credentials', () => {
  for (const url of ['http://example.com', 'javascript:alert(1)', '//example.com', '/offers', 'data:text/html,test', 'https://u:p@example.com', null]) assert.equal(safeBookingUrl(url), null);
  assert.equal(safeBookingUrl('https://example.com/é?a=1&b=2'), 'https://example.com/%C3%A9?a=1&b=2');
});

test('search URLs encode Unicode filters, omit empty cities and never inherit secrets', () => {
  const url = new URL(buildOffersUrl('https://api.example/travel/', { origin: ' 東京 ', destination: 'São Paulo & Zürich', currency: 'EUR' }));
  assert.equal(url.pathname, '/travel/v1/offers');
  assert.equal(url.searchParams.get('origin'), '東京');
  assert.equal(url.searchParams.get('destination'), 'São Paulo & Zürich');
  assert.equal(url.searchParams.get('limit'), '20');
  assert.equal(new URL(buildOffersUrl('https://api.example')).searchParams.has('origin'), false);
  assert.equal(buildOffersUrl('https://api.example', {}, 'route_1'), 'https://api.example/v1/offers/route_1/history');
  for (const base of [undefined, '', '/api', 'http://api.example', 'https://user:token@api.example', 'https://api.example?token=secret', 'https://api.example#token']) assert.throws(() => buildOffersUrl(base));
  assert.throws(() => buildOffersUrl('https://api.example', { origin: 'x'.repeat(121) }));
  assert.throws(() => buildOffersUrl('https://api.example', { currency: 'XXX' }));
  assert.throws(() => buildOffersUrl('https://api.example', {}, '../token'));
});

test('history validates identity, price basis, currency and source against the selected offer', () => {
  const data = history({ history: [...history().history].reverse() });
  const before = JSON.stringify(data);
  assert.equal(validateHistoryPayload(data, offer()).history[0].totalPriceMinor, 12345);
  assert.equal(JSON.stringify(data), before);
  for (const changes of [{ offerId: 'other' }, { currency: 'USD' }, { basis: 'group' }, { source: { ...offer().source, id: 'other' } }, { source: { ...offer().source, kind: 'provider' } }, { history: [{ observedAt: 'bad', totalPriceMinor: 1 }] }, { history: [{ observedAt: offer().observedAt, totalPriceMinor: -1 }] }]) assert.throws(() => validateHistoryPayload(history(changes), offer()), TypeError);
});

test('offer rendering escapes all supplied prose and preserves safe link attributes', () => {
  const malicious = '<img src=x onerror="alert(1)"> & \'text\'';
  const html = renderOfferCard(offer({ title: malicious, origin: '<東京>', destination: 'A & B', inclusions: malicious, source: { ...offer().source, name: malicious } }), 'en', now);
  assert.doesNotMatch(html, /<img|<script/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /&lt;東京&gt;/);
  assert.match(html, /rel="noopener noreferrer" referrerpolicy="no-referrer"/);
  assert.match(html, /a=1&amp;b=2/);
  assert.match(html, /€123\.45/);
  assert.match(html, /Complete price \/ person/);
  assert.match(html, /UTC/);
  assert.match(renderOfferCard(offer({ currency: 'JPY', totalPriceMinor: 12345 }), 'en', now), /12,345/);
});

test('history rendering provides semantic newest-first table, empty state and escaped source', () => {
  const html = renderOfferHistory(history({ source: { ...offer().source, name: '<script>source</script>' } }), 'en');
  assert.match(html, /<table><caption>&lt;script&gt;source&lt;\/script&gt;/);
  assert.match(html, /scope="col"/);
  assert.ok(html.indexOf('2026-10-20T11') < html.indexOf('2026-10-19T11'));
  assert.match(renderOfferHistory(history({ history: [] }), 'hu'), /még nincs/);
});

test('static bilingual pages are honest without configuration and include optional global city inputs', () => {
  for (const lang of ['hu', 'en']) {
    const html = offersPage(lang);
    assert.equal((html.match(/data-city-input/g) || []).length, 2);
    assert.equal((html.match(/autocomplete="off"/g) || []).length, 2);
    assert.match(html, /data-offers-submit disabled/);
    assert.match(html, new RegExp(`/${lang}/planner/`));
    assert.match(html, new RegExp(`/${lang}/blog/`));
    assert.doesNotMatch(html, /data-offer-id=|<script|<iframe/);
    assert.match(html, /aria-live="polite"/);
  }
  assert.match(offersPage('en'), /not configured/);
  assert.match(offersPage('hu'), /nincs beállítva/);
  assert.match(offersPage('hu'), /id="offers-origin"[^>]*value="Budapest"/);
  assert.match(offersPage('en'), /id="offers-origin"[^>]*value=""/);
  assert.equal(initOffers('en'), false);
});

const tick = () => new Promise(resolve => setImmediate(resolve));
function browserHarness() {
  const saved = new Map(['document', 'fetch', 'setTimeout', 'clearTimeout', 'performance'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const nodes = new Map();
  const timers = new Map();
  let timerId = 0;
  let monotonic = 100;
  const calls = [];
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { dataset: {}, handlers: {}, attributes: {}, innerHTML: '', textContent: '', hidden: false, disabled: false,
      addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); }, setAttribute(key, value) { this.attributes[key] = value; },
      contains: () => true, remove() { this.removed = true; },
      trigger(type, event = {}) { for (const fn of this.handlers[type] || []) fn(event); },
    });
    return nodes.get(selector);
  };
  node('[data-offers-form]').elements = { origin: { value: '東京' }, destination: { value: 'Barcelona' }, currency: { value: 'EUR' } };
  const root = { dataset: {}, isConnected: true, querySelector: node };
  const doc = node('document');
  doc.getElementById = () => root;
  doc.visibilityState = 'visible';
  doc.removeEventListener = (type, fn) => { doc.handlers[type] = (doc.handlers[type] || []).filter(item => item !== fn); };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => monotonic } });
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: (url, options) => new Promise((resolve, reject) => calls.push({ url, options, resolve, reject })) });
  Object.defineProperty(globalThis, 'setTimeout', { configurable: true, value: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; } });
  Object.defineProperty(globalThis, 'clearTimeout', { configurable: true, value: id => timers.delete(id) });
  const submit = () => node('[data-offers-form]').trigger('submit', { preventDefault() {} });
  const reply = (index, payload, ok = true) => calls[index].resolve({ ok, json: async () => payload });
  const restore = () => { for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } };
  return { node, root, doc, calls, timers, submit, reply, restore, advance: duration => { monotonic += duration; } };
}

test('configured initialization makes no request; explicit search omits credentials and handles empty separately from errors', async () => {
  const h = browserHarness();
  try {
    const cleanup = initOffers('en', { apiBase: 'https://api.example' });
    assert.equal(h.calls.length, 0);
    assert.match(h.node('[data-offers-results]').innerHTML, /has not started/);
    h.submit();
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].options.credentials, 'omit');
    assert.equal(h.calls[0].options.referrerPolicy, 'no-referrer');
    assert.equal(h.calls[0].options.cache, 'no-store');
    assert.deepEqual(h.calls[0].options.headers, { Accept: 'application/json' });
    h.reply(0, response([])); await tick();
    assert.match(h.node('[data-offers-results]').innerHTML, /No offers are available/);
    h.submit(); h.reply(1, {}, false); await tick();
    assert.match(h.node('[data-offers-results]').innerHTML, /connection or data error/);
    h.submit(); h.reply(2, { offers: [] }); await tick();
    assert.match(h.node('[data-offers-results]').innerHTML, /connection or data error/);
    cleanup();
  } finally { h.restore(); }
});

test('a newer search aborts and supersedes older responses, even if a server ignores abort', async () => {
  const h = browserHarness();
  try {
    const cleanup = initOffers('en', { apiBase: 'https://api.example' });
    h.submit(); h.submit();
    assert.equal(h.calls[0].options.signal.aborted, true);
    h.reply(1, response([])); await tick();
    const final = h.node('[data-offers-results]').innerHTML;
    h.reply(0, {}); await tick();
    assert.equal(h.node('[data-offers-results]').innerHTML, final);
    cleanup();
  } finally { h.restore(); }
});

test('unconfigured initialization never fetches or enables searching', () => {
  const h = browserHarness();
  try { assert.equal(initOffers('hu'), false); h.submit(); assert.equal(h.calls.length, 0); }
  finally { h.restore(); }
});

test('expiry removes visible cards and prevents navigation even before a delayed timer executes', async () => {
  const h = browserHarness();
  const originalNow = Date.now;
  Date.now = () => now - 86_400_000;
  try {
    const cleanup = initOffers('en', { apiBase: 'https://api.example' });
    h.submit(); h.reply(0, response()); await tick();
    assert.match(h.node('[data-offers-results]').innerHTML, /data-offer-id="route_1"/);
    assert.equal(h.timers.size, 1);
    h.advance(Date.parse(offer().expiresAt) - now);
    const card = h.node('[data-offer-id="route_1"]'); card.dataset.offerId = 'route_1';
    let prevented = false;
    h.node('[data-offers-results]').trigger('click', { target: { closest: selector => selector === '[data-offer-id]' ? card : null }, preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(card.removed, true);
    assert.match(h.node('[data-offers-results]').innerHTML, /No offers are available/);
    cleanup();
  } finally { Date.now = originalNow; h.restore(); }
});

test('server clock includes request duration and elapsed monotonic time without consulting a wrong wall clock', () => {
  const originalNow = Date.now;
  Date.now = () => { throw new Error('Visitor wall clock must not be read.'); };
  try {
    let monotonic = 1500;
    const clock = createOfferClock(response().asOf, { requestStarted: 100, receivedAt: 1100, monotonicNow: () => monotonic });
    assert.equal(clock(), now + 1400);
    monotonic += 60_000;
    assert.equal(clock(), now + 61_400);
    monotonic -= 1000;
    assert.equal(clock(), now + 61_400, 'defensively never rewind');
    const newerFloor = createOfferClock('2026-10-19T12:00:00.000Z', { requestStarted: 10, receivedAt: 20, monotonicNow: () => 20, minimumTime: clock() });
    assert.equal(newerFloor(), clock());
    assert.throws(() => createOfferClock('invalid', { requestStarted: 0, receivedAt: 1 }));
    assert.throws(() => createOfferClock(response().asOf, { requestStarted: 2, receivedAt: 1 }));
  } finally { Date.now = originalNow; }
});

test('stale response records and records expiring during request transit are never rendered', async () => {
  const h = browserHarness();
  const originalNow = Date.now;
  Date.now = () => now - 86_400_000;
  try {
    const cleanup = initOffers('en', { apiBase: 'https://api.example' });
    h.submit();
    h.reply(0, response([offer({ expiresAt: '2026-10-20T11:59:59.000Z' })])); await tick();
    assert.doesNotMatch(h.node('[data-offers-results]').innerHTML, /data-offer-id/);
    h.submit(); h.advance(1500);
    h.reply(1, response([offer({ expiresAt: '2026-10-20T12:00:01.000Z' })])); await tick();
    assert.doesNotMatch(h.node('[data-offers-results]').innerHTML, /data-offer-id/);
    assert.match(h.node('[data-offers-results]').innerHTML, /No offers are available/);
    cleanup();
  } finally { Date.now = originalNow; h.restore(); }
});

test('timer and visibility resume remove expired links despite a visitor clock one day behind', async () => {
  for (const trigger of ['timer', 'visibility']) {
    const h = browserHarness();
    const originalNow = Date.now;
    Date.now = () => now - 86_400_000;
    try {
      const cleanup = initOffers('en', { apiBase: 'https://api.example' });
      h.submit(); h.reply(0, response()); await tick();
      assert.match(h.node('[data-offers-results]').innerHTML, /data-offer-id/);
      h.advance(3_600_000);
      if (trigger === 'timer') [...h.timers.values()][0].fn();
      else h.doc.trigger('visibilitychange');
      assert.equal(h.node('[data-offer-id="route_1"]').removed, true);
      assert.match(h.node('[data-offers-results]').innerHTML, /No offers are available/);
      cleanup();
      assert.equal(h.doc.handlers.visibilitychange.length, 0);
    } finally { Date.now = originalNow; h.restore(); }
  }
});

test('history observations after the response timestamp are rejected', () => {
  assert.throws(() => validateHistoryPayload(history({ history: [{ observedAt: '2026-10-20T12:00:01.000Z', totalPriceMinor: 100 }] }), offer()), TypeError);
});

test('price history requests occur only on click and are discarded after a new search', async () => {
  const h = browserHarness();
  const originalNow = Date.now;
  Date.now = () => now;
  try {
    const cleanup = initOffers('en', { apiBase: 'https://api.example' });
    h.submit(); h.reply(0, response()); await tick();
    assert.equal(h.calls.length, 1);
    const button = h.node('history-button'); button.dataset.offerHistory = 'route_1';
    h.node('[data-offers-results]').trigger('click', { target: { closest: selector => selector === '[data-offer-history]' ? button : null } });
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[1].url, 'https://api.example/v1/offers/route_1/history');
    assert.equal(h.calls[1].options.credentials, 'omit');
    h.submit();
    assert.equal(h.calls[1].options.signal.aborted, true);
    h.reply(1, history()); await tick();
    assert.equal(h.node('[data-offer-history-result="route_1"]').innerHTML, '');
    h.reply(2, response([])); await tick();
    cleanup();
  } finally { Date.now = originalNow; h.restore(); }
});
