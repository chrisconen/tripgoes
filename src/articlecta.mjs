// A contextual link out of every article into something bookable.
//
// The 100 guides carried no commercial link at all: the only href in an
// article body pointed at the affiliate notice. Two hundred pages of writing
// that led nowhere. Each of the ten categories now ends on the page that
// actually answers what the article was about.
import { searchUrl } from './tools.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// route: a path under the language root, or 'search' for the live metasearch,
// which lives on its own per-language domain.
export const ARTICLE_CTA = {
  beach: { route: 'utak/',
    hu: { title: 'Kész tengerparti utak', text: 'Repülőjegy, szállás és ellátás egy árban, indulás Budapestről vagy Bécsből.', cta: 'Megnézem az utakat' },
    en: { title: 'Complete beach holidays', text: 'Flight, hotel and board for one price, leaving from Budapest or Vienna.', cta: 'Browse the trips' } },
  lastminute: { route: 'utak/',
    hu: { title: 'Ahol most a legnagyobb a kedvezmény', text: 'A katalógus a legnagyobb árengedménnyel kezd, és minden kártyán ott az induló repülőtér.', cta: 'Megnézem az akciókat' },
    en: { title: 'Where the discount is deepest now', text: 'The catalogue leads with the biggest reductions, and every card names its departure airport.', cta: 'See the deals' } },
  accommodation: { route: 'utak/',
    hu: { title: 'Szállás és repülőjegy egy áron', text: 'Szűrhető ellátás, hossz és csillagszám szerint — a foglalás az utazásszervezőnél zárul.', cta: 'Megnézem az ajánlatokat' },
    en: { title: 'Hotel and flight for one price', text: 'Filter by board, length and stars — booking finishes with the tour operator.', cta: 'See the offers' } },
  cruises: { route: 'utak/',
    hu: { title: 'Komplett utazások egy áron', text: 'A kínálatban főként tengerparti üdülések vannak; a típus minden kártyán szerepel.', cta: 'Megnézem a kínálatot' },
    en: { title: 'Complete trips for one price', text: 'The catalogue is mostly beach holidays; every card states its type.', cta: 'See what is on offer' } },
  flights: { route: 'search',
    hu: { title: 'Élő repülőjegy-árak', text: 'Több száz utazási oldal árai egy keresésben, forintban.', cta: 'Keresek repülőjegyet' },
    en: { title: 'Live fares', text: 'Hundreds of travel sites in one search.', cta: 'Search for flights' } },
  citybreaks: { route: 'experiences/',
    hu: { title: 'Foglalható városi programok', text: 'Belépők, séták és vezetett programok több tucat városban, valódi árral és értékeléssel.', cta: 'Válassz várost' },
    en: { title: 'Bookable city activities', text: 'Tickets, walks and guided tours in dozens of cities, with real prices and ratings.', cta: 'Pick a city' } },
  responsible: { route: 'experiences/',
    hu: { title: 'Helyi vezetésű programok', text: 'A programokat helyi szolgáltatók tartják; az ár és az értékelés a szolgáltató oldaláról jön.', cta: 'Megnézem a programokat' },
    en: { title: 'Locally run activities', text: 'The activities are run by local providers; prices and ratings come from their own pages.', cta: 'See the activities' } },
  planning: { route: 'eszkozok/',
    hu: { title: 'Számold ki a teljes költséget', text: 'Három saját ajánlat egymás mellett: összköltség, éjszakák és használható órák.', cta: 'Megnyitom az úttervezőt' },
    en: { title: 'Work out the whole cost', text: 'Three offers of your own side by side: total cost, nights and usable hours.', cta: 'Open the trip planner' } },
  budgets: { route: 'eszkozok/',
    hu: { title: 'Mi fér bele valójában?', text: 'Poggyász, kijutás, transzfer — az eszközök a teljes összeget számolják, nem a kiírt árat.', cta: 'Megnézem az eszközöket' },
    en: { title: 'What actually fits the budget?', text: 'Bags, getting there, transfers — the tools total the trip, not the headline price.', cta: 'See the tools' } },
  tools: { route: 'eszkozok/',
    hu: { title: 'Öt eszköz a döntéshez', text: 'Jegykereső, tárolt árak, úttervező és árnapló — mindegyik megmondja, mit nem tud.', cta: 'Megnézem az eszközöket' },
    en: { title: 'Five tools for the decision', text: 'Fare search, cached prices, planner and price diary — each says what it does not know.', cta: 'See the tools' } },
};

export const ctaHref = (route, lang) => (route === 'search' ? searchUrl(lang) : `/${lang}/${route}`);

export function articleCta(category, lang) {
  const language = lang === 'en' ? 'en' : 'hu';
  const entry = ARTICLE_CTA[category];
  // An unknown category must not silently drop the only commercial link on
  // the page, so it falls back to the catalogue.
  const { route, [language]: text } = entry ?? ARTICLE_CTA.beach;
  const href = ctaHref(route, language);
  const external = route === 'search';
  return `<aside class="article-next"><p class="eyebrow">${language === 'hu' ? 'KÖVETKEZŐ LÉPÉS' : 'NEXT STEP'}</p>`
    + `<h2>${escape(text.title)}</h2><p>${escape(text.text)}</p>`
    + `<a class="button" href="${escape(href)}"${external ? ' target="_blank" rel="noopener"' : ''}>${escape(text.cta)} ↗</a></aside>`;
}
