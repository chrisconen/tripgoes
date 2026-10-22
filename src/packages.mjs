// Complete trips — flight, hotel and board for one price — rendered as our
// own cards from the partner feed. scripts/sync-packages.mjs writes the data
// at build time, so every price carries the date it was read.
//
// The feed speaks Hungarian only, so the handful of closed value sets are
// translated here. Hotel names and localities are proper nouns and stay.
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const invalid = reason => { throw new TypeError(`Invalid package catalogue: ${reason}`); };

export const OFFER_HOST = 'www.invia.hu';
export const IMAGE_HOST = 'https://dcontent.inviacdn.net';
export const AFFILIATE_ID = '9426177';
// A country needs enough offers to be worth its own page; below this it is
// still reachable in the full catalogue.
export const MIN_FOR_PAGE = 3;
// Enough offers to be worth a page, or a page it already earned.
export const hasPage = country => country.count >= MIN_FOR_PAGE || country.established === true;
// "Maldív-szigetek 2027" and "már 1 112 439 Ft/fő" are what the Hungarian
// competition puts in its titles, and both come straight from the data.
export const yearLabel = country => country.years.length ? (country.years.length === 1 ? country.years[0] : `${country.years[0]}–${country.years.at(-1)}`) : '';
export function pageTitle(country, lang) {
  const name = country.title[lang === 'en' ? 'en' : 'hu'], years = yearLabel(country);
  if (!country.count) return lang === 'hu' ? `${name} utazás | TripGoes` : `${name} holidays | TripGoes`;
  const price = lang === 'hu' ? `${country.from.toLocaleString('hu-HU')} Ft/fő` : `HUF ${country.from.toLocaleString('en-GB')} pp`;
  return lang === 'hu'
    ? `${name} utazás ${years} — már ${price} | TripGoes`
    : `${name} holidays ${years} — from ${price} | TripGoes`;
}

export const COUNTRIES = {
  'Egyesült Arab Emírségek': 'United Arab Emirates', 'Egyiptom': 'Egypt',
  'Kanári-szigetek': 'Canary Islands', 'Törökország': 'Turkey', 'Thaiföld': 'Thailand',
  'Spanyolország': 'Spain', 'Maldív-szigetek': 'Maldives', 'Ciprus': 'Cyprus',
  'Málta': 'Malta', 'Srí Lanka': 'Sri Lanka', 'Mauritius': 'Mauritius',
  'Olaszország': 'Italy', 'Bali': 'Bali', 'Portugália': 'Portugal', 'Mexikó': 'Mexico',
  'Görögország': 'Greece', 'Egyesült Királyság (Nagy-Britannia)': 'United Kingdom',
  'Madeira': 'Madeira', 'Dominikai Köztársaság': 'Dominican Republic',
  'Franciaország': 'France', 'Magyarország': 'Hungary', 'Zanzibár': 'Zanzibar',
  'Seychelle-szigetek': 'Seychelles', 'Omán': 'Oman', 'Szlovénia': 'Slovenia',
  'Horvátország': 'Croatia', 'Bulgária': 'Bulgaria', 'Csehország': 'Czechia',
  'Tunézia': 'Tunisia', 'Dánia': 'Denmark', 'Marokkó': 'Morocco', 'Barbados': 'Barbados',
  'Amerikai Egyesült Államok (USA)': 'United States', '*Tengerparti kikötők': 'Coastal ports',
  'Lengyelország': 'Poland', 'Ausztria': 'Austria', 'Németország': 'Germany',
  'Hollandia': 'Netherlands', 'Belgium': 'Belgium', 'Svájc': 'Switzerland',
  'Szlovákia': 'Slovakia', 'Románia': 'Romania', 'Szerbia': 'Serbia',
  'Montenegró': 'Montenegro', 'Albánia': 'Albania', 'Bosznia-Hercegovina': 'Bosnia and Herzegovina',
  'Svédország': 'Sweden', 'Norvégia': 'Norway', 'Finnország': 'Finland',
  'Izland': 'Iceland', 'Írország': 'Ireland', 'Észtország': 'Estonia',
  'Lettország': 'Latvia', 'Litvánia': 'Lithuania', 'Izrael': 'Israel',
  'Jordánia': 'Jordan', 'Katar': 'Qatar', 'Bahrein': 'Bahrain',
  'Zöld-foki-szigetek': 'Cape Verde', 'Kuba': 'Cuba', 'Jamaica': 'Jamaica',
  'Kenya': 'Kenya', 'Tanzánia': 'Tanzania', 'Dél-afrikai Köztársaság': 'South Africa',
  'Costa Rica': 'Costa Rica', 'Panama': 'Panama', 'Brazília': 'Brazil',
  'Kanada': 'Canada', 'Vietnam': 'Vietnam', 'Kambodzsa': 'Cambodia',
  'Malajzia': 'Malaysia', 'Szingapúr': 'Singapore', 'Indonézia': 'Indonesia',
  'Fülöp-szigetek': 'Philippines', 'India': 'India', 'Japán': 'Japan',
  'Kína': 'China', 'Dél-Korea': 'South Korea', 'Ausztrália': 'Australia',
  'Új-Zéland': 'New Zealand', 'Kuvait': 'Kuwait', 'Ciprus (török)': 'Northern Cyprus',
};
const FOOD = {
  'All inclusive': 'All inclusive', 'Ultra All inclusive': 'Ultra all inclusive',
  'Félpanzió': 'Half board', 'Teljes panzió': 'Full board',
  'Reggeli': 'Breakfast', 'Önellátás': 'Self-catering',
};
const TRANSPORT = { 'Repülővel': 'By air', 'Egyénileg': 'Own transport' };
// Three of the four departure airports are abroad, which is the single most
// important thing a Hungarian traveller must see before booking.
const AIRPORTS = { 'Budapest': 'Budapest', 'Bécs': 'Vienna', 'Pozsony': 'Bratislava', 'Temesvár': 'Timișoara' };
const TYPES = { 'Üdülés': 'Beach holiday', 'Hajóutak': 'Cruise' };

const ACCENTS = { á: 'a', é: 'e', í: 'i', ó: 'o', ö: 'o', ő: 'o', ú: 'u', ü: 'u', ű: 'u' };
export const countrySlug = name => name.toLowerCase()
  .replace(/[áéíóöőúüű]/g, c => ACCENTS[c])
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const translate = (table, value, lang) => (lang === 'en' ? table[value] ?? value : value);

// A rate we cannot trust is worse than none: the euro line disappears rather
// than quoting a number nobody can source.
export function euroRate(rate) {
  if (!rate || typeof rate.eur !== 'number' || !(rate.eur > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(rate.date ?? '')) return null;
  return { eur: rate.eur, date: rate.date, source: typeof rate.source === 'string' ? rate.source : '' };
}

export function validatePackages(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.offers)) invalid('version 1 and an offers array are required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.generated ?? '')) invalid('the catalogue needs a generated date');
  const seen = new Set();
  const offers = data.offers.map(offer => {
    if (!offer || typeof offer.id !== 'string' || !offer.id || seen.has(offer.id)) invalid(`an offer has no unique id (${offer?.id})`);
    seen.add(offer.id);
    for (const field of ['country', 'hotel', 'from', 'to', 'food', 'transport']) {
      if (typeof offer[field] !== 'string' || !offer[field].trim()) invalid(`${offer.id} has no ${field}`);
    }
    for (const field of ['from', 'to']) if (!/^\d{4}-\d{2}-\d{2}$/.test(offer[field])) invalid(`${offer.id} has an unusable ${field}`);
    if (typeof offer.price !== 'number' || !(offer.price > 0) || offer.price > 50_000_000) invalid(`${offer.id} has an impossible price`);
    if (offer.currency !== 'HUF') invalid(`${offer.id} is not priced in forint`);
    if (!Number.isInteger(offer.nights) || offer.nights < 1 || offer.nights > 60) invalid(`${offer.id} has an impossible length`);
    if (typeof offer.discount !== 'number' || offer.discount < 0 || offer.discount > 99) invalid(`${offer.id} has an impossible discount`);
    if (offer.stars !== null && !(offer.stars >= 1 && offer.stars <= 5)) invalid(`${offer.id} has an impossible star rating`);
    // A picture from anywhere else would widen the page policy silently.
    if (typeof offer.image !== 'string' || !offer.image.startsWith(`${IMAGE_HOST}/`)) invalid(`${offer.id} has no usable image`);
    // Without our id the click earns nothing.
    let link;
    try { link = new URL(offer.href); } catch { invalid(`${offer.id} has no usable link`); }
    if (link.protocol !== 'https:' || link.hostname !== OFFER_HOST) invalid(`${offer.id} links to ${link.hostname}`);
    if (link.searchParams.get('aid') !== AFFILIATE_ID) invalid(`${offer.id} carries no affiliate id`);
    return { ...offer, slug: countrySlug(offer.country) };
  });
  if (!offers.length) invalid('the catalogue is empty');
  const grouped = new Map();
  for (const offer of offers) {
    if (!grouped.has(offer.country)) grouped.set(offer.country, []);
    grouped.get(offer.country).push(offer);
  }
  // A destination that has ever had a page keeps it, even when today's feed
  // carries nothing for it: a URL that ranked must not 404 overnight.
  const published = new Set(data.published ?? []);
  for (const name of published) if (!grouped.has(name)) grouped.set(name, []);
  const countries = [...grouped]
    .map(([name, list]) => ({
      name, count: list.length, slug: countrySlug(name), established: published.has(name),
      title: { hu: name, en: COUNTRIES[name] ?? name },
      // The title carries these, because that is what the competition ranks on.
      from: list.length ? Math.min(...list.map(offer => offer.price)) : 0,
      years: [...new Set(list.map(offer => offer.from.slice(0, 4)))].sort(),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'hu'));
  return { generated: data.generated, rate: euroRate(data.rate), offers, countries };
}

const copy = {
  hu: {
    nights: count => `${count} éjszaka`, from: 'Már', open: 'Megnézem', per: '/fő',
    departs: airport => `${airport}ból indul`, own: 'Repülő nélkül',
    asOf: date => `Az árak a ${date}-i állapot szerintiek; a véglegeset a foglalási oldal mutatja.`,
    empty: 'Ehhez a szűréshez most nincs utazás.',
    off: value => `−${value}%`,
  },
  en: {
    nights: count => `${count} nights`, from: 'From', open: 'Open', per: ' / person',
    departs: airport => `Departs ${airport}`, own: 'No flight included',
    asOf: date => `Prices are as of ${date}; the booking page shows the final one.`,
    empty: 'No trips match this filter right now.',
    off: value => `−${value}%`,
  },
};
// "Bécs" takes -ből, "Budapest" takes -ról: pick the suffix per airport so the
// card reads like Hungarian rather than like a template.
const DEPARTS_HU = { 'Budapest': 'Budapestről indul', 'Bécs': 'Bécsből indul', 'Pozsony': 'Pozsonyból indul', 'Temesvár': 'Temesvárról indul' };

const money = (value, lang) => lang === 'hu'
  ? `${value.toLocaleString('hu-HU')} Ft`
  : `HUF ${value.toLocaleString('en-GB')}`;
// The booking is paid in forint, so that stays the price. An English reader
// still needs a number they can feel, and it is marked as the estimate it is.
const approxEur = (value, lang, rate) =>
  (lang === 'en' && rate ? `\≈ \€${Math.round(value / rate.eur).toLocaleString('en-GB')} ` : '');
const when = (from, to, lang) => {
  const format = new Intl.DateTimeFormat(lang === 'hu' ? 'hu-HU' : 'en-GB', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${format.format(new Date(from))} – ${format.format(new Date(to))}`;
};

export function packageCard(offer, lang, rate) {
  const text = copy[lang], hu = lang === 'hu';
  const flight = offer.transport === 'Repülővel';
  const departure = flight && offer.airport
    ? (hu ? DEPARTS_HU[offer.airport] ?? `${offer.airport}ból indul` : text.departs(AIRPORTS[offer.airport] ?? offer.airport))
    : text.own;
  const stars = offer.stars ? `<span class="pkg-stars" aria-label="${offer.stars}">${'★'.repeat(Math.round(offer.stars))}</span>` : '';
  const abroad = flight && offer.airport && offer.airport !== 'Budapest';
  // The filters read these rather than re-parsing the rendered text.
  const data = ` data-country="${escape(offer.slug ?? countrySlug(offer.country))}" data-price="${offer.price}"`
    + ` data-nights="${offer.nights}" data-food="${escape(offer.food)}" data-airport="${escape(offer.airport || '')}"`
    + ` data-stars="${offer.stars ?? 0}"`;
  return `<li class="pkg-card"${data}><a href="${escape(offer.href)}" rel="sponsored noopener" target="_blank">`
    + `<figure><img src="${escape(offer.image)}" alt="" loading="lazy" decoding="async" width="450" height="300">`
    + (offer.discount >= 10 ? `<figcaption class="pkg-off">${text.off(offer.discount)}</figcaption>` : '')
    + `</figure>`
    + `<span class="pkg-where">${escape(translate(COUNTRIES, offer.country, lang))}${offer.locality ? ` · ${escape(offer.locality)}` : ''}</span>`
    + `<strong>${escape(offer.hotel)}</strong>${stars}`
    + `<span class="pkg-meta">${escape(when(offer.from, offer.to, lang))} · ${text.nights(offer.nights)} · ${escape(translate(FOOD, offer.food, lang))}</span>`
    + `<span class="pkg-depart${abroad ? ' pkg-abroad' : ''}">${escape(departure)}</span>`
    + `<span class="pkg-price">${text.from} ${money(offer.price, lang)}<small>${approxEur(offer.price, lang, rate)}${text.per}</small><em>${text.open} ↗</em></span>`
    + `</a></li>`;
}

export function packageGrid(offers, lang, { generated, rate } = {}) {
  const language = lang === 'en' ? 'en' : 'hu', text = copy[language];
  if (!Array.isArray(offers) || !offers.length) return `<p class="pkg-empty">${text.empty}</p>`;
  return `<ul class="pkg-grid">${offers.map(offer => packageCard(offer, language, rate)).join('')}</ul>`
    + (generated ? `<p class="pkg-note">${text.asOf(generated)}${rateNote(language, rate)}</p>` : '');
}

// Says where the euro figure comes from, so it reads as a conversion rather
// than a second price.
export const rateNote = (lang, rate) =>
  (lang === 'en' && rate ? ` Euro amounts are approximate, converted at the ${rate.source || 'reference'} rate of ${rate.date}.` : '');

// The catalogue page. Every card is rendered statically so the page reads
// without JavaScript and search engines see the whole inventory; the filters
// only hide what does not match.
const page = {
  hu: {
    title: count => `${count} komplett utazás, egy helyen`,
    intro: 'Repülőjegy, szállás és ellátás egy árban. A foglalás és a fizetés az utazásszervező oldalán történik.',
    all: 'Összes úti cél', filters: 'Szűrés', budget: 'Ár', nights: 'Hossz', board: 'Ellátás',
    airport: 'Indulás', any: 'Mindegy', reset: 'Szűrők törlése',
    countryTitle: name => `${name} — komplett utazások repülővel`,
    countryIntro: (name, count) => `${count} foglalható utazás ${name} célpontjaira: repülőjegy, szállás és ellátás egy árban.`,
  },
  en: {
    title: count => `${count} complete trips in one place`,
    intro: 'Flight, hotel and board for one price. Booking and payment take place on the tour operator’s website.',
    all: 'All destinations', filters: 'Filter', budget: 'Price', nights: 'Length', board: 'Board',
    airport: 'Departure', any: 'Any', reset: 'Clear filters',
    countryTitle: name => `${name} — complete trips by air`,
    countryIntro: (name, count) => `${count} bookable trips to ${name}: flight, hotel and board for one price.`,
  },
};
const BUDGETS = [300000, 500000, 800000, 1500000];
const LENGTHS = [[0, 4], [5, 7], [8, 10], [11, 60]];

function controls(data, lang, text) {
  const foods = [...new Set(data.offers.map(offer => offer.food))].sort();
  const airports = [...new Set(data.offers.map(offer => offer.airport).filter(Boolean))].sort();
  const option = (value, label) => `<option value="${escape(value)}">${escape(label)}</option>`;
  const select = (name, label, options) =>
    `<label>${escape(label)}<select name="${name}">${option('', text.any)}${options}</select></label>`;
  return `<form class="pkg-filters" aria-label="${escape(text.filters)}">`
    + select('budget', text.budget, BUDGETS.map(limit => option(limit, `< ${money(limit, lang)}`)).join(''))
    + select('nights', text.nights, LENGTHS.map(([low, high]) => option(`${low}-${high}`, lang === 'hu' ? `${low || 1}–${high} éjszaka` : `${low || 1}–${high} nights`)).join(''))
    + select('food', text.board, foods.map(food => option(food, translate(FOOD, food, lang))).join(''))
    + select('airport', text.airport, airports.map(code => option(code, translate(AIRPORTS, code, lang))).join(''))
    + `<button type="reset" class="pkg-reset">${escape(text.reset)}</button>`
    + `<output class="pkg-count" aria-live="polite"></output></form>`;
}

export function packagesPage(data, lang, slug = '') {
  const language = lang === 'en' ? 'en' : 'hu', text = page[language];
  const base = `/${language}/utak/`;
  const country = slug ? data.countries.find(entry => entry.slug === slug) : null;
  if (slug && !country) throw new TypeError(`Unknown destination: ${slug}`);
  const offers = country ? data.offers.filter(offer => offer.slug === slug) : data.offers;
  const name = country?.title[language] ?? '';
  const chips = data.countries.filter(entry => hasPage(entry)).map(entry =>
    `<a href="${base}${entry.slug}/"${entry.slug === slug ? ' aria-current="page"' : ''}>${escape(entry.title[language])}<span>${entry.count}</span></a>`).join('');
  return `<section class="pkg-head container">`
    + `<h1>${escape(country ? text.countryTitle(name) : text.title(offers.length))}</h1>`
    + `<p>${escape(country ? text.countryIntro(name, offers.length) : text.intro)}</p></section>`
    + `<nav class="pkg-countries container" aria-label="${escape(text.all)}">`
    + `<a href="${base}"${slug ? '' : ' aria-current="page"'}>${escape(text.all)}<span>${data.offers.length}</span></a>${chips}</nav>`
    + (country ? '' : `<div class="container">${controls(data, language, text)}</div>`)
    + `<section class="container pkg-results">${packageGrid(offers, language, { generated: data.generated, rate: data.rate })}</section>`;
}

// Structured data, so a destination page can show its price in search results
// rather than a bare blue link. Kept to what the feed actually gives us:
// a name, a picture, a price and a link.
export function packagesJsonLd(offers, lang, { name } = {}) {
  if (!offers?.length) return '';
  const data = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: name ?? (lang === 'hu' ? 'Komplett utazások' : 'Complete trips'),
    numberOfItems: offers.length,
    itemListElement: offers.map((offer, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Product',
        name: offer.hotel,
        image: offer.image,
        category: `${offer.country}${offer.locality ? ` / ${offer.locality}` : ''}`,
        offers: {
          '@type': 'Offer',
          price: offer.price,
          priceCurrency: offer.currency,
          url: offer.href,
          availability: 'https://schema.org/InStock',
        },
      },
    })),
  };
  // A closing tag inside the JSON would end the script element early.
  return `<script type="application/ld+json">${JSON.stringify(data).replaceAll('<', '\\u003c')}</script>`;
}

// One offer gets the top of the page. The rule is stated on the card rather
// than left to taste: the deepest discount in the current feed. Below this
// the claim would not be worth making, so the block simply does not render.
export const FEATURE_MIN_DISCOUNT = 15;
export const featuredOffer = offers =>
  (offers?.[0]?.discount >= FEATURE_MIN_DISCOUNT ? offers[0] : null);

const featureCopy = {
  hu: { eye: discount => `A LEGNAGYOBB KEDVEZMÉNY MOST · −${discount}%`, open: 'Megnézem az ajánlatot', per: '/fő',
    rule: 'A feed jelenlegi legnagyobb árengedménye. Az árat és a feltételeket a foglalási oldal mutatja.' },
  en: { eye: discount => `THE DEEPEST DISCOUNT RIGHT NOW · −${discount}%`, open: 'See this trip', per: ' / person',
    rule: 'The largest reduction in the current feed. The booking page shows the price and conditions.' },
};

export function featuredCard(offer, lang, { generated, rate } = {}) {
  if (!offer) return '';
  const language = lang === 'en' ? 'en' : 'hu', text = featureCopy[language], card = copy[language];
  const flight = offer.transport === 'Repülővel';
  const departure = flight && offer.airport
    ? (language === 'hu' ? DEPARTS_HU[offer.airport] ?? `${offer.airport}ból indul` : card.departs(AIRPORTS[offer.airport] ?? offer.airport))
    : card.own;
  const abroad = flight && offer.airport && offer.airport !== 'Budapest';
  // The feed ships five pictures per offer and the grid shows one; the
  // featured slot is where the rest earn their keep.
  const thumbs = offer.photos.slice(1, 3)
    .map(photo => `<img src="${escape(photo)}" alt="" loading="lazy" decoding="async" width="160" height="107">`).join('');
  const fact = (value, extra = '') => `<li${extra}>${escape(value)}</li>`;
  return `<section class="pkg-featured container" aria-labelledby="featured-title">`
    + `<div class="pkg-featured-media"><img src="${escape(offer.image)}" alt="" width="450" height="300" decoding="async">`
    + (thumbs ? `<div class="pkg-featured-thumbs">${thumbs}</div>` : '') + `</div>`
    + `<div class="pkg-featured-body"><p class="eyebrow">${escape(text.eye(offer.discount))}</p>`
    + `<span class="pkg-where">${escape(translate(COUNTRIES, offer.country, language))}${offer.locality ? ` · ${escape(offer.locality)}` : ''}</span>`
    + `<h2 id="featured-title">${escape(offer.hotel)}</h2>`
    + (offer.stars ? `<span class="pkg-stars" aria-label="${offer.stars}">${'★'.repeat(Math.round(offer.stars))}</span>` : '')
    + `<ul class="pkg-featured-facts">`
    + fact(when(offer.from, offer.to, language)) + fact(card.nights(offer.nights)) + fact(translate(FOOD, offer.food, language))
    + fact(departure, abroad ? ' class="pkg-abroad"' : '') + `</ul>`
    + `<p class="pkg-featured-price">${card.from} <strong>${money(offer.price, language)}</strong><small>${approxEur(offer.price, language, rate)}${text.per}</small></p>`
    + `<a class="button" href="${escape(offer.href)}" rel="sponsored noopener" target="_blank">${escape(text.open)} ↗</a>`
    + `<p class="pkg-note">${escape(text.rule)}${generated ? ` ${card.asOf(generated)}` : ''}${rateNote(language, rate)}</p>`
    + `</div></section>`;
}
