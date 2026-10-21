import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { flightPage, initFlights, flightDateBounds, validateFlightQuery, buildFlightsUrl, validateFlightStatus, safeFlightBookingUrl, validateFlightsPayload, renderFlights } from '../src/flights.mjs';
import { FLIGHT_CITY_SOURCE, validateFlightCities, findFlightCities, flightCityLabel, flightCityCode, flightCityField } from '../src/flight-cities.mjs';

const now = Date.parse('2026-10-21T12:00:00.000Z');
const query = (changes = {}) => ({ origin: 'BUD', destination: 'LON', departureDate: '2026-12-01', returnDate: '2026-12-05', currency: 'EUR', direct: false, oneWay: false, ...changes });
const flight = (changes = {}) => ({ id: 'a'.repeat(64), origin: 'BUD', destination: 'LON', originAirport: 'BUD', destinationAirport: 'LHR', departureAt: '2026-12-01T10:30:00+01:00', returnAt: '2026-12-05T19:30:00Z', priceMinor: 12345, currency: 'EUR', airline: 'XX', flightNumber: '123', transfers: 0, returnTransfers: 0, durationMinutes: 300, bookingUrl: 'https://www.aviasales.com/search/BUD0112LON05121?marker=12345', ...changes });
const response = (changes = {}) => ({ asOf: '2026-10-21T12:00:00.000Z', fetchedAt: '2026-10-21T11:59:00.000Z', cacheUntil: '2026-10-21T12:09:00.000Z', source: { id: 'cached-fares', name: 'Cached partner fares', kind: 'cached_search', maxProviderAgeHours: 48 }, query: query(), flights: [flight()], hasMore: false, ...changes });

test('official compact city catalogue is bounded, unique and retains provenance', async () => {
  const raw = JSON.parse(await readFile(new URL('../assets/flight-cities.json', import.meta.url), 'utf8'));
  const rows = validateFlightCities(raw);
  assert.equal(raw.source, FLIGHT_CITY_SOURCE);
  assert.equal(raw.retrievedAt, '2026-10-21');
  assert.ok(rows.length > 9000);
  assert.deepEqual(rows.find(row => row[1] === 'BUD'), ['Budapest', 'BUD', 'HU']);
  assert.equal(new Set(rows.map(row => row[1])).size, rows.length);
  for (const code of ['LON', 'NYC', 'TYO', 'SYD']) assert.ok(rows.some(row => row[1] === code));
  assert.throws(() => validateFlightCities({ ...raw, source: 'https://untrusted.example' }));
  assert.throws(() => validateFlightCities({ ...raw, rows: [['Budapest', 'BUD', 'HU'], ['Other', 'BUD', 'HU']] }));
});

test('city matching is accent-insensitive while code resolution never guesses from a name', () => {
  const rows = [['Budapest', 'BUD', 'HU'], ['São Paulo', 'SAO', 'BR'], ['London', 'LON', 'GB'], ['London', 'YXU', 'CA']];
  assert.equal(findFlightCities(rows, 'sao')[0][1], 'SAO');
  assert.equal(findFlightCities(rows, 'BUD')[0][0], 'Budapest');
  assert.equal(findFlightCities(rows, 'London').length, 2);
  assert.deepEqual(findFlightCities(rows, 'x'), []);
  assert.equal(flightCityCode('Budapest'), null);
  assert.equal(flightCityCode('Random town (BUD)'), null);
  assert.equal(flightCityCode(' lhr '), 'LHR');
  assert.equal(flightCityCode('LHR', '', ''), 'LHR', 'explicit airport code need not occur in city catalogue');
  const label = flightCityLabel(rows[0]);
  assert.equal(flightCityCode(label, 'BUD', label), 'BUD');
  assert.equal(flightCityCode('Budapest edited', 'BUD', label), null);
});

test('city input provides a keyboard-combobox contract without invoking the unrelated free-text city widget', () => {
  const html = flightCityField('origin', 'hu', true);
  assert.match(html, /value="Budapest · HU \(BUD\)"/);
  assert.match(html, /role="combobox"/);
  assert.match(html, /aria-controls="flights-origin-list"/);
  assert.match(html, /role="listbox"/);
  assert.doesNotMatch(html, /data-city-input/);
});

test('date bounds use UTC calendar days and include exactly tomorrow through day 365', () => {
  assert.deepEqual(flightDateBounds(now), { min: '2026-10-22', max: '2027-10-21' });
  assert.equal(validateFlightQuery(query({ departureDate: '2026-10-22', returnDate: '2027-10-21' }), now).origin, 'BUD');
  for (const changes of [{ departureDate: '2026-10-21' }, { returnDate: '2027-10-22' }, { departureDate: '2026-02-30' }, { returnDate: '2026-11-30' }, { origin: 'Budapest' }, { destination: 'BUD' }, { currency: 'RUB' }, { direct: 'false' }, { oneWay: true }]) assert.throws(() => validateFlightQuery(query(changes), now), TypeError);
});

test('search URLs carry only normalized explicit query values and omit one-way return dates', () => {
  const input = query({ destination: null, returnDate: null, oneWay: true, direct: true });
  const url = new URL(buildFlightsUrl('https://api.example/travel/', input, now));
  assert.equal(url.pathname, '/travel/v1/flights');
  assert.equal(url.searchParams.get('origin'), 'BUD');
  assert.equal(url.searchParams.has('destination'), false);
  assert.equal(url.searchParams.has('returnDate'), false);
  assert.equal(url.searchParams.get('oneWay'), 'true');
  assert.equal(url.searchParams.get('direct'), 'true');
  assert.equal(buildFlightsUrl('https://api.example'), 'https://api.example/v1/flights/status');
  for (const base of ['', '/api', 'http://api.example', 'https://user:secret@api.example', 'https://api.example?token=secret', 'https://api.example#secret']) assert.throws(() => buildFlightsUrl(base));
});

test('status response accepts only the documented provider and boolean configuration flag', () => {
  assert.deepEqual(validateFlightStatus({ configured: false, source: 'cached-fares' }), { configured: false, source: 'cached-fares' });
  // Retired identifier, still accepted while previously served modules expire.
  assert.deepEqual(validateFlightStatus({ configured: true, source: 'aviasales-data' }), { configured: true, source: 'aviasales-data' });
  for (const input of [null, {}, { configured: 'true', source: 'cached-fares' }, { configured: true, source: 'other' }]) assert.throws(() => validateFlightStatus(input));
});

test('normalized response preserves cached-source provenance and distinguishes airport from city routes', () => {
  const data = response(); const before = JSON.stringify(data);
  const result = validateFlightsPayload(data, query());
  assert.equal(result.source.maxProviderAgeHours, 48);
  assert.notEqual(result.fetchedAt, result.cacheUntil);
  assert.equal(result.flights[0].departureAt, '2026-12-01T10:30:00+01:00');
  result.flights[0].airline = 'changed'; assert.equal(JSON.stringify(data), before);
  assert.equal(validateFlightsPayload(response({ query: query({ destination: 'LHR' }) })).flights[0].destination, 'LON');
  assert.equal(validateFlightsPayload(response({ query: query({ destination: null }) })).flights.length, 1);
  assert.equal(validateFlightsPayload(response({ flights: [] })).flights.length, 0);
});

test('nullable optional fields and one-way results remain unknown rather than invented', () => {
  const data = response({ query: query({ oneWay: true, returnDate: null }), flights: [flight({ returnAt: null, originAirport: null, destinationAirport: null, airline: null, flightNumber: null, transfers: null, returnTransfers: null, durationMinutes: null })] });
  assert.equal(validateFlightsPayload(data).flights[0].durationMinutes, null);
  const html = renderFlights(data, 'en');
  assert.match(html, /Not provided/);
  assert.doesNotMatch(html, /2026-12-05/);
});

test('response validation rejects wrong routes, dates, currencies, timings, duplicates and malformed values', () => {
  const badFlights = [{ origin: 'JFK', originAirport: 'JFK' }, { destination: 'BCN', destinationAirport: 'BCN' }, { departureAt: '2026-12-02T10:30:00Z' }, { returnAt: null }, { priceMinor: -1 }, { priceMinor: 12.5 }, { currency: 'USD' }, { id: '../x' }, { transfers: '0' }, { airline: 'x'.repeat(41) }, { departureAt: '2026-02-30T12:00:00Z' }];
  for (const change of badFlights) assert.throws(() => validateFlightsPayload(response({ flights: [flight(change)] })), TypeError, JSON.stringify(change));
  for (const data of [null, response({ source: { ...response().source, maxProviderAgeHours: 24 } }), response({ fetchedAt: '2026-10-21T12:01:00.000Z' }), response({ cacheUntil: '2026-10-21T12:11:00.000Z' }), response({ hasMore: 1 }), response({ flights: [flight(), flight()] }), response({ query: query({ direct: true }), flights: [flight({ returnTransfers: null })] })]) assert.throws(() => validateFlightsPayload(data));
  assert.throws(() => validateFlightsPayload(response(), query({ destination: 'BCN' })));
});

test('booking links permit only sponsor-marked HTTPS Aviasales search URLs without credentials or tokens', () => {
  assert.equal(safeFlightBookingUrl(flight().bookingUrl), flight().bookingUrl);
  for (const url of ['https://evil.example/search/test?marker=123', 'https://www.aviasales.com.evil.example/search/test?marker=123', 'http://www.aviasales.com/search/test?marker=123', 'https://www.aviasales.com/search/../account?marker=123', 'https://u:p@www.aviasales.com/search/test?marker=123', 'https://www.aviasales.com/search/test?marker=123&token=secret', 'https://www.aviasales.com/search/test', 'javascript:alert(1)']) assert.equal(safeFlightBookingUrl(url), null);
});

test('rendered cards escape supplied text and clearly label fare scope, source time and affiliate links', () => {
  const html = renderFlights(response({ flights: [flight({ airline: '<img src=x>', flightNumber: '" & test' })] }), 'en');
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x&gt;/);
  assert.match(html, /&quot; &amp; test/);
  assert.match(html, /€123\.45/);
  assert.match(html, /rel="sponsored noopener noreferrer"/);
  assert.match(html, /Retrieved/);
  assert.match(html, /Results valid until/);
  // The interface describes the data, never the supplier or the transport.
  assert.doesNotMatch(html, /API/);
  assert.match(html, /not when a fare was discovered/);
  assert.match(html, /do not calculate a complete trip cost/);
  assert.match(html, /2026-12-01 · 10:30 \(UTC\+01:00\)/);
});

test('static pages expose Budapest default, accessible forms and no fake flight records', () => {
  for (const lang of ['hu', 'en']) {
    const html = flightPage(lang);
    assert.match(html, /value="Budapest · HU \(BUD\)"/);
    assert.match(html, /data-flights-submit disabled/);
    assert.match(html, /name="oneWay"/);
    assert.match(html, /name="direct"/);
    assert.match(html, /48/);
    assert.doesNotMatch(html, /data-flight-booking|<script|<iframe/);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length);
    for (const [, id] of html.matchAll(/\bfor="([^"]+)"/g)) assert.ok(ids.includes(id));
  }
  assert.doesNotMatch(flightPage('en'), /not configured yet|secret API credentials/);
  assert.match(flightPage('en'), /Checking the data connection/);
  assert.match(flightPage('en'), /stored anonymously in a shared cache for ten minutes/);
  assert.match(flightPage('hu'), /tíz percig névtelen közös gyorsítótárban/);
  assert.equal(initFlights('en'), false);
});

const tick = () => new Promise(resolve => setImmediate(resolve));
function browserHarness() {
  const saved = new Map(['document', 'fetch', 'setTimeout', 'clearTimeout', 'performance'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const oldNow = Date.now; Date.now = () => now;
  let monotonic = 100, timerId = 0;
  const calls = [], nodes = new Map(), timers = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { dataset: {}, handlers: {}, attributes: {}, innerHTML: '', textContent: '', hidden: false, disabled: false, value: '', checked: false,
      addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); }, removeEventListener(type, fn) { this.handlers[type] = (this.handlers[type] || []).filter(item => item !== fn); },
      setAttribute(key, value) { this.attributes[key] = value; }, focus() { this.focused = true; },
      trigger(type, event = {}) { for (const fn of this.handlers[type] || []) fn(event); },
    });
    return nodes.get(selector);
  };
  const form = node('[data-flights-form]'); form.elements = {};
  for (const name of ['origin', 'destination', 'departureDate', 'returnDate', 'currency', 'oneWay', 'direct']) form.elements[name] = node(`field-${name}`);
  Object.assign(form.elements.origin, { value: 'Budapest · HU (BUD)', dataset: { flightCode: 'BUD', flightLabel: 'Budapest · HU (BUD)' } });
  form.elements.destination.value = 'LON'; form.elements.departureDate.value = '2026-12-01'; form.elements.returnDate.value = '2026-12-05'; form.elements.currency.value = 'EUR';
  const root = { dataset: {}, isConnected: true, querySelector: node, querySelectorAll: () => [] };
  const doc = node('document'); doc.getElementById = () => root; doc.visibilityState = 'visible';
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => monotonic } });
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: (url, options) => new Promise((resolve, reject) => calls.push({ url, options, resolve, reject })) });
  Object.defineProperty(globalThis, 'setTimeout', { configurable: true, value: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; } });
  Object.defineProperty(globalThis, 'clearTimeout', { configurable: true, value: id => timers.delete(id) });
  const submit = () => form.trigger('submit', { preventDefault() {} });
  const reply = (index, data, status = 200) => calls[index].resolve({ ok: status >= 200 && status < 300, status, json: async () => data });
  const restore = () => { Date.now = oldNow; for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } };
  return { node, root, doc, form, calls, timers, submit, reply, restore, advance: duration => { monotonic += duration; } };
}

test('initialization requests only nonsecret status; fare search requires an explicit submit', async () => {
  const h = browserHarness();
  try {
    const cleanup = initFlights('en', { apiBase: 'https://api.example' });
    assert.equal(h.calls.length, 1); assert.equal(h.calls[0].url, 'https://api.example/v1/flights/status');
    assert.match(h.node('[data-flights-results]').innerHTML, /Checking the data connection/);
    assert.doesNotMatch(h.node('[data-flights-results]').innerHTML, /not configured yet/);
    assert.equal(h.calls[0].options.credentials, 'omit'); assert.equal(h.calls[0].options.redirect, 'error');
    h.submit(); assert.equal(h.calls.length, 1);
    h.reply(0, { configured: true, source: 'aviasales-data' }); await tick();
    assert.equal(h.calls.length, 1); assert.equal(h.node('[data-flights-submit]').disabled, false);
    h.submit(); assert.equal(h.calls.length, 2);
    assert.equal(new URL(h.calls[1].url).searchParams.get('origin'), 'BUD');
    assert.deepEqual(h.calls[1].options.headers, { Accept: 'application/json' });
    h.reply(1, response()); await tick();
    assert.match(h.node('[data-flights-results]').innerHTML, /data-flight-booking/);
    cleanup();
  } finally { h.restore(); }
});

test('missing configuration, empty results, rate limits and HTTP failures remain distinct', async () => {
  const h = browserHarness();
  try {
    const cleanup = initFlights('en', { apiBase: 'https://api.example' });
    h.reply(0, { configured: false, source: 'aviasales-data' }); await tick();
    assert.match(h.node('[data-flights-results]').innerHTML, /not configured yet/);
    h.submit(); assert.equal(h.calls.length, 1);
    h.node('[data-flights-check]').trigger('click'); h.reply(1, { configured: true, source: 'aviasales-data' }); await tick();
    h.submit(); h.reply(2, response({ flights: [] })); await tick();
    assert.match(h.node('[data-flights-results]').innerHTML, /No matching cached results/);
    h.submit(); h.reply(3, { error: { code: 'flight_provider_rate_limited' } }, 503); await tick();
    assert.match(h.node('[data-flights-results]').innerHTML, /request limit has been reached/);
    h.submit(); h.reply(4, {}, 502); await tick();
    assert.match(h.node('[data-flights-results]').innerHTML, /Prices could not be retrieved/);
    cleanup();
  } finally { h.restore(); }
});

test('unselected free-text city names never trigger a flight request, and one way omits the return date', async () => {
  const h = browserHarness();
  try {
    const cleanup = initFlights('en', { apiBase: 'https://api.example' });
    h.reply(0, { configured: true, source: 'aviasales-data' }); await tick();
    h.form.elements.destination.value = 'London'; h.submit();
    assert.equal(h.calls.length, 1); assert.equal(h.form.elements.destination.focused, true);
    h.form.elements.destination.value = 'LHR'; h.form.elements.oneWay.checked = true; h.form.elements.oneWay.trigger('change');
    assert.equal(h.form.elements.returnDate.disabled, true); assert.equal(h.form.elements.returnDate.required, false);
    h.submit();
    assert.equal(new URL(h.calls[1].url).searchParams.has('returnDate'), false);
    cleanup();
  } finally { h.restore(); }
});

test('a later search aborts and supersedes older results even if the transport ignores abort', async () => {
  const h = browserHarness();
  try {
    const cleanup = initFlights('en', { apiBase: 'https://api.example' });
    h.reply(0, { configured: true, source: 'aviasales-data' }); await tick();
    h.submit(); h.submit(); assert.equal(h.calls[1].options.signal.aborted, true);
    h.reply(2, response({ flights: [] })); await tick(); const html = h.node('[data-flights-results]').innerHTML;
    h.reply(1, response()); await tick(); assert.equal(h.node('[data-flights-results]').innerHTML, html);
    h.submit(); h.node('[data-flights-check]').trigger('click'); assert.equal(h.calls[3].options.signal.aborted, true);
    h.reply(4, { configured: false, source: 'aviasales-data' }); await tick();
    h.reply(3, response()); await tick(); assert.match(h.node('[data-flights-results]').innerHTML, /not configured yet/);
    cleanup();
  } finally { h.restore(); }
});

test('cache reuse cutoff uses server time plus monotonic elapsed and never claims fare expiry', async () => {
  const h = browserHarness();
  try {
    const cleanup = initFlights('en', { apiBase: 'https://api.example' });
    h.reply(0, { configured: true, source: 'aviasales-data' }); await tick();
    h.submit(); h.reply(1, response()); await tick();
    Date.now = () => now - 86_400_000; h.advance(9 * 60_000);
    h.doc.trigger('visibilitychange');
    assert.doesNotMatch(h.node('[data-flights-results]').innerHTML, /data-flight-booking/);
    assert.match(h.node('[data-flights-results]').innerHTML, /not the expiry time of a fare/);
    cleanup(); assert.equal(h.doc.handlers.visibilitychange.length, 0);
  } finally { h.restore(); }
});

test('cache responses already past their reuse cutoff do not produce booking links', async () => {
  const h = browserHarness();
  try {
    const cleanup = initFlights('en', { apiBase: 'https://api.example' });
    h.reply(0, { configured: true, source: 'aviasales-data' }); await tick();
    h.submit(); h.reply(1, response({ asOf: '2026-10-21T12:10:00.000Z' })); await tick();
    assert.match(h.node('[data-flights-results]').innerHTML, /reuse window has ended/);
    assert.doesNotMatch(h.node('[data-flights-results]').innerHTML, /data-flight-booking/);
    cleanup();
  } finally { h.restore(); }
});

test('without API configuration there is no status or flight request', () => {
  const h = browserHarness();
  try { const cleanup = initFlights('hu'); h.submit(); assert.equal(h.calls.length, 0); assert.match(h.node('[data-flights-results]').innerHTML, /még nincs beállítva/); cleanup(); }
  finally { h.restore(); }
});
