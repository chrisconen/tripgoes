import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePlan, comparePlans, plannerPage, initPlanner, serializePlanner,
  parseStoredPlanner, readPlannerStorage, savePlannerStorage, clearPlannerStorage,
  PLANNER_STORAGE_KEY,
} from '../src/planner.mjs';

const offer = (changes = {}) => ({
  name: 'Own trip', origin: '', destination: '', currency: 'EUR', base: '100', extras: '25', travelers: '2',
  nights: '3', hours: '40', budget: '300', source: 'manual', ...changes,
});
const time = '2026-10-20T12:30:00.000Z';

test('complete costs, percentage and budget use transparent per-person and group units', () => {
  const result = calculatePlan(offer());
  assert.equal(result.valid, true);
  assert.equal(result.complete, true);
  assert.equal(result.totalPerPersonMinor, 12500);
  assert.equal(result.groupTotalMinor, 25000);
  assert.equal(result.surchargePercent, 25);
  assert.equal(result.perHourMinor, 313);
  assert.equal(result.perNightMinor, 4167);
  assert.equal(result.budgetRemainingMinor, 5000);
});

test('decimal money additions remain exact in hundredths before multiplication', () => {
  const result = calculatePlan(offer({ base: '0.10', extras: '0.20', travelers: '3', budget: '1.00' }));
  assert.equal(result.baseMinor, 10);
  assert.equal(result.extrasMinor, 20);
  assert.equal(result.totalPerPersonMinor, 30);
  assert.equal(result.groupTotalMinor, 90);
  assert.equal(result.budgetRemainingMinor, 10);
});

test('Hungarian decimal commas and fractional usable hours calculate consistently', () => {
  const result = calculatePlan(offer({ base: '10,25', extras: '0,75', hours: '2,5', nights: '2' }));
  assert.equal(result.totalPerPersonMinor, 1100);
  assert.equal(result.hours, 2.5);
  assert.equal(result.perHourMinor, 440);
  assert.equal(result.perNightMinor, 550);
});

test('empty cost is unknown, never an implicit zero', () => {
  for (const key of ['base', 'extras']) {
    for (const blank of ['', '   ', undefined, null]) {
      const result = calculatePlan(offer({ [key]: blank }));
      assert.equal(result.valid, true);
      assert.equal(result.complete, false);
      assert.equal(result.totalPerPersonMinor, null);
      assert.equal(result.groupTotalMinor, null);
      assert.equal(result.budgetRemainingMinor, null);
      assert.ok(result.missing.includes(key));
    }
  }
});

test('explicit zero costs are accepted, while division by zero is unavailable', () => {
  const result = calculatePlan(offer({ base: '0', extras: '0', nights: '0', hours: '0', budget: '0' }));
  assert.equal(result.complete, true);
  assert.equal(result.totalPerPersonMinor, 0);
  assert.equal(result.groupTotalMinor, 0);
  assert.equal(result.budgetRemainingMinor, 0);
  assert.equal(result.perNightMinor, null);
  assert.equal(result.perHourMinor, null);
  assert.equal(result.surchargePercent, null);
});

test('zero headline price with nonzero extras has a total but no percentage', () => {
  const result = calculatePlan(offer({ base: '0', extras: '15' }));
  assert.equal(result.totalPerPersonMinor, 1500);
  assert.equal(result.surchargePercent, null);
});

test('optional unknown nights, hours and budget do not invent derived values', () => {
  const result = calculatePlan(offer({ nights: '', hours: '', budget: '' }));
  assert.equal(result.complete, true);
  assert.equal(result.totalPerPersonMinor, 12500);
  assert.equal(result.perNightMinor, null);
  assert.equal(result.perHourMinor, null);
  assert.equal(result.budgetRemainingMinor, null);
});

test('missing travellers leaves group amount unknown without losing known per-person cost', () => {
  const result = calculatePlan(offer({ travelers: '' }));
  assert.equal(result.totalPerPersonMinor, 12500);
  assert.equal(result.groupTotalMinor, null);
  assert.equal(result.complete, false);
});

test('fractional, zero, negative and excessive traveller counts are rejected', () => {
  for (const travelers of ['2.5', '2,5', '0', '-1', '100', '1e1', 'NaN']) {
    const result = calculatePlan(offer({ travelers }));
    assert.equal(result.valid, false, travelers);
    assert.equal(result.errors.travelers, 'travelers', travelers);
    assert.equal(result.totalPerPersonMinor, null, travelers);
    assert.equal(result.groupTotalMinor, null, travelers);
  }
});

test('invalid cost notation, negatives, extra precision and non-finite numbers are rejected', () => {
  for (const base of ['-1', '1.234', '1,234', '1e3', '1 000', '1,000.00', 'Infinity', 'NaN', '€20', '1000000001', Infinity, NaN]) {
    const result = calculatePlan(offer({ base }));
    assert.equal(result.valid, false, String(base));
    assert.equal(result.totalPerPersonMinor, null, String(base));
  }
});

test('known maximum inputs retain safe integer money precision', () => {
  const result = calculatePlan(offer({ base: '1000000000', extras: '1000000000', travelers: '99', hours: '0.01' }));
  assert.equal(result.valid, true);
  assert.equal(result.totalPerPersonMinor, 200000000000);
  assert.equal(result.groupTotalMinor, 19800000000000);
  assert.equal(result.perHourMinor, 20000000000000);
  assert.equal(Number.isSafeInteger(result.groupTotalMinor), true);
  assert.equal(Number.isSafeInteger(result.perHourMinor), true);
});

test('budget overrun stays signed and names are bounded without altering arithmetic', () => {
  assert.equal(calculatePlan(offer({ budget: '200' })).budgetRemainingMinor, -5000);
  assert.equal(calculatePlan(offer({ name: 'x'.repeat(121) })).valid, false);
  assert.equal(calculatePlan(offer({ name: '' })).valid, true);
});

test('night and hour values are validated independently', () => {
  for (const changes of [{ nights: '2.5' }, { nights: '-1' }, { nights: '3651' }, { hours: '-1' }, { hours: '87601' }, { hours: '1.001' }]) {
    assert.equal(calculatePlan(offer(changes)).valid, false);
  }
});

test('mixed currencies are explicit and input order is never ranked or mutated', () => {
  const source = [offer({ name: 'B', currency: 'USD', base: '900' }), offer({ name: 'A', currency: 'EUR', base: '10' })];
  const original = JSON.stringify(source);
  const comparison = comparePlans(source);
  assert.equal(comparison.mixedCurrencies, true);
  assert.deepEqual(comparison.results.map(item => item.name), ['B', 'A']);
  assert.deepEqual(comparison.results.map(item => item.currency), ['USD', 'EUR']);
  assert.equal('winner' in comparison, false);
  assert.equal(JSON.stringify(source), original);
  assert.equal(comparePlans([offer(), offer({ base: '1' })]).mixedCurrencies, false);
  for (const input of [[], [offer(), offer(), offer(), offer()], null]) assert.throws(() => comparePlans(input), RangeError);
});

test('invalid currencies and malformed pure-function input produce unavailable results', () => {
  for (const input of [null, [], 'hello', {}, offer({ currency: 'XYZ' })]) {
    const result = calculatePlan(input);
    assert.equal(result.valid, false);
    assert.equal(result.totalPerPersonMinor, null);
  }
});

test('valid versioned storage round-trips drafts, Unicode names and sample provenance', () => {
  const draft = offer({ name: 'Árvíztűrő út', base: '', extras: '', hours: '', nights: '', budget: '' });
  const sample = offer({ source: 'sample', base: '17' });
  const raw = serializePlanner([draft, sample], time);
  const result = parseStoredPlanner(raw);
  assert.equal(result.ok, true);
  assert.equal(result.value.savedAt, time);
  assert.deepEqual(result.value.offers, [draft, sample]);
  assert.equal(calculatePlan(result.value.offers[1]).source, 'sample');
});

test('malformed, oversized, unsupported and subtly incomplete storage is rejected', () => {
  const valid = JSON.parse(serializePlanner([offer()], time));
  const invalid = [
    '', '{', 'null', '[]', 'x'.repeat(12001),
    JSON.stringify({ ...valid, version: 2 }),
    JSON.stringify({ version: 1, offers: [offer()] }),
    JSON.stringify({ ...valid, savedAt: 'yesterday' }),
    JSON.stringify({ ...valid, offers: [] }),
    JSON.stringify({ ...valid, offers: [offer({ travelers: '2.5' })] }),
    JSON.stringify({ ...valid, offers: [offer({ source: 'verified' })] }),
    JSON.stringify({ ...valid, offers: [offer({ base: 100 })] }),
    JSON.stringify({ ...valid, offers: [offer({ unknownKey: 'payload' })] }),
    JSON.stringify({ ...valid, offers: [offer({ name: 'a'.repeat(121) })] }),
    JSON.stringify({ ...valid, extra: 'unexpected' }),
  ];
  for (const raw of invalid) assert.equal(parseStoredPlanner(raw).ok, false, raw.slice(0, 100));
});

test('storage reads never write or silently replace invalid saved data', () => {
  let writes = 0;
  const storage = { getItem: key => { assert.equal(key, PLANNER_STORAGE_KEY); return '{broken'; }, setItem() { writes++; }, removeItem() { writes++; } };
  assert.equal(readPlannerStorage(storage).ok, false);
  assert.equal(writes, 0);
  assert.deepEqual(readPlannerStorage({ getItem: () => null }), { ok: true, value: null });
});

test('explicit save writes once; invalid values do not overwrite the prior snapshot', () => {
  let saved = null;
  let writes = 0;
  const storage = { setItem(key, value) { assert.equal(key, PLANNER_STORAGE_KEY); saved = value; writes++; } };
  assert.equal(savePlannerStorage(storage, [offer()], time).ok, true);
  const previous = saved;
  assert.equal(writes, 1);
  assert.deepEqual(savePlannerStorage(storage, [offer({ base: '-2' })], time), { ok: false, reason: 'invalid' });
  assert.equal(writes, 1);
  assert.equal(saved, previous);
});

test('storage denial and quota failures preserve the caller’s in-memory data', () => {
  const offers = [offer()];
  const original = JSON.stringify(offers);
  const unavailable = {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('QuotaExceededError'); },
    removeItem() { throw new Error('SecurityError'); },
  };
  assert.deepEqual(readPlannerStorage(unavailable), { ok: false, reason: 'unavailable' });
  assert.deepEqual(savePlannerStorage(unavailable, offers, time), { ok: false, reason: 'unavailable' });
  assert.deepEqual(clearPlannerStorage(unavailable), { ok: false, reason: 'unavailable' });
  assert.equal(JSON.stringify(offers), original);
  assert.equal(readPlannerStorage(undefined).ok, false);
});

test('explicit delete touches only the planner storage key', () => {
  const removed = [];
  assert.deepEqual(clearPlannerStorage({ removeItem: key => removed.push(key) }), { ok: true });
  assert.deepEqual(removed, [PLANNER_STORAGE_KEY]);
});

test('both static pages expose labelled inputs, explicit load/save, formula and privacy scope', () => {
  for (const lang of ['hu', 'en']) {
    const html = plannerPage(lang);
    assert.equal((html.match(/data-planner-index=/g) || []).length, 2);
    assert.match(html, /data-planner-save/);
    assert.match(html, /data-planner-load/);
    assert.match(html, /data-planner-delete/);
    assert.match(html, /data-planner-export/);
    assert.match(html, /role="status" aria-live="polite"/);
    assert.doesNotMatch(html, /<script|<iframe|\bonclick=/);
    assert.match(html, new RegExp(`/${lang}/blog/ket-ajanlat-azonos-alapon/`));
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length);
    for (const [, target] of html.matchAll(/\bfor="([^"]+)"/g)) assert.ok(ids.includes(target));
  }
  assert.match(plannerPage('en'), /Your estimate/);
  assert.match(plannerPage('hu'), /saját becslésed/);
  assert.equal(initPlanner('hu'), false);
});

test('optional city fields accept international Unicode text without changing costs', () => {
  for (const [origin, destination] of [['Budapest', 'São Paulo'], ['東京', 'مراكش'], ['München', 'Αθήνα'], ['', '']]) {
    const result = calculatePlan(offer({ origin, destination }));
    assert.equal(result.valid, true);
    assert.equal(result.origin, origin);
    assert.equal(result.destination, destination);
    assert.equal(result.groupTotalMinor, 25000);
  }
  for (const key of ['origin', 'destination']) {
    assert.equal(calculatePlan(offer({ [key]: '界'.repeat(120) })).valid, true);
    for (const value of ['界'.repeat(121), null, 123, {}, []]) {
      assert.equal(calculatePlan(offer({ [key]: value })).valid, false);
      assert.throws(() => serializePlanner([offer({ [key]: value })], time), TypeError);
    }
  }
});

test('legacy version 1 plans migrate only absent city fields without writing or losing sample provenance', () => {
  const legacy = offer({ name: 'Sample · edited title', source: 'sample' });
  delete legacy.origin;
  delete legacy.destination;
  const raw = JSON.stringify({ version: 1, savedAt: time, offers: [legacy] });
  let writes = 0;
  const result = readPlannerStorage({ getItem: () => raw, setItem: () => writes++ });
  assert.equal(result.ok, true);
  assert.equal(writes, 0);
  assert.deepEqual(result.value.offers, [{ origin: '', destination: '', ...legacy }]);
  assert.equal(parseStoredPlanner(serializePlanner(result.value.offers, time)).value.offers[0].source, 'sample');
  const partial = JSON.stringify({ version: 1, savedAt: time, offers: [{ ...legacy, origin: 'Zürich' }] });
  assert.equal(parseStoredPlanner(partial).value.offers[0].origin, 'Zürich');
  for (const value of [null, 1, [], 'a'.repeat(121)]) {
    assert.equal(parseStoredPlanner(JSON.stringify({ version: 1, savedAt: time, offers: [{ ...legacy, origin: value }] })).ok, false);
  }
});

test('city fields have bilingual labels, autocomplete hooks, bounds and accessible explanations', () => {
  for (const lang of ['hu', 'en']) {
    const html = plannerPage(lang);
    const inputs = [...html.matchAll(/<input\b[^>]*data-city-input[^>]*>/g)].map(match => match[0]);
    assert.equal(inputs.length, 4);
    for (const input of inputs) {
      assert.match(input, /maxlength="120"/);
      assert.match(input, /autocomplete="off"/);
      assert.match(input, /aria-describedby="[^"]*city-hint/);
      assert.doesNotMatch(input, /inputmode="(?:numeric|decimal)"/);
    }
  }
  assert.match(plannerPage('hu'), /Indulási város/);
  assert.match(plannerPage('hu'), /Úti cél/);
  assert.match(plannerPage('en'), /Departure city/);
  assert.match(plannerPage('en'), /Cities are not verified/);
});

test('restored city text is HTML escaped and illustrative routes remain sample data when saved', () => {
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const payload = '東京"><img src=x onerror=alert(1)>';
  let saved = serializePlanner([offer({ origin: payload, destination: "São Paulo & 'Lisboa'" })], time);
  let reads = 0;
  try {
    for (const lang of ['hu', 'en']) {
      const nodes = new Map();
      const node = selector => {
        if (!nodes.has(selector)) nodes.set(selector, {
          dataset: {}, handlers: {}, innerHTML: '', textContent: '',
          setAttribute() {}, focus() {},
          addEventListener(type, callback) { this.handlers[type] = callback; },
        });
        return nodes.get(selector);
      };
      const root = { dataset: { plannerLang: lang }, querySelector: node };
      Object.defineProperty(globalThis, 'document', { configurable: true, value: { getElementById: () => root } });
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem() { reads++; return saved; }, setItem(key, value) { saved = value; },
      } });
      const before = reads;
      initPlanner(lang);
      assert.equal(reads, before, 'initialization must not load saved cities');
      node('[data-planner-load]').handlers.click();
      if (lang === 'hu') {
        assert.match(node('[data-planner-grid]').innerHTML, /東京&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt;/);
        assert.match(node('[data-planner-grid]').innerHTML, /São Paulo &amp; &#39;Lisboa&#39;/);
        assert.doesNotMatch(node('[data-planner-grid]').innerHTML, /<img/);
      }
      node('[data-planner-sample]').handlers.click();
      node('[data-planner-save]').handlers.click();
      const restored = parseStoredPlanner(saved);
      assert.equal(restored.ok, true);
      for (const item of restored.value.offers) {
        assert.equal(item.origin, lang === 'hu' ? 'Budapest' : 'London');
        assert.equal(item.destination, 'Barcelona');
        assert.equal(item.source, 'sample');
        assert.match(item.name, lang === 'hu' ? /^Minta/ : /^Sample/);
      }
      node('[data-planner-grid]').handlers.input({ target: {
        dataset: { plannerField: 'destination' }, value: '京都',
        closest: () => ({ dataset: { plannerIndex: '0' } }),
      } });
      node('[data-planner-save]').handlers.click();
      assert.equal(parseStoredPlanner(saved).value.offers[0].destination, '京都');
      assert.equal(parseStoredPlanner(saved).value.offers[0].source, 'sample');
    }
  } finally {
    if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else delete globalThis.document;
    if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage); else delete globalThis.localStorage;
  }
});
