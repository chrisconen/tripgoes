import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validatePackages, packageCard, packageGrid, packagesPage, countrySlug, COUNTRIES, IMAGE_HOST, AFFILIATE_ID, MIN_FOR_PAGE } from '../src/packages.mjs';

const offer = (changes = {}) => ({
  id: '36905-2027-08-29', source: 'dream', country: 'Maldív-szigetek', locality: 'Malé atoll',
  hotel: 'Kuramathi Island Resort', stars: 5, from: '2027-08-29', to: '2027-09-05', nights: 7,
  price: 1259900, currency: 'HUF', discount: 25, food: 'All inclusive', transport: 'Repülővel',
  airport: 'Budapest', type: 'Üdülés', image: `${IMAGE_HOST}/shared/img/affil-450x300/a.jpg`,
  photos: [`${IMAGE_HOST}/shared/img/affil-450x300/a.jpg`],
  href: `https://www.invia.hu/hotel/maldiv/kuramathi/utazas/?aid=${AFFILIATE_ID}`, ...changes,
});
const config = (offers = [offer()]) => ({ version: 1, generated: '2026-10-22', offers });
// toLocaleString separates thousands with a non-breaking space, which is
// correct typography and inconvenient to assert on.
const plain = html => html.replace(/[  ]/g, ' ');

test('an offer is refused unless it can be rendered and paid for', () => {
  const { offers, generated, countries } = validatePackages(config());
  assert.equal(generated, '2026-10-22');
  assert.equal(offers.length, 1);
  assert.equal(offers[0].slug, 'maldiv-szigetek');
  assert.deepEqual(countries[0], { name: 'Maldív-szigetek', count: 1, slug: 'maldiv-szigetek', title: { hu: 'Maldív-szigetek', en: 'Maldives' } });
  for (const broken of [
    null, { version: 2, generated: '2026-10-22', offers: [offer()] },
    { version: 1, offers: [offer()] },
    config([]),
    config([offer(), offer()]),
    config([offer({ id: '' })]),
    config([offer({ hotel: '' })]),
    config([offer({ from: 'holnap' })]),
    config([offer({ price: 0 })]),
    config([offer({ price: '1259900' })]),
    config([offer({ currency: 'EUR' })]),
    config([offer({ nights: 0 })]),
    config([offer({ nights: 7.5 })]),
    config([offer({ discount: 120 })]),
    config([offer({ stars: 9 })]),
    config([offer({ image: 'https://evil.example/a.jpg' })]),
    config([offer({ href: 'https://evil.example/trip' })]),
    config([offer({ href: 'http://www.invia.hu/x/?aid=9426177' })]),
    // The link that pays somebody else is the one that must never ship.
    config([offer({ href: 'https://www.invia.hu/hotel/x/?aid=1111111' })]),
    config([offer({ href: 'https://www.invia.hu/hotel/x/' })]),
  ]) assert.throws(() => validatePackages(broken), TypeError, JSON.stringify(broken)?.slice(0, 70));
});

test('the card shows where it leaves from, and shouts when that is not Budapest', () => {
  const hu = packageCard(offer(), 'hu');
  assert.ok(hu.includes('Budapestről indul'));
  assert.ok(!hu.includes('pkg-abroad'), 'a Budapest departure is not a warning');
  // More than a third of the catalogue leaves from abroad; hiding it would
  // send somebody to Vienna at dawn without warning.
  const vienna = packageCard(offer({ airport: 'Bécs' }), 'hu');
  assert.ok(vienna.includes('Bécsből indul') && vienna.includes('pkg-abroad'));
  assert.ok(packageCard(offer({ airport: 'Pozsony' }), 'hu').includes('Pozsonyból indul'));
  assert.ok(packageCard(offer({ airport: 'Bécs' }), 'en').includes('Departs Vienna'));
  assert.ok(packageCard(offer({ transport: 'Egyénileg' }), 'hu').includes('Repülő nélkül'));
});

test('the card prices, dates and translates its trip', () => {
  const hu = plain(packageCard(offer(), 'hu'));
  assert.ok(hu.includes('1 259 900 Ft'), hu);
  assert.ok(hu.includes('7 éjszaka') && hu.includes('All inclusive'));
  assert.ok(hu.includes('★★★★★'));
  assert.ok(hu.includes('−25%'), 'a real discount is worth a badge');
  assert.ok(!packageCard(offer({ discount: 5 }), 'hu').includes('pkg-off'), 'a token discount is not');
  assert.ok(hu.includes('rel="sponsored noopener"') && hu.includes('loading="lazy"'));
  const en = plain(packageCard(offer(), 'en'));
  assert.ok(en.includes('HUF 1,259,900') && en.includes('Maldives') && en.includes('7 nights'));
  assert.ok(packageCard(offer({ food: 'Félpanzió' }), 'en').includes('Half board'));
});

// A country we have never seen must not take the build down with it.
test('an unknown country falls back to its Hungarian name', () => {
  const { countries } = validatePackages(config([offer({ country: 'Atlantisz' })]));
  assert.deepEqual(countries[0].title, { hu: 'Atlantisz', en: 'Atlantisz' });
  assert.equal(countries[0].slug, 'atlantisz');
});

test('copy from the feed is escaped wherever it lands', () => {
  const html = packageCard(offer({ hotel: '<img src=x>', locality: '"><svg onload=1>' }), 'hu');
  assert.ok(html.includes('&lt;img src=x&gt;'));
  assert.ok(!html.includes('<img src=x>') && !html.includes('<svg onload'));
});

test('the grid labels its prices with a date and says so when empty', () => {
  const { offers, generated } = validatePackages(config());
  const html = packageGrid(offers, 'hu', { generated });
  assert.ok(html.includes('2026-10-22'), 'stale prices are labelled, like the cached fares');
  assert.ok(html.includes('pkg-grid'));
  assert.ok(packageGrid([], 'hu').includes('nincs utazás'));
  assert.ok(packageGrid([], 'en').includes('No trips match'));
});

test('the catalogue filters the whole list and a destination page does not', () => {
  const egyptian = count => Array.from({ length: count }, (unused, index) => offer({ id: `e${index}-2027-01-01`, country: 'Egyiptom', hotel: 'Steigenberger' }));
  const data = validatePackages(config([offer(), ...egyptian(3)]));
  const all = packagesPage(data, 'hu');
  assert.ok(all.includes('pkg-filters') && all.includes('name="airport"'));
  assert.equal((all.match(/class="pkg-card"/g) || []).length, 4);
  const egypt = packagesPage(data, 'hu', 'egyiptom');
  assert.equal((egypt.match(/class="pkg-card"/g) || []).length, 3);
  assert.ok(!egypt.includes('pkg-filters'), 'one destination needs no destination filter');
  assert.ok(egypt.includes('aria-current="page"'));
  assert.throws(() => packagesPage(data, 'hu', 'atlantisz'), TypeError);
});

test('the shipped feed data validates and carries pages worth building', async () => {
  const raw = JSON.parse(await readFile(new URL('../content/packages.json', import.meta.url), 'utf8'));
  const { offers, countries } = validatePackages(raw);
  assert.ok(offers.length >= 150, `only ${offers.length} offers`);
  // Every country the feed returns must be translatable, or the English page
  // silently prints Hungarian.
  const untranslated = countries.filter(country => !COUNTRIES[country.name]);
  assert.ok(untranslated.length <= 2, `add these to COUNTRIES: ${untranslated.map(c => c.name).join(', ')}`);
  assert.ok(countries.filter(country => country.count >= MIN_FOR_PAGE).length >= 10);
  assert.ok(offers.every(entry => entry.href.includes(`aid=${AFFILIATE_ID}`)));
  // The showcase is built on long-haul trips, so they have to be in there.
  assert.ok(countries.some(country => country.name === 'Maldív-szigetek'));
  assert.equal(countrySlug('Egyesült Arab Emírségek'), 'egyesult-arab-emirsegek');
});
