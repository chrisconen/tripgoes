import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validatePackages, featuredOffer, featuredCard, FEATURE_MIN_DISCOUNT, IMAGE_HOST, AFFILIATE_ID } from '../src/packages.mjs';

const photos = Array.from({ length: 5 }, (unused, index) => `${IMAGE_HOST}/shared/img/affil-450x300/${index}.jpg`);
const offer = (changes = {}) => ({
  id: 'a', source: 'bombs', country: 'Kanári-szigetek', locality: 'Tenerife',
  hotel: 'Hovima Suites Costa Adeje', stars: 4, from: '2027-03-13', to: '2027-03-20', nights: 7,
  price: 496760, currency: 'HUF', discount: 50, food: 'All inclusive', transport: 'Repülővel',
  airport: 'Bécs', type: 'Üdülés', image: photos[0], photos,
  href: `https://www.invia.hu/hotel/x/?aid=${AFFILIATE_ID}`, ...changes,
});
const plain = html => html.replace(/[  ]/g, ' ');
const valid = offers => validatePackages({ version: 1, generated: '2026-10-22', offers }).offers;

test('the featured slot takes the deepest discount, and says that is the rule', () => {
  const offers = valid([offer(), offer({ id: 'b', discount: 30 })]);
  assert.equal(featuredOffer(offers), offers[0]);
  const html = plain(featuredCard(offers[0], 'hu', { generated: '2026-10-22' }));
  // The claim on the card has to be the claim the code makes.
  assert.ok(html.includes('A LEGNAGYOBB KEDVEZMÉNY MOST · −50%'));
  assert.ok(html.includes('A feed jelenlegi legnagyobb árengedménye'));
  assert.ok(html.includes('496 760 Ft') && html.includes('/fő'));
  assert.ok(html.includes('Hovima Suites Costa Adeje') && html.includes('★★★★'));
  assert.ok(html.includes('7 éjszaka') && html.includes('All inclusive'));
  assert.ok(html.includes('rel="sponsored noopener"'));
  const en = plain(featuredCard(offers[0], 'en', {}));
  assert.ok(en.includes('THE DEEPEST DISCOUNT RIGHT NOW · −50%') && en.includes('HUF 496,760'));
});

test('a departure from abroad is as loud here as on the small cards', () => {
  const [vienna] = valid([offer()]);
  assert.ok(featuredCard(vienna, 'hu').includes('Bécsből indul'));
  assert.ok(featuredCard(vienna, 'hu').includes('pkg-abroad'), 'a foreign airport must stand out');
  const [budapest] = valid([offer({ airport: 'Budapest' })]);
  assert.ok(!featuredCard(budapest, 'hu').includes('pkg-abroad'));
});

test('the slot stays empty rather than overselling a small reduction', () => {
  assert.equal(featuredOffer(valid([offer({ discount: FEATURE_MIN_DISCOUNT - 1 })])), null);
  assert.equal(featuredOffer([]), null);
  assert.equal(featuredOffer(undefined), null);
  assert.equal(featuredCard(null, 'hu'), '', 'no offer means no block at all');
});

test('the featured card spends the photos the grid never shows', () => {
  const [entry] = valid([offer()]);
  const html = featuredCard(entry, 'hu');
  // One large picture plus two thumbnails, all from the allowed host.
  assert.equal((html.match(/<img /g) || []).length, 3);
  for (const src of [...html.matchAll(/src="([^"]+)"/g)].map(hit => hit[1])) {
    assert.ok(src.startsWith(`${IMAGE_HOST}/`), `${src} is not an allowed image host`);
  }
  // An offer that only ever had one picture still renders.
  const [single] = valid([offer({ photos: [photos[0]] })]);
  const lean = featuredCard(single, 'hu');
  assert.equal((lean.match(/<img /g) || []).length, 1);
  assert.ok(!lean.includes('pkg-featured-thumbs'));
});

test('feed copy is escaped in the featured card too', () => {
  const [dirty] = valid([offer({ hotel: '<img src=x>', locality: '"><svg onload=1>' })]);
  const html = featuredCard(dirty, 'hu');
  assert.ok(html.includes('&lt;img src=x&gt;') && !html.includes('<img src=x>'));
  assert.ok(!html.includes('<svg onload'));
});

test('the shipped feed has something worth featuring', async () => {
  const raw = JSON.parse(await readFile(new URL('../content/packages.json', import.meta.url), 'utf8'));
  const { offers } = validatePackages(raw);
  const top = featuredOffer(offers);
  assert.ok(top, `the best discount is only ${offers[0].discount}%`);
  assert.ok(top.discount >= FEATURE_MIN_DISCOUNT);
  assert.ok(top.photos.length >= 1);
});
