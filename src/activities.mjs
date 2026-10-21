// Our own activity cards, rendered from the partner catalogue instead of an
// embedded widget. The data is fetched at build time by
// scripts/sync-experiences.mjs, so prices carry the date they were read —
// the same honesty the cached fares already use.
//
// The deep-link shape came from the partner link generator, not from guessing:
// a destination URL is wrapped so the booking is attributed to us.
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const invalid = reason => { throw new TypeError(`Invalid activity catalogue: ${reason}`); };

export const LINK_BASE = 'https://tp.media/r';
export const LINK_PARAMS = { campaign_id: '150', marker: '793137', p: '4487', trs: '588496' };
export const PRODUCT_HOST = 'wegotrip.com';
export const IMAGE_HOSTS = ['https://wgt-prod-storage.s3.amazonaws.com'];
export const MAX_CARDS = 12;

export function productUrl({ providerSlug, cityId }, product) {
  return `https://${PRODUCT_HOST}/${providerSlug}-d${cityId}/${product.slug}-p${product.id}/`;
}

export function affiliateUrl(destination) {
  const target = new URL(destination);
  if (target.protocol !== 'https:' || target.hostname !== PRODUCT_HOST) invalid(`${destination} is not a partner product URL`);
  const link = new URL(LINK_BASE);
  for (const [name, value] of Object.entries(LINK_PARAMS)) link.searchParams.set(name, value);
  link.searchParams.set('u', target.href);
  return link.href;
}

function image(value) {
  let url;
  try { url = new URL(value); } catch { invalid(`${value} is not an image URL`); }
  if (!IMAGE_HOSTS.includes(url.origin)) invalid(`${url.origin} is not an allowed image host`);
  return url.href;
}

export function validateActivities(data, cities) {
  if (!data || data.version !== 1 || !data.cities || typeof data.cities !== 'object') invalid('version 1 and a cities map are required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.generated ?? '')) invalid('the catalogue needs a generated date');
  const bySlug = new Map(cities.map(city => [city.slug, city]));
  const catalogue = new Map();
  for (const [slug, products] of Object.entries(data.cities)) {
    const city = bySlug.get(slug);
    if (!city) invalid(`${slug} is not a configured city`);
    if (!Array.isArray(products) || products.length > MAX_CARDS) invalid(`${slug} needs 0–${MAX_CARDS} products`);
    const seen = new Set();
    catalogue.set(slug, products.map(product => {
      if (!product || !Number.isInteger(product.id) || product.id < 1 || seen.has(product.id)) invalid(`${slug} has a product without a unique id`);
      seen.add(product.id);
      if (typeof product.slug !== 'string' || !/^[a-z0-9-]{2,120}$/.test(product.slug)) invalid(`${slug} product ${product.id} has an unusable slug`);
      if (typeof product.title !== 'string' || !product.title.trim() || product.title.length > 160) invalid(`${slug} product ${product.id} needs a title`);
      if (typeof product.price !== 'number' || !(product.price > 0) || product.price > 100000) invalid(`${slug} product ${product.id} needs a price`);
      if (product.currency !== 'EUR') invalid(`${slug} product ${product.id} is not priced in euro`);
      if (typeof product.rating !== 'number' || product.rating < 0 || product.rating > 5) invalid(`${slug} product ${product.id} has an impossible rating`);
      if (!Number.isInteger(product.ratings) || product.ratings < 0) invalid(`${slug} product ${product.id} has an impossible rating count`);
      return {
        id: product.id, title: product.title.trim(), price: product.price,
        rating: product.rating, ratings: product.ratings, image: image(product.image),
        href: affiliateUrl(productUrl(city, product)),
      };
    }));
  }
  return { generated: data.generated, catalogue };
}

const copy = {
  hu: {
    heading: city => `${city} foglalható programjai`,
    asOf: date => `Az árak a ${date}-i állapot szerintiek; a véglegeset a foglalási oldal mutatja.`,
    ratings: count => `${count} értékelés`, from: 'ettől', open: 'Megnézem',
    empty: 'Ehhez a városhoz most nincs betöltött program.',
  },
  en: {
    heading: city => `Bookable activities in ${city}`,
    asOf: date => `Prices are as of ${date}; the booking page shows the final one.`,
    ratings: count => `${count} ratings`, from: 'from', open: 'Open',
    empty: 'No activities are loaded for this city right now.',
  },
};

const money = (value, lang) => lang === 'hu'
  ? `${value.toFixed(2).replace('.', ',')} €`
  : `€${value.toFixed(2)}`;

export function activityCards(products, lang, { city, generated } = {}) {
  const language = lang === 'en' ? 'en' : 'hu', text = copy[language];
  if (!Array.isArray(products) || !products.length) return `<p class="activity-empty">${text.empty}</p>`;
  const cards = products.map(product => `<li class="activity-card"><a href="${escape(product.href)}" rel="sponsored noopener" target="_blank"><img src="${escape(product.image)}" alt="" loading="lazy" decoding="async" width="320" height="240"><strong>${escape(product.title)}</strong><span class="activity-meta">${product.ratings ? `★ ${product.rating.toFixed(1)} · ${text.ratings(product.ratings)}` : ''}</span><span class="activity-price">${text.from} ${money(product.price, language)}<em>${text.open} ↗</em></span></a></li>`).join('');
  return `<section class="activity-section" aria-labelledby="activities-title"><h2 id="activities-title">${escape(text.heading(city ?? ''))}</h2><ul class="activity-grid">${cards}</ul><p class="activity-note">${generated ? text.asOf(generated) : ''}</p></section>`;
}
