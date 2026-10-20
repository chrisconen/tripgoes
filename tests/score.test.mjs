import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeOffer, SCORE_RULES} from '../src/score.mjs';

const now = '2026-10-20T12:00:00Z';
const metadata = {
  currency: 'EUR', route: 'BUD-BCN', departureDate: '2026-11-01',
  nights: 3, travelers: 2, inclusions: ['return-flight', 'cabin-bag'],
};
const dates = ['2026-10-06', '2026-10-08', '2026-10-10', '2026-10-12', '2026-10-20'];
const make = () => ({
  ...metadata, price: 80, fees: {baggage: 0, transfer: 10, accommodation: 0, other: 0},
  evidence: 'user-entered',
  history: dates.map((date, i) => ({...metadata, date, price: [100, 110, 120, 130, 140][i]})),
});
const run = input => analyzeOffer(input, {now});

test('score routes accept international city names and scripts without an airport whitelist',()=>{
 for(const route of ['東京 → 서울','São Paulo → Cape Town','دبي → München']){
  const input=make();input.route=route;input.history.forEach(row=>row.route=route);
  assert.equal(run(input).status,'analyzed');
 }
});

test('known all-in comparison gives transparent arithmetic, separate bounded confidence', () => {
  const result = run(make());
  assert.equal(result.status, 'analyzed');
  assert.equal(result.totalCost, 90);
  assert.equal(result.groupCost, 180);
  assert.equal(result.median, 120);
  assert.equal(result.savingsPct, 25);
  assert.equal(result.savingsAmount, 30);
  assert.equal(result.score, 88);
  assert.equal(result.sampleCount, 5);
  assert.equal(result.confidence.kind, 'evidence-coverage');
  assert.ok(result.confidence.score <= 60);
  assert.equal(result.qualityScore, 100);
  assert.equal(result.components[0].weight, 1);
});

test('reproducible, immutable and invariant to history ordering', () => {
  const input = make();
  const before = JSON.stringify(input);
  assert.deepEqual(run(input), run(input));
  assert.deepEqual(run({...input, history: [...input.history].reverse()}), run(input));
  assert.equal(JSON.stringify(input), before);
});

test('never produces a price-value assessment without enough evidence', () => {
  for (const history of [[], make().history.slice(0, 4), undefined]) {
    const result = run({...make(), history});
    assert.equal(result.status, 'insufficient-evidence');
    assert.equal(result.score, null);
    assert.equal(result.median, null);
    assert.equal(result.savingsPct, null);
  }
});

test('rejects malformed and excessively large amounts instead of coercing them', () => {
  for (const price of ['', ' ', '1e2', '12 EUR', '1,200', '1,20', '-1', '0x10',
    Infinity, NaN, null, true, {}, [], '9'.repeat(10000), 1e10, 0, -1, 1.001]) {
    assert.equal(run({...make(), price}).status, 'invalid', String(price));
  }
  assert.equal(run({...make(), price: '80.25'}).totalCost, 90.25);
});

test('requires all fee categories explicitly, flags unknown fees and oversized totals', () => {
  for (const fees of [{}, {baggage: 0}, {...make().fees, other: ''}, {...make().fees, surprise: 10}]) {
    assert.equal(run({...make(), fees}).status, 'invalid');
  }
  assert.ok(run({...make(), price: SCORE_RULES.maximumAmount}).errors.includes('total-too-large'));
});

test('exact route, currency, dates, duration, party and inclusions are required', () => {
  for (const change of [
    {currency: 'HUF'}, {route: 'VIE-BCN'}, {departureDate: '2026-11-02'},
    {nights: 4}, {travelers: 1}, {inclusions: ['return-flight']},
  ]) {
    const input = make();
    input.history[0] = {...input.history[0], ...change};
    const result = run(input);
    assert.equal(result.score, null);
    assert.equal(result.excludedCount, 1);
    assert.ok(result.flags.includes('non-comparable-history'));
  }
});

test('normalizes harmless display differences without mutating inputs', () => {
  const input = make();
  input.history[0] = {...input.history[0], currency: 'eur', route: 'bud–bcn',
    inclusions: ['CABIN-BAG', 'return-flight', 'return-flight']};
  assert.equal(run(input).sampleCount, 5);
});

test('rejects future, impossible and stale dates; coverage cannot be gamed with same-day rows', () => {
  for (const date of ['2026-10-21', '2026-02-30', '2026-07-01', 'not-a-date']) {
    const input = make();
    input.history[0] = {...input.history[0], date};
    assert.equal(run(input).score, null);
  }
  const stale = make();
  stale.history = dates.map((_, i) => ({...metadata, date: `2026-09-${String(10 + i * 2).padStart(2, '0')}`, price: 100}));
  assert.ok(run(stale).flags.includes('stale-history'));
  assert.equal(run(stale).score, null);
  const clustered = make();
  clustered.history = dates.map((_, i) => ({...metadata, date: `2026-10-${16 + i}`, price: 100}));
  assert.ok(run(clustered).flags.includes('insufficient-date-coverage'));
  assert.equal(run(clustered).score, null);
});

test('deduplicates exact observations and gives each calendar day one median vote', () => {
  const input = make();
  input.history.push(...Array.from({length: 20}, () => ({...input.history[0]})));
  assert.equal(run(input).sampleCount, 5);
  assert.equal(run(input).excludedCount, 20);
  assert.equal(run(input).median, 120);
  const daily = make();
  daily.history.push({...daily.history[0], price: 1000});
  assert.equal(run(daily).sampleCount, 5);
  assert.equal(run(daily).observations[0].price, 550);
  assert.ok(run(daily).flags.includes('same-day-history-aggregated'));
});

test('sample evidence is explicit and cannot contaminate manual comparisons', () => {
  const mixed = make();
  mixed.history[0].evidence = 'sample';
  assert.equal(run(mixed).score, null);
  assert.ok(run(mixed).flags.includes('mixed-evidence-excluded'));
  const sample = make();
  sample.evidence = 'sample';
  sample.history = sample.history.map(item => ({...item, evidence: 'sample'}));
  const result = run(sample);
  assert.equal(result.evidence, 'sample');
  assert.equal(result.status, 'analyzed');
  assert.ok(result.confidence.score <= 20);
});

test('a caller cannot self-certify a verified source', () => {
  const input = make();
  input.evidence = 'verified';
  input.history = input.history.map(item => ({...item, evidence: 'verified'}));
  const result = run(input);
  assert.equal(result.evidence, 'user-entered');
  assert.ok(result.flags.includes('verification-unavailable'));
  assert.ok(result.confidence.score <= 60);
});

test('score saturates safely and returns signed savings above median', () => {
  assert.equal(run({...make(), price: 1}).score, 100);
  const expensive = run({...make(), price: 1000});
  assert.equal(expensive.score, 0);
  assert.ok(expensive.savingsPct < 0);
  for (let price = 1; price < 500; price += 7) {
    const result = run({...make(), price});
    for (const value of [result.score, result.qualityScore, result.confidence.score]) {
      assert.ok(Number.isFinite(value) && value >= 0 && value <= 100);
    }
  }
});

test('invalid structure, history bounds, calendar and comparison fields fail closed', () => {
  for (const input of [null, [], false, {}, {...make(), history: {}},
    {...make(), history: Array(1001).fill(null)}, {...make(), route: 'a'.repeat(121)},
    {...make(), inclusions: []}, {...make(), travelers: false}, {...make(), nights: -1},
    {...make(), departureDate: '2026-10-01'}, {...make(), departureDate: '2026-02-30'},
    {...make(), evidence: 'official'}]) {
    assert.equal(run(input).status, 'invalid');
  }
  assert.equal(analyzeOffer(make(), {now: '2026-02-30'}).status, 'invalid');
  assert.equal(analyzeOffer(make(), {now: 'invalid'}).status, 'invalid');
});

test('malformed rows are excluded without throwing and input zero fees remain valid', () => {
  const input = make();
  input.history.push(null, false, {}, {...input.history[0], price: '100abc'});
  const result = run(input);
  assert.equal(result.excludedCount, 4);
  assert.equal(result.status, 'analyzed');
  assert.ok(result.qualityScore < 100);
});

test('history carrying fees is rejected as ambiguous instead of treating a base price as all-in', () => {
  const input = make();
  input.history[0].fees = {...input.fees};
  const result = run(input);
  assert.equal(result.score, null);
  assert.equal(result.excludedCount, 1);
  assert.ok(result.flags.includes('invalid-history-records'));
});

test('fractional-cent daily medians remain in cents until final formatting', () => {
  const input = {...make(), price: 1.01, fees: {baggage: 0, transfer: 0, accommodation: 0, other: 0}};
  input.history = dates.flatMap(date => [1.01, 1.02].map(price => ({...metadata, date, price})));
  const result = run(input);
  assert.equal(result.median, 1.02);
  assert.equal(result.savingsPct, 0.49);
  assert.equal(result.savingsAmount, 0.01);
  assert.equal(result.score, 51);
});
