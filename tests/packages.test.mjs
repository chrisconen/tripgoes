import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validatePackages, packageCard, packageGrid, packagesPage, packagesJsonLd, pageTitle, boardTitle, boardDescription, hasPage, foodSlug, euroRate, countrySlug, COUNTRIES, IMAGE_HOST, AFFILIATE_ID, MIN_FOR_PAGE } from '../src/packages.mjs';

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
  assert.deepEqual(countries[0], { name: 'Maldív-szigetek', count: 1, slug: 'maldiv-szigetek', established: false,
    title: { hu: 'Maldív-szigetek', en: 'Maldives' }, from: 1259900, years: ['2027'] });
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
  // The feed price is for one person; without the unit it reads as the total.
  assert.ok(hu.includes('/fő') && plain(packageCard(offer(), 'en')).includes('/ person'));
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

// The feed prices in forint, which is what a booking costs. An English reader
// still needs a figure they can feel, clearly marked as a conversion.
test('English pages show an approximate euro beside the forint', () => {
  const rate = { eur: 365, date: '2026-10-21', source: 'ECB' };
  const en = plain(packageCard(offer(), 'en', rate));
  assert.ok(en.includes('HUF 1,259,900'), 'the payable price stays the price');
  assert.ok(en.includes('≈ €3,452'), en.slice(en.indexOf('pkg-price')));
  // Hungarian readers pay in forint and need no second number.
  assert.ok(!packageCard(offer(), 'hu', rate).includes('€'));
  // Without a rate the euro simply is not claimed.
  assert.ok(!plain(packageCard(offer(), 'en')).includes('€'));
  const grid = packageGrid(validatePackages(config()).offers, 'en', { generated: '2026-10-22', rate });
  assert.ok(grid.includes('converted at the ECB rate of 2026-10-21'), 'the conversion names its source');
  assert.ok(!packageGrid(validatePackages(config()).offers, 'en', { generated: '2026-10-22' }).includes('converted at'));
});

test('a rate that cannot be sourced is not used at all', () => {
  for (const broken of [undefined, null, {}, { eur: 0, date: '2026-10-21' }, { eur: 365 }, { eur: 365, date: 'tegnap' }, { eur: '365', date: '2026-10-21' }]) {
    assert.equal(euroRate(broken), null, JSON.stringify(broken));
  }
  assert.deepEqual(euroRate({ eur: 365, date: '2026-10-21', source: 'ECB' }), { eur: 365, date: '2026-10-21', source: 'ECB' });
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

test('every list can be filtered, by the dimensions that list still has', () => {
  const egyptian = count => Array.from({ length: count }, (unused, index) => offer({ id: `e${index}-2027-01-01`, country: 'Egyiptom', hotel: 'Steigenberger', food: index ? 'All inclusive' : 'Reggeli', airport: index % 2 ? 'Budapest' : 'Bécs' }));
  const data = validatePackages(config([offer(), ...egyptian(4)]));
  const count = html => (html.match(/<select /g) || []).length;

  const all = packagesPage(data, 'hu');
  assert.equal((all.match(/class="pkg-card"/g) || []).length, 5);
  assert.equal(count(all), 4, 'price, length, board and departure');

  // The destination pages used to carry no filters at all, which left 25
  // cards on a page with nothing to narrow them by.
  const egypt = packagesPage(data, 'hu', 'egyiptom');
  assert.equal((egypt.match(/class="pkg-card"/g) || []).length, 4);
  assert.equal(count(egypt), 4);
  assert.ok(egypt.includes('aria-current="page"'));

  // Board is already fixed here, so offering it again would be furniture.
  const board = packagesPage(data, 'hu', 'egyiptom', 'all-inclusive');
  assert.equal((board.match(/class="pkg-card"/g) || []).length, 3);
  assert.equal(count(board), 3, 'board is no longer a choice');
  assert.ok(!board.includes('name="food"'));

  // A single offer needs no filter bar either.
  assert.equal(count(packagesPage(data, 'hu', 'maldiv-szigetek')), 0);
  assert.throws(() => packagesPage(data, 'hu', 'atlantisz'), TypeError);
});

test('the shipped nights match the dates, never the feed day count', async () => {
  const raw = JSON.parse(await readFile(new URL('../content/packages.json', import.meta.url), 'utf8'));
  const day = 86400000;
  for (const entry of raw.offers) {
    const nights = Math.round((Date.parse(entry.to) - Date.parse(entry.from)) / day);
    assert.equal(entry.nights, nights, `${entry.id}: ${entry.from}–${entry.to} is ${nights} nights, not ${entry.nights}`);
  }
});

// The Hungarian competition puts the year and the cheapest price straight in
// the title, and both come from the data we already hold.
test('a destination title carries its year and its cheapest price', () => {
  const data = validatePackages(config([offer(), offer({ id: 'b', price: 899000, from: '2026-05-01', to: '2026-05-08' })]));
  const [maldives] = data.countries;
  assert.equal(maldives.from, 899000);
  assert.deepEqual(maldives.years, ['2026', '2027']);
  assert.equal(plain(pageTitle(maldives, 'hu')), 'Maldív-szigetek utazás 2026–2027 — már 899 000 Ft/fő | TripGoes');
  assert.ok(pageTitle(maldives, 'en').startsWith('Maldives holidays 2026–2027 — from HUF 899,000 pp'));
});

// A destination page that has ranked must not disappear because today's feed
// happens to carry nothing for it.
test('a destination keeps its page after it drops out of the feed', () => {
  const data = validatePackages({ ...config(), published: ['Maldív-szigetek', 'Egyiptom'] });
  const egypt = data.countries.find(entry => entry.name === 'Egyiptom');
  assert.ok(egypt, 'the established destination is gone');
  assert.equal(egypt.count, 0);
  assert.ok(hasPage(egypt), 'an established destination keeps its page');
  assert.equal(pageTitle(egypt, 'hu'), 'Egyiptom utazás | TripGoes', 'an empty page promises no price');
  // It renders rather than throwing, and says so plainly.
  assert.ok(packagesPage(data, 'hu', 'egyiptom').includes('nincs utazás'));
  // One offer is not enough on its own, but an established name is.
  assert.ok(!hasPage({ count: 1, established: false }));
  assert.ok(hasPage({ count: MIN_FOR_PAGE, established: false }));
});

// "egyiptom all inclusive" is a search, and the data already answers it.
test('a destination splits into the board types it actually has', () => {
  const data = validatePackages(config([
    offer({ id: '1', country: 'Egyiptom', food: 'All inclusive' }),
    offer({ id: '2', country: 'Egyiptom', food: 'All inclusive' }),
    offer({ id: '3', country: 'Egyiptom', food: 'Reggeli' }),
  ]));
  const ai = data.boards.find(entry => entry.foodSlug === 'all-inclusive');
  assert.equal(ai.count, 2);
  assert.equal(ai.slug, 'egyiptom');
  assert.equal(plain(boardTitle(ai, 'hu')), 'Egyiptom all inclusive 2027 — már 1 259 900 Ft/fő | TripGoes');
  // The awkward one reads as Hungarian rather than as a filter value.
  const breakfast = data.boards.find(entry => entry.foodSlug === 'reggeli');
  assert.ok(boardTitle(breakfast, 'hu').startsWith('Egyiptom reggelivel'));
  assert.ok(boardTitle(breakfast, 'en').startsWith('Egypt with breakfast'));
  // The page shows only that board, and links to the siblings.
  const page = packagesPage(data, 'hu', 'egyiptom', 'all-inclusive');
  assert.equal((page.match(/class="pkg-card"/g) || []).length, 2);
  assert.ok(page.includes('<h1>Egyiptom, all inclusive — 2 komplett utazás</h1>'));
  assert.ok(page.includes('href="/hu/utak/egyiptom/"'), 'the board page links back to the destination');
  assert.throws(() => packagesPage(data, 'hu', 'egyiptom', 'nincs-ilyen'), TypeError);
  assert.equal(foodSlug('Ultra All inclusive'), 'ultra-all-inclusive');
});

test('a board page survives its offers disappearing', () => {
  const data = validatePackages({ ...config(), publishedBoards: ['Egyiptom|All inclusive'] });
  const gone = data.boards.find(entry => entry.key === 'Egyiptom|All inclusive');
  assert.equal(gone.count, 0);
  assert.ok(hasPage(gone));
  assert.ok(boardTitle(gone, 'hu').startsWith('Egyiptom all inclusive |'), 'an empty page promises no price');
  assert.ok(boardDescription(gone, 'hu').includes('nincs a betöltött kínálatban'));
});

test('the structured data describes the offers and cannot break out of its tag', () => {
  const { offers } = validatePackages(config([offer({ hotel: '</script><img src=x>' })]));
  const html = packagesJsonLd(offers, 'hu', { name: 'Maldív-szigetek' });
  assert.ok(html.startsWith('<script type="application/ld+json">'));
  assert.ok(!html.includes('</script><img'), 'a closing tag in the data would end the block early');
  const parsed = JSON.parse(html.replace(/^<script[^>]*>|<\/script>$/g, '').replaceAll('\u003c', '<'));
  assert.equal(parsed['@type'], 'ItemList');
  assert.equal(parsed.numberOfItems, 1);
  assert.equal(parsed.itemListElement[0].item.offers.priceCurrency, 'HUF');
  assert.equal(parsed.itemListElement[0].item.offers.price, 1259900);
  assert.equal(packagesJsonLd([], 'hu'), '', 'an empty page emits no structured data');
});

test('the shipped feed data validates and carries pages worth building', async () => {
  const raw = JSON.parse(await readFile(new URL('../content/packages.json', import.meta.url), 'utf8'));
  const { offers, countries } = validatePackages(raw);
  // A floor, not a target: the feed moves daily, and this is here to catch a
  // collapse rather than to pin a number.
  assert.ok(offers.length >= 100, `only ${offers.length} offers`);
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
