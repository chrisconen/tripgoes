// The five tools the site actually runs, given one home instead of five
// scattered menu entries. Trips stay the headline; this is the second shelf.
//
// Each card states what the tool does AND what it does not know, because four
// of the five work from cached or self-entered data rather than live prices.
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Two metasearch pages, one per language: the Travelpayouts White Label is
// single-language, so an English visitor on the Hungarian one would get a
// Hungarian page with no way to switch.
export const SEARCH_URL = { hu: 'https://search.tripgoes.com/', en: 'https://flights.tripgoes.com/' };
export const searchUrl = lang => SEARCH_URL[lang === 'en' ? 'en' : 'hu'];

export const TOOLS = [
  {
    id: 'search', art: 'search', external: true,
    hu: { name: 'Jegykereső', kicker: 'ÉLŐ KERESÉS',
      text: 'Élő repülőjegy-árak forintban, Budapestről előre kitöltve.',
      limit: 'A foglalás a szolgáltató oldalán zárul.' },
    en: { name: 'Flight search', kicker: 'LIVE SEARCH',
      text: 'Live fares in forint, pre-filled from Budapest.',
      limit: 'Booking finishes on the provider’s site.' },
  },
  {
    id: 'last-minute', art: 'clock', href: 'last-minute/',
    hu: { name: 'Last minute', kicker: 'A KÖVETKEZŐ HÉT NAP',
      text: 'A következő hét indulási nap legolcsóbb tárolt jegyára, naponta egy ajánlattal.',
      limit: 'Tárolt árak, nem élő foglalás.' },
    en: { name: 'Last minute', kicker: 'THE NEXT SEVEN DAYS',
      text: 'The cheapest cached fare for each of the next seven departure days.',
      limit: 'Cached prices, not a live booking.' },
  },
  {
    id: 'flights', art: 'chart', href: 'flights/',
    hu: { name: 'Tárolt árak', kicker: 'ÁRAK VILÁGSZERTE',
      text: 'Korábbi keresésekből származó jegyárak Budapesttől a világ repülőtereiig.',
      limit: 'Az aktuális árat a szolgáltatónál ellenőrizd.' },
    en: { name: 'Cached fares', kicker: 'FARES WORLDWIDE',
      text: 'Fares from earlier searches, from Budapest to airports around the world.',
      limit: 'Confirm the current price with the provider.' },
  },
  {
    id: 'planner', art: 'scales', href: 'planner/',
    hu: { name: 'Úttervező', kicker: 'TELJES KÖLTSÉG',
      text: 'Három saját ajánlat egymás mellett: teljes költség, csoportkeret, éjszakák és használható órák.',
      limit: 'A te adataidból számol; nem ellenőrzi őket.' },
    en: { name: 'Trip planner', kicker: 'WHOLE-TRIP COST',
      text: 'Three offers of your own side by side: total cost, group budget, nights and usable hours.',
      limit: 'It calculates from your figures; it does not verify them.' },
  },
  {
    id: 'score', art: 'gauge', href: 'score/',
    hu: { name: 'TripScore Lab', kicker: 'ÁRNAPLÓ',
      text: 'Építs saját árnaplót egy ajánlatról, és nézd meg, miből áll össze a pontszám.',
      limit: 'Saját megfigyelésekből; nem szolgáltatói hitelesítés.' },
    en: { name: 'TripScore Lab', kicker: 'PRICE DIARY',
      text: 'Build your own price diary for an offer and see exactly what supports the score.',
      limit: 'From your own observations, not provider verification.' },
  },
];

// Flat, abstract marks drawn in code: they illustrate what a tool does without
// ever looking like a photograph of a place we are selling.
const ART = {
  search: '<circle cx="34" cy="30" r="15"/><path d="M45 41 58 54"/><path d="M12 62h56"/><path d="M12 72h34"/>',
  clock: '<circle cx="40" cy="40" r="19"/><path d="M40 29v12l9 6"/><path d="M12 70h56"/>',
  chart: '<path d="M14 62 30 44l12 10 22-28"/><path d="M14 20v50h54"/><circle cx="64" cy="26" r="4"/>',
  // Three pans, because the planner weighs three offers against each other.
  // Drafted by the codex colleague; the rest of its set lost legibility at
  // 34 pixels, so only this one was taken.
  scales: '<path d="M40 10V69M28 69h24M13 22h54"/><path d="M16 22 7 42h18zM7 42q9 12 18 0"/><path d="M40 22 31 42h18zM31 42q9 12 18 0"/><path d="M64 22 55 42h18zM55 42q9 12 18 0"/>',
  gauge: '<path d="M14 58a26 26 0 0 1 52 0"/><path d="M40 58 56 38"/><circle cx="40" cy="58" r="4"/><path d="M14 68h52"/>',
};

const mark = name => `<svg class="tool-art" viewBox="0 0 80 80" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${ART[name] ?? ART.search}</svg>`;

const copy = {
  hu: {
    title: 'Öt eszköz a döntéshez',
    intro: 'Az utazások a lényeg; ezek segítenek eldönteni, melyik éri meg. Mindegyik megmondja azt is, mit nem tud.',
    band: 'ESZKÖZÖK', bandTitle: 'Nem csak ajánlatok. Döntési segédletek is.',
    bandText: 'Árkereső, teljes költség, árnapló. Mindegyik megmondja, honnan van az adat.',
    all: 'Mind az 5 eszköz', open: 'Megnyitom',
  },
  en: {
    title: 'Five tools for the decision',
    intro: 'The trips are the point; these help you work out which one is worth it. Each says what it does not know, too.',
    band: 'TOOLS', bandTitle: 'Not only offers. Help deciding, too.',
    bandText: 'Fare search, whole-trip cost, a price diary. Each one names where its data comes from.',
    all: 'All 5 tools', open: 'Open',
  },
};

function card(tool, lang, base) {
  const text = tool[lang];
  const href = tool.external ? searchUrl(lang) : `${base}${tool.href}`;
  const target = tool.external ? ' target="_blank" rel="noopener"' : '';
  return `<li class="tool-card tool-${tool.id}"><a href="${escape(href)}" aria-label="${escape(text.name)}"${target}>`
    + `<span class="tool-mark">${mark(tool.art)}</span>`
    + `<span class="tool-kicker">${escape(text.kicker)}</span>`
    + `<strong>${escape(text.name)}</strong>`
    + `<span class="tool-text">${escape(text.text)}</span>`
    + `<span class="tool-limit">${escape(text.limit)}</span>`
    + `<span class="tool-open">${escape(copy[lang].open)} ↗</span>`
    + `</a></li>`;
}

export function toolsPage(lang) {
  const language = lang === 'en' ? 'en' : 'hu', text = copy[language], base = `/${language}/`;
  // Decorative only, and deliberately not behind the heading: the artwork has
  // a dark mass at one end, and text over it would be the first thing to suffer.
  return `<section class="tool-head container"><h1>${escape(text.title)}</h1><p>${escape(text.intro)}</p></section>`
    + `<div class="tool-banner container" role="presentation"></div>`
    + `<section class="container tool-results"><ul class="tool-grid">${TOOLS.map(tool => card(tool, language, base)).join('')}</ul></section>`;
}

// The landing-page band: the same cards, with a way through to the page.
export function toolsBand(lang) {
  const language = lang === 'en' ? 'en' : 'hu', text = copy[language], base = `/${language}/`;
  return `<section class="tool-band container" aria-labelledby="tools-title">`
    + `<div class="section-heading"><div><p class="eyebrow">${escape(text.band)}</p>`
    + `<h2 id="tools-title">${escape(text.bandTitle)}</h2><p>${escape(text.bandText)}</p></div>`
    + `<a class="text-link" href="${base}eszkozok/">${escape(text.all)} ↗</a></div>`
    + `<ul class="tool-grid">${TOOLS.map(tool => card(tool, language, base)).join('')}</ul></section>`;
}
