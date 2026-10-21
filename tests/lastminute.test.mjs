import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSqlite } from '../backend/sqlite.mjs';
import { lastMinuteBoard, lastMinuteDates, reserveFlightFetch, LAST_MINUTE_DAYS, LAST_MINUTE_TTL, LAST_MINUTE_LIMIT, FLIGHT_MINUTE_LIMIT } from '../backend/repository.mjs';
import { parseLastMinuteQuery } from '../backend/aviasales.mjs';
import { handleRequest } from '../backend/worker.mjs';
import { buildLastMinuteUrl, validateLastMinutePayload, renderLastMinute, lastMinutePage, lastMinuteCurrency, LAST_MINUTE_ORIGIN } from '../src/lastminute.mjs';

const now = Date.parse('2026-10-21T12:00:00.000Z');
const dates = lastMinuteDates(now);
const query = { origin: 'BUD', currency: 'EUR' };

function setup() {
  const DB = createSqlite(':memory:');
  for (const file of ['0001_initial.sql', '0002_flight_cache.sql']) DB.exec(readFileSync(new URL('../backend/migrations/' + file, import.meta.url), 'utf8'));
  return { DB, AVIASALES_API_TOKEN: 'test-only-aviasales-token-12345678', AVIASALES_MARKER: '123456', SOURCES_JSON: '[]', ALLOWED_ORIGINS: 'https://tripgoes.com' };
}
const hex = seed => Buffer.from(seed).toString('hex').slice(0, 64).padStart(64, '0');
const fare = (destination, priceMinor, departureDate, extra = {}) => ({ id: hex(`${destination}${priceMinor}${departureDate.replaceAll('-', '')}`), origin: 'BUD', destination, originAirport: 'BUD', destinationAirport: destination, departureAt: `${departureDate}T06:40:00+02:00`, returnAt: null, priceMinor, currency: 'EUR', airline: 'XX', flightNumber: '123', transfers: 0, returnTransfers: null, durationMinutes: 150, bookingUrl: `https://www.aviasales.com/search/BUD${departureDate.slice(8, 10)}${departureDate.slice(5, 7)}${destination}1?marker=123456`, ...extra });
// One fare per destination per day; later days are cheaper, so the board must
// prefer the cheapest day rather than the first one retrieved.
const provider = ({ departureDate }, env, options) => ({
  asOf: new Date(options.now).toISOString(), fetchedAt: new Date(options.now).toISOString(), cacheUntil: new Date(options.now + 600000).toISOString(),
  source: { id: 'cached-fares', name: 'Cached partner fares', kind: 'cached_search', maxProviderAgeHours: 48 },
  query: { origin: 'BUD', destination: null, departureDate, returnDate: null, currency: 'EUR', direct: false, oneWay: true },
  flights: [fare('LIS', 40000 - dates.indexOf(departureDate) * 1000, departureDate), fare('GDN', 12000 + dates.indexOf(departureDate) * 100, departureDate)], hasMore: false,
});

test('the board covers the next seven departure days, starting tomorrow', () => {
  assert.equal(dates.length, LAST_MINUTE_DAYS);
  assert.equal(dates[0], '2026-10-22');
  assert.equal(dates[LAST_MINUTE_DAYS - 1], '2026-10-28');
  assert.deepEqual(lastMinuteDates(Date.parse('2026-10-21T23:59:59.999Z'))[0], '2026-10-22');
  assert.deepEqual(lastMinuteDates(Date.parse('2026-10-22T00:00:00.000Z'))[0], '2026-10-23');
});

test('one fan-out serves six hours of page views and keeps the retrieval time', async () => {
  const env = setup(); let calls = 0;
  const fetchPrices = (...args) => { calls++; return provider(...args); };
  const first = await lastMinuteBoard(env, query, now, { fetchPrices });
  assert.equal(calls, LAST_MINUTE_DAYS);
  assert.equal(first.cacheUntil, new Date(now + LAST_MINUTE_TTL).toISOString());
  const second = await lastMinuteBoard(env, query, now + 5 * 3600000, { fetchPrices });
  assert.equal(calls, LAST_MINUTE_DAYS);
  assert.equal(second.fetchedAt, first.fetchedAt);
  assert.notEqual(second.asOf, first.asOf);
  await lastMinuteBoard(env, query, now + LAST_MINUTE_TTL + 1, { fetchPrices });
  assert.equal(calls, 2 * LAST_MINUTE_DAYS);
  // A public board must not become offer history.
  assert.equal((await env.DB.prepare('SELECT count(*) n FROM observations').first()).n, 0);
  env.DB.close();
});

test('each covered day appears once, at that day’s cheapest fare, price ascending', async () => {
  const env = setup();
  const board = await lastMinuteBoard(env, query, now, { fetchPrices: provider });
  assert.equal(board.deals.length, LAST_MINUTE_DAYS);
  assert.deepEqual(board.deals.map(deal => deal.departureAt.slice(0, 10)), dates);
  // GDN is the cheaper fare on every fixture day, so no LIS fare survives.
  assert.ok(board.deals.every(deal => deal.destination === 'GDN'));
  assert.deepEqual(board.deals.map(deal => deal.priceMinor), dates.map((_, index) => 12000 + index * 100));
  assert.equal(board.completedDays, LAST_MINUTE_DAYS);
  assert.equal(board.requestedDays, LAST_MINUTE_DAYS);
  env.DB.close();
});

test('the result is capped and the cache separates currency, origin and marker', async () => {
  const env = setup(); let calls = 0;
  const many = (input, environment, options) => {
    calls++;
    const base = provider(input, environment, options);
    return { ...base, flights: Array.from({ length: 30 }, (_, index) => fare(`A${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + index % 26)}`, 10000 + index, input.departureDate)) };
  };
  const board = await lastMinuteBoard(env, query, now, { fetchPrices: many });
  assert.equal(board.deals.length, LAST_MINUTE_DAYS);
  assert.ok(board.deals.length <= LAST_MINUTE_LIMIT);
  assert.ok(board.deals.every(deal => deal.priceMinor === 10000));
  await lastMinuteBoard(env, { origin: 'BUD', currency: 'HUF' }, now, { fetchPrices: many });
  await lastMinuteBoard(env, { origin: 'DEB', currency: 'EUR' }, now, { fetchPrices: many });
  env.AVIASALES_MARKER = '654321';
  await lastMinuteBoard(env, query, now, { fetchPrices: many });
  assert.equal(calls, 4 * LAST_MINUTE_DAYS);
  const rows = await env.DB.prepare('SELECT * FROM flight_cache').all();
  assert.ok(!JSON.stringify(rows).includes(env.AVIASALES_API_TOKEN));
  env.DB.close();
});

test('a failing day is reported instead of silently shrinking the board', async () => {
  const env = setup();
  const flaky = (input, environment, options) => {
    if (input.departureDate === dates[2]) throw Error('fixture failure');
    return provider(input, environment, options);
  };
  const board = await lastMinuteBoard(env, query, now, { fetchPrices: flaky });
  assert.equal(board.completedDays, LAST_MINUTE_DAYS - 1);
  assert.equal(board.requestedDays, LAST_MINUTE_DAYS);
  assert.ok(board.deals.length > 0);
  env.DB.close();
});

test('a total provider failure surfaces, and an exhausted budget is not cached', async () => {
  const env = setup();
  await assert.rejects(lastMinuteBoard(env, query, now, { fetchPrices: () => { throw Error('fixture failure'); } }), error => error.status === 502);
  assert.equal((await env.DB.prepare('SELECT count(*) n FROM flight_cache').first()).n, 0);
  for (let i = 0; i < FLIGHT_MINUTE_LIMIT; i++) await reserveFlightFetch(env.DB, now + 60000);
  await assert.rejects(lastMinuteBoard(env, query, now + 60000, { fetchPrices: provider }), error => error.code === 'flight_provider_budget_exhausted');
  env.DB.close();
});

test('missing credentials fail before spending provider budget', async () => {
  const env = setup(); delete env.AVIASALES_API_TOKEN;
  await assert.rejects(lastMinuteBoard(env, query, now, { fetchPrices: provider }), error => error.code === 'flight_provider_not_configured');
  assert.equal((await env.DB.prepare('SELECT count(*) n FROM flight_provider_budget').first()).n, 0);
  env.DB.close();
});

test('the public route accepts only an origin and a known currency', async () => {
  assert.deepEqual(parseLastMinuteQuery(new URLSearchParams('origin=BUD&currency=EUR')), query);
  for (const search of ['origin=bud&currency=EUR', 'origin=BUDA&currency=EUR', 'origin=BUD&currency=XXX', 'origin=BUD', 'currency=EUR', 'origin=BUD&origin=DEB&currency=EUR', 'origin=BUD&currency=EUR&token=leak']) {
    assert.throws(() => parseLastMinuteQuery(new URLSearchParams(search)), error => error.status === 400, search);
  }
  const env = setup();
  const request = (path, options) => handleRequest(new Request('https://api.example.com' + path, options), env, now);
  assert.equal((await request('/v1/lastminute?origin=BUD&currency=XXX')).status, 400);
  assert.equal((await request('/v1/lastminute?origin=BUD&currency=EUR', { method: 'POST' })).status, 405);
  assert.equal((await request('/v1/lastminute?origin=BUD&currency=EUR', { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await request('/v1/lastminute', { method: 'OPTIONS', headers: { Origin: 'https://tripgoes.com' } })).status, 204);
  env.DB.close();
});

const payload = (changes = {}) => ({
  asOf: '2026-10-21T12:00:00.000Z', fetchedAt: '2026-10-21T12:00:00.000Z', cacheUntil: '2026-10-21T18:00:00.000Z',
  source: { id: 'cached-fares', name: 'Cached partner fares', kind: 'cached_search', maxProviderAgeHours: 48 },
  query: { origin: 'BUD', currency: 'EUR' }, dates, deals: [fare('GDN', 12000, dates[0]), fare('LIS', 34000, dates[3])],
  completedDays: LAST_MINUTE_DAYS, requestedDays: LAST_MINUTE_DAYS, ...changes,
});

test('the frontend accepts a well-formed board and rejects every malformed one', () => {
  const valid = validateLastMinutePayload(payload(), query);
  // Retired identifier, still accepted while previously served modules expire.
  assert.equal(validateLastMinutePayload(payload({ source: { id: 'aviasales-data', name: 'Aviasales Data API', kind: 'cached_search', maxProviderAgeHours: 48 } }), query).source.id, 'cached-fares');
  assert.equal(valid.deals.length, 2);
  assert.equal(valid.deals[0].destination, 'GDN');
  assert.throws(() => validateLastMinutePayload(payload(), { origin: 'DEB', currency: 'EUR' }));
  const rejected = [
    payload({ source: { id: 'aviasales-data', name: 'Other feed', kind: 'cached_search', maxProviderAgeHours: 48 } }),
    payload({ cacheUntil: '2026-10-22T12:00:00.000Z' }),
    payload({ fetchedAt: '2026-10-21T12:00:01.000Z' }),
    payload({ dates: [...dates].reverse() }),
    payload({ completedDays: 0 }),
    payload({ completedDays: LAST_MINUTE_DAYS + 1 }),
    payload({ requestedDays: LAST_MINUTE_DAYS + 1 }),
    payload({ deals: [fare('GDN', 12000, dates[0]), fare('LIS', 13000, dates[0])] }),
    payload({ deals: [fare('LIS', 34000, dates[0]), fare('GDN', 12000, dates[0])] }),
    payload({ deals: [fare('GDN', 12000, '2026-11-30')] }),
    payload({ deals: [fare('GDN', 12000, dates[0], { returnAt: '2026-10-29T10:00:00Z' })] }),
    payload({ deals: [fare('GDN', 12000, dates[0], { origin: 'VIE', originAirport: 'VIE' })] }),
    payload({ deals: [fare('GDN', 12000, dates[0], { currency: 'HUF' })] }),
    payload({ deals: [fare('GDN', 12000, dates[0], { priceMinor: -1 })] }),
    payload({ deals: [fare('GDN', 12000, dates[0], { bookingUrl: 'https://evil.example/search/BUD2210GDN1?marker=123456' })] }),
    payload({ deals: [fare('GDN', 12000, dates[0], { id: 'short' })] }),
  ];
  for (const [index, broken] of rejected.entries()) assert.throws(() => validateLastMinutePayload(broken), TypeError, `case ${index}`);
});

test('validation output survives its own revalidation, as rendering requires', () => {
  const once = validateLastMinutePayload(payload(), query);
  const twice = validateLastMinutePayload(once, query);
  assert.deepEqual(twice, once);
  assert.ok(once.deals.every(deal => deal.returnAt === null));
  // renderLastMinute revalidates, so it must accept an already validated board.
  assert.ok(renderLastMinute(once, 'hu').includes('flights-card'));
  assert.ok(renderLastMinute(validateLastMinutePayload(payload({ deals: [] })), 'en').includes('flights-state'));
});

test('the board URL is built only from a safe public endpoint', () => {
  assert.equal(buildLastMinuteUrl('https://api.example.com', query), 'https://api.example.com/v1/lastminute?origin=BUD&currency=EUR');
  assert.equal(buildLastMinuteUrl('https://api.example.com/base/', query), 'https://api.example.com/base/v1/lastminute?origin=BUD&currency=EUR');
  for (const base of ['', 'http://api.example.com', 'https://user:pass@api.example.com', 'https://api.example.com?a=1', 'https://api.example.com#x']) {
    assert.throws(() => buildLastMinuteUrl(base, query), TypeError, base);
  }
  assert.throws(() => buildLastMinuteUrl('https://api.example.com', { origin: 'BUD', currency: 'XXX' }));
});

test('rendering escapes provider text and states partial coverage', () => {
  const html = renderLastMinute(payload({ completedDays: LAST_MINUTE_DAYS - 2 }), 'hu');
  assert.ok(html.includes('BUD'));
  assert.ok(html.includes('rel="sponsored noopener noreferrer"'));
  assert.ok(html.includes('2 nap adatai hiányoznak'));
  assert.ok(!html.includes('<script'));
  const injected = renderLastMinute(payload({ deals: [fare('GDN', 12000, dates[0], { airline: '<img src=x onerror=alert(1)>' })] }), 'en');
  assert.ok(injected.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!injected.includes('<img src=x'));
  assert.ok(renderLastMinute(payload({ deals: [] }), 'hu').includes('flights-state'));
});

test('both pages declare the same fixed origin and a language currency', () => {
  assert.equal(LAST_MINUTE_ORIGIN, 'BUD');
  assert.equal(lastMinuteCurrency('hu'), 'HUF');
  assert.equal(lastMinuteCurrency('en'), 'EUR');
  const hu = lastMinutePage('hu'), en = lastMinutePage('en');
  assert.ok(hu.includes('data-lastminute-origin="BUD"') && hu.includes('data-lastminute-currency="HUF"'));
  assert.ok(en.includes('data-lastminute-currency="EUR"'));
  assert.ok(hu.includes('data-lastminute-lang="hu"') && en.includes('data-lastminute-lang="en"'));
  // The page never ships a fare before the API answers.
  for (const page of [hu, en]) assert.ok(!page.includes('aviasales.com/search/'));
});
