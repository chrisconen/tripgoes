import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateWidget, validateExperiences, widgetPolicy, experiencesPage, WIDGET_HOSTS, MIN_TOURS, MAP, DOT, HIT, MIN_SEPARATION } from '../src/experiences.mjs';

const widget = (changes = {}) => ({
  src: 'https://tpscr.com/content?promo_id=4489&campaign_id=150&powered_by=false&tours=20&locale=en&shmarker=793137.793137&trs=588496',
  hosts: { script: ['https://tpscr.com', 'https://wegotrip.com'], img: ['https://tpscr.com'], frame: ['https://wegotrip.com'], connect: ['https://tpo.gg'] },
  ...changes,
});
const city = (changes = {}) => ({ slug: 'budapest', cityId: '3054643', name: 'Budapest', country: 'Hungary', products: 27, hu: 'Budapest', lat: 47.4983, lon: 19.0408, top: ['Dohany Synagogue Ticket'], ...changes });
const rome = (changes = {}) => city({ slug: 'rome', cityId: '3169070', name: 'Rome', country: 'Italy', products: 99, hu: 'Róma', lat: 41.8933, lon: 12.4828, ...changes });
const config = (changes = {}) => ({
  version: 2, generated: '2026-10-21', minProducts: 20, widget: widget(),
  countries: { Hungary: 'Magyarország', Italy: 'Olaszország' },
  cities: [city(), rome()],
  ...changes,
});

test('the widget template is checked against allowed hosts, parameters and tour count', () => {
  const parsed = validateWidget(widget());
  assert.ok(WIDGET_HOSTS.includes(new URL(parsed.src).hostname));
  assert.equal(parsed.tours, MIN_TOURS);
  assert.deepEqual(parsed.hosts.frame, ['https://wegotrip.com']);
  for (const broken of [
    undefined, { src: 'not a url', hosts: widget().hosts },
    widget({ src: 'http://tpscr.com/content?powered_by=false&tours=20' }),
    widget({ src: 'https://evil.example/content?powered_by=false&tours=20' }),
    // The attribution badge stays off, the city is never baked in, and the
    // brief asks for at least twenty programs per city.
    widget({ src: 'https://tpscr.com/content?promo_id=4489&powered_by=true&tours=20' }),
    widget({ src: 'https://tpscr.com/content?promo_id=4489&powered_by=false&tours=20&city_id=3054643' }),
    widget({ src: 'https://tpscr.com/content?promo_id=4489&powered_by=false&tours=3' }),
    widget({ src: 'https://tpscr.com/content?promo_id=4489&powered_by=false' }),
    widget({ src: 'https://tpscr.com/content?promo_id=4489&powered_by=false&tours=400' }),
    widget({ src: 'https://tpscr.com/content?promo_id=4489&powered_by=false&tours=20&redirect=https://evil.example' }),
    widget({ hosts: { ...widget().hosts, script: ['https://evil.example'] } }),
    widget({ hosts: { ...widget().hosts, script: ['https://tpscr.com/path'] } }),
    widget({ hosts: { script: ['https://tpscr.com'], img: ['https://tpscr.com'], frame: ['https://wegotrip.com'] } }),
    widget({ hosts: { ...widget().hosts, other: ['https://x.example'] } }),
  ]) assert.throws(() => validateWidget(broken), TypeError, String(JSON.stringify(broken)).slice(0, 70));
});

test('every city becomes the same template with its own city parameter', () => {
  const { cities } = validateExperiences(config());
  assert.equal(cities.length, 2);
  assert.equal(new URL(cities[0].src).searchParams.get('city_id'), '3054643');
  assert.equal(new URL(cities[1].src).searchParams.get('city_id'), '3169070');
  assert.equal(new URL(cities[1].src).searchParams.get('tours'), String(MIN_TOURS));
  // Adding a destination is configuration, never a new snippet.
  assert.equal(new URL(cities[0].src).origin, new URL(cities[1].src).origin);
  // Localized titles, and a generated intro where we wrote no note of our own.
  assert.equal(cities[1].title.hu, 'Róma');
  assert.equal(cities[1].title.en, 'Rome');
  assert.ok(cities[1].intro.hu.startsWith('Róma, Olaszország.'));
  assert.ok(cities[1].intro.en.startsWith('Rome, Italy.'));
  const noted = validateExperiences(config({ cities: [rome({ notes: { hu: 'A sor hosszú, érdemes előre megnézni, mi foglalható időpontra.', en: 'The queue is long, so it is worth checking what can be booked ahead.' } })] }));
  assert.equal(noted.cities[0].intro.hu, 'A sor hosszú, érdemes előre megnézni, mi foglalható időpontra.');
});

test('configuration requires a known country, enough products and usable copy', () => {
  for (const broken of [
    null, { ...config(), version: 1 }, config({ cities: [] }),
    config({ cities: [city(), city()] }),
    config({ cities: [city({ slug: 'Budapest' })] }),
    config({ cities: [city({ cityId: '12' })] }),
    config({ cities: [city({ cityId: 3054643 })] }),
    config({ cities: [city({ country: 'Atlantis' })] }),
    config({ cities: [city({ products: 19 })] }),
    config({ cities: [city({ products: '27' })] }),
    config({ cities: [city({ name: '' })] }),
    config({ cities: [city({ hu: '' })] }),
    config({ cities: [city({ top: [] })] }),
    config({ cities: [city({ top: 'Ticket' })] }),
    config({ cities: [city({ lat: undefined })] }),
    config({ cities: [city({ lon: '19.04' })] }),
    config({ cities: [city({ lat: 95 })] }),
    // Reykjavík would sit above the cropped map, so it must be caught, not drawn off-canvas.
    config({ cities: [city({ lat: 80 })] }),
    config({ cities: [city({ lat: -70 })] }),
    // The Vatican sat on Rome's pixel and made Rome unclickable.
    config({ cities: [city(), city({ slug: 'vatican-city', cityId: '6691831', name: 'Vatican City', country: 'Hungary', lat: 47.4988, lon: 19.0411 })] }),
    config({ cities: [city({ notes: { hu: 'Rövid.', en: 'Short.' } })] }),
    config({ minProducts: 5 }),
    config({ countries: [] }),
    config({ countries: { Hungary: '' } }),
  ]) assert.throws(() => validateExperiences(broken), TypeError, JSON.stringify(broken).slice(0, 70));
});

test('cities are projected onto the same grid as the map backdrop', () => {
  const { cities } = validateExperiences(config());
  const [budapest] = cities;
  assert.equal(budapest.x, Math.round((19.0408 + 180) / 360 * MAP.width * 10) / 10);
  assert.equal(budapest.y, Math.round((MAP.north - 47.4983) / 360 * MAP.width * 10) / 10);
  for (const entry of cities) {
    assert.ok(entry.x >= 0 && entry.x <= MAP.width, `${entry.slug} x=${entry.x}`);
    assert.ok(entry.y >= 0 && entry.y <= MAP.height, `${entry.slug} y=${entry.y}`);
  }
});

test('the map carries one titled link per city, the current one drawn last', () => {
  const parsed = validateExperiences(config());
  const html = experiencesPage(parsed, 'hu', 'rome');
  const map = html.match(/<figure class="city-map">[\s\S]*?<\/figure>/)[0];
  // Each city carries an invisible disc as well, because a four-pixel dot is
  // not a target anyone can hit.
  assert.equal(map.match(/<circle /g).length, parsed.cities.length * 2);
  assert.equal(map.match(/class="city-hit"/g).length, parsed.cities.length);
  assert.ok(HIT >= 3 * DOT);
  assert.equal(map.match(new RegExp(`\\sr="${HIT}"`, 'g')).length, parsed.cities.length);
  assert.equal(map.match(/<title>/g).length, parsed.cities.length);
  assert.ok(map.includes('<title>Róma — Olaszország</title>'));
  assert.ok(map.includes('href="/assets/world.svg"'));
  assert.equal(map.match(/viewBox="0 0 (\S+) (\S+)"/)[1], String(MAP.width));
  // Painted last, so the selected dot is never hidden under a neighbour.
  assert.ok(map.lastIndexOf('aria-current="page"') > map.lastIndexOf('/experiences/budapest/'));
  assert.ok(experiencesPage(parsed, 'en', 'rome').includes('<title>Rome — Italy</title>'));
});

test('the policy widens only for the declared hosts', () => {
  const policy = widgetPolicy(validateExperiences(config()).widget);
  assert.equal(policy.scriptExtra, ' https://tpscr.com https://wegotrip.com');
  assert.equal(policy.imgExtra, ' https://tpscr.com');
  assert.equal(policy.frameSrc, 'https://wegotrip.com');
  assert.deepEqual(policy.connectExtra, ['https://tpo.gg']);
});

test('the hub reaches every city but loads a single widget', () => {
  const parsed = validateExperiences(config());
  const html = experiencesPage(parsed, 'hu');
  assert.equal(html.match(/tpscr\.com\/content\?/g).length, 1);
  // The map is the only picker now, so every city must be reachable from it.
  for (const slug of ['budapest', 'rome']) assert.ok(html.includes(`href="/hu/experiences/${slug}/"`));
  assert.ok(!html.includes('city-picker'));
  assert.ok(experiencesPage(parsed, 'en').includes('href="/en/experiences/rome/"'));
  assert.ok(html.includes('jutalékot kaphatunk'));
  assert.ok(experiencesPage(parsed, 'en').includes('commission'));
  assert.ok(html.includes('noscript'));
});

test('a city page shows that city only, and keeps the map to switch', () => {
  const parsed = validateExperiences(config());
  const html = experiencesPage(parsed, 'hu', 'rome');
  assert.equal(html.match(/tpscr\.com\/content\?/g).length, 1);
  assert.ok(html.includes('city_id=3169070') && !html.includes('city_id=3054643'));
  assert.ok(html.includes('aria-current="page"><title>Róma'));
  assert.ok(html.includes('href="/hu/experiences/"'));
  // The examples are dated, because the widget below them is live.
  assert.ok(html.includes('A listán például') && html.includes('2026-10-21'));
  assert.throws(() => experiencesPage(parsed, 'hu', 'atlantis'), TypeError);
  assert.throws(() => experiencesPage({ cities: [] }, 'hu'), TypeError);
});

test('city copy is escaped wherever it is rendered', () => {
  const parsed = validateExperiences(config({ cities: [city({ hu: '<img src=x>', top: ['<svg onload=1>'] })] }));
  const html = experiencesPage(parsed, 'hu', 'budapest');
  assert.ok(html.includes('&lt;img src=x&gt;') && html.includes('&lt;svg onload=1&gt;'));
  // The city name is also a tooltip inside the map.
  assert.ok(html.includes('<title>&lt;img src=x&gt; — Magyarország</title>'));
  assert.ok(!html.includes('<img src=x') && !html.includes('<svg onload=1'));
});

test('the shipped configuration is valid and every city clears the promised count', async () => {
  const raw = JSON.parse(await readFile(new URL('../content/experiences.json', import.meta.url), 'utf8'));
  const { cities, countries, widget: parsed } = validateExperiences(raw);
  assert.ok(cities.length >= 20, `only ${cities.length} cities`);
  assert.equal(new Set(cities.map(entry => entry.cityId)).size, cities.length);
  assert.equal(new Set(cities.map(entry => entry.slug)).size, cities.length);
  assert.ok(parsed.tours >= MIN_TOURS);
  for (const entry of cities) {
    assert.ok(entry.products >= MIN_TOURS, `${entry.slug} carries ${entry.products} products`);
    assert.ok(entry.samples.length, `${entry.slug} has no sample titles`);
    assert.ok(countries[entry.country], `${entry.slug} has no localized country`);
    assert.ok(entry.x >= 0 && entry.x <= MAP.width && entry.y >= 0 && entry.y <= MAP.height, `${entry.slug} is off the map`);
  }
  assert.ok(cities.some(entry => entry.slug === 'budapest'));
  // No two shipped dots may land on one pixel; close pairs separate on zoom,
  // because the hit disc shrinks with the view.
  for (const [index, entry] of cities.entries()) {
    for (const other of cities.slice(0, index)) {
      const gap = Math.hypot(other.x - entry.x, other.y - entry.y);
      assert.ok(gap >= MIN_SEPARATION, `${entry.slug} and ${other.slug} are ${gap.toFixed(2)} units apart`);
    }
  }
  assert.ok(!cities.some(entry => entry.slug === 'vatican-city'), 'the Vatican sits on Rome and hides it');
});
