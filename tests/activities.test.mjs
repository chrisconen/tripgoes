import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateActivities, activityCards, affiliateUrl, productUrl, LINK_PARAMS, IMAGE_HOSTS, MAX_CARDS } from '../src/activities.mjs';
import { validateExperiences } from '../src/experiences.mjs';

const city = { slug: 'budapest', providerSlug: 'budapest', cityId: '3054643' };
const product = (changes = {}) => ({
  id: 12818, slug: 'dohany-synagogue-ticket', title: 'Budapest: Dohany Synagogue Ticket',
  price: 52.1, currency: 'EUR', rating: 4.3, ratings: 359,
  image: `${IMAGE_HOSTS[0]}/media/products/example.jpg`, ...changes,
});
const config = (products = [product()]) => ({ version: 1, generated: '2026-10-21', cities: { budapest: products } });
const cities = [{ ...city, title: { hu: 'Budapest', en: 'Budapest' } }];

test('the product URL follows the partner scheme and the link carries our marker', () => {
  const url = productUrl(city, product());
  assert.equal(url, 'https://wegotrip.com/budapest-d3054643/dohany-synagogue-ticket-p12818/');
  const link = new URL(affiliateUrl(url));
  assert.equal(link.origin + link.pathname, 'https://tp.media/r');
  // Without these the click earns nothing, so they are asserted explicitly.
  for (const [name, value] of Object.entries(LINK_PARAMS)) assert.equal(link.searchParams.get(name), value);
  assert.equal(link.searchParams.get('u'), url);
  // Only the partner's own product pages may be wrapped.
  for (const bad of ['https://evil.example/x', 'http://wegotrip.com/x', 'https://sub.wegotrip.com/x']) {
    assert.throws(() => affiliateUrl(bad), TypeError, bad);
  }
});

test('a catalogue entry is refused unless it can be rendered honestly', () => {
  const { catalogue, generated } = validateActivities(config(), cities);
  assert.equal(generated, '2026-10-21');
  assert.equal(catalogue.get('budapest').length, 1);
  for (const broken of [
    null, { version: 2, generated: '2026-10-21', cities: {} },
    { version: 1, cities: {} },
    { version: 1, generated: 'tegnap', cities: {} },
    { version: 1, generated: '2026-10-21', cities: { atlantis: [] } },
    config(Array.from({ length: MAX_CARDS + 1 }, (unused, index) => product({ id: index + 1 }))),
    config([product({ id: 0 })]),
    config([product(), product()]),
    config([product({ slug: 'Nope!' })]),
    config([product({ title: '' })]),
    config([product({ price: 0 })]),
    config([product({ price: '52' })]),
    config([product({ currency: 'HUF' })]),
    config([product({ rating: 9 })]),
    config([product({ ratings: -1 })]),
    // A picture from anywhere else would widen the page policy silently.
    config([product({ image: 'https://evil.example/a.jpg' })]),
  ]) assert.throws(() => validateActivities(broken, cities), TypeError, JSON.stringify(broken)?.slice(0, 70));
});

test('cards show the price, the rating and a sponsored link, and escape their copy', () => {
  const { catalogue, generated } = validateActivities(config([product({ title: '<img src=x>' })]), cities);
  const html = activityCards(catalogue.get('budapest'), 'hu', { city: 'Budapest', generated });
  assert.ok(html.includes('52,10 €'), 'Hungarian price format');
  assert.ok(activityCards(catalogue.get('budapest'), 'en', { city: 'Budapest', generated }).includes('€52.10'));
  assert.ok(html.includes('★ 4.3 · 359 értékelés'));
  assert.ok(html.includes('rel="sponsored noopener"'));
  assert.ok(html.includes('loading="lazy"'));
  // Stale prices are labelled, the same way the cached fares are.
  assert.ok(html.includes('2026-10-21'));
  assert.ok(html.includes('&lt;img src=x&gt;') && !html.includes('<img src=x>'));
  assert.ok(activityCards([], 'hu').includes('nincs betöltött'));
});

test('every shipped city has a catalogue that validates against its configuration', async () => {
  const raw = JSON.parse(await readFile(new URL('../content/experiences.json', import.meta.url), 'utf8'));
  const list = JSON.parse(await readFile(new URL('../content/activities.json', import.meta.url), 'utf8'));
  const { cities: configured } = validateExperiences(raw);
  const { catalogue } = validateActivities(list, configured);
  assert.equal(catalogue.size, configured.length);
  let total = 0;
  for (const entry of configured) {
    const products = catalogue.get(entry.slug);
    assert.ok(products?.length, `${entry.slug} has no products`);
    total += products.length;
    for (const item of products) assert.ok(item.href.includes(`u=https%3A%2F%2Fwegotrip.com%2F${entry.providerSlug}-d${entry.cityId}`), `${entry.slug} links elsewhere`);
  }
  assert.ok(total >= 300, `only ${total} products across ${configured.length} cities`);
});
