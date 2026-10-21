// Partner activity widgets. One configured snippet is the template: the city is
// a parameter, so every further destination is a configuration entry, not a new
// trip to the partner dashboard.
//
// The widget runs in the page rather than a sandboxed frame: it loads its own
// nested frame and crashes with an opaque origin. The page policy is widened
// only on this route, and only to the hosts the configuration declares.
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const invalid = reason => { throw new TypeError(`Invalid experience configuration: ${reason}`); };

export const WIDGET_HOSTS = ['tpscr.com', 'tp.media', 'wegotrip.com', 'tpo.gg', 'www.travelpayouts.com'];
const WIDGET_PARAMS = ['promo_id', 'campaign_id', 'powered_by', 'tours', 'locale', 'shmarker', 'trs', 'currency', 'city_id'];
const HOST_KINDS = ['script', 'img', 'frame', 'connect'];

function origin(value) {
  let url;
  try { url = new URL(value); } catch { invalid(`${value} is not an absolute URL`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') invalid(`${value} must be a bare https origin`);
  if (!WIDGET_HOSTS.includes(url.hostname)) invalid(`${url.hostname} is not an allowed widget host`);
  return url.origin;
}

export function validateWidget(widget) {
  if (!widget || typeof widget.src !== 'string' || widget.src.length > 1000) invalid('widget.src is required');
  let url;
  try { url = new URL(widget.src); } catch { invalid('widget.src must be an absolute URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || !WIDGET_HOSTS.includes(url.hostname)) invalid('widget.src must be https and on an allowed host');
  for (const name of url.searchParams.keys()) if (!WIDGET_PARAMS.includes(name)) invalid(`widget parameter ${name} is not allowed`);
  if (url.searchParams.has('city_id')) invalid('widget.src is a template: the city comes from each section');
  // The partner attribution badge is a referral feature, not a requirement.
  if (url.searchParams.get('powered_by') !== 'false') invalid('widget.src must set powered_by=false');
  const hosts = {};
  for (const kind of HOST_KINDS) {
    const list = widget.hosts?.[kind];
    if (!Array.isArray(list) || !list.length || list.length > 6) invalid(`widget.hosts.${kind} needs 1–6 origins`);
    hosts[kind] = list.map(origin);
  }
  if (Object.keys(widget.hosts ?? {}).some(kind => !HOST_KINDS.includes(kind))) invalid('widget.hosts has an unknown kind');
  return { src: url.href, hosts };
}

export function validateExperiences(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.sections) || !data.sections.length || data.sections.length > 12) invalid('version 1 and 1–12 sections are required');
  const widget = validateWidget(data.widget);
  const seen = new Set();
  const sections = data.sections.map(section => {
    if (!section || typeof section.id !== 'string' || !/^[a-z0-9-]{2,40}$/.test(section.id) || seen.has(section.id)) invalid('each section needs a unique kebab-case id');
    if (typeof section.cityId !== 'string' || !/^[1-9][0-9]{3,9}$/.test(section.cityId)) invalid(`section ${section.id} needs a numeric cityId`);
    const locales = {};
    for (const lang of ['hu', 'en']) {
      const copy = section[lang];
      if (!copy || typeof copy.title !== 'string' || !copy.title.trim() || copy.title.length > 80
        || typeof copy.intro !== 'string' || copy.intro.trim().length < 40 || copy.intro.length > 400) invalid(`section ${section.id} needs a ${lang} title and a 40–400 character intro`);
      locales[lang] = { title: copy.title.trim(), intro: copy.intro.trim() };
    }
    seen.add(section.id);
    const url = new URL(widget.src);
    url.searchParams.set('city_id', section.cityId);
    return { id: section.id, cityId: section.cityId, src: url.href, ...locales };
  });
  return { widget, sections };
}

// Only these directives change, and only on this route.
export function widgetPolicy(widget) {
  return {
    scriptExtra: widget.hosts.script.map(host => ` ${host}`).join(''),
    imgExtra: widget.hosts.img.map(host => ` ${host}`).join(''),
    frameSrc: widget.hosts.frame.join(' '),
    connectExtra: widget.hosts.connect,
  };
}

const copy = {
  hu: {
    eye: 'ÉLMÉNYEK / FOGLALHATÓ PROGRAMOK', title: 'Amit<br><em>csinálni fogsz.</em>',
    intro: 'Foglalható belépők, séták és vezetett programok városonként. Az árat, az időpontokat és a feltételeket a foglalási oldal mutatja.',
    source: 'A programlistákat partnerünk állítja össze és frissíti; a kínálat nem teljes, és tételesen nem ellenőrizzük. A listák angol nyelvűek, az árak euróban értendők. A foglalás és a fizetés a szolgáltató oldalán történik.',
    affiliate: 'Partneri programlista. A rajta keresztüli foglalás után jutalékot kaphatunk; ez nem befolyásolja, mit írunk.',
    fallback: 'A programlisták betöltéséhez JavaScript szükséges.',
    guides: 'Utazási útmutatók', lastMinute: 'Last minute jegyárak',
  },
  en: {
    eye: 'EXPERIENCES / BOOKABLE THINGS TO DO', title: 'What you<br><em>will actually do.</em>',
    intro: 'Bookable tickets, walks and guided activities, city by city. Prices, times and conditions are shown on the booking page.',
    source: 'These lists are compiled and updated by our partner; the selection is not exhaustive and we do not verify it item by item. Prices are shown in euro. Booking and payment take place on the provider’s website.',
    affiliate: 'Partner activity list. We may earn a commission on bookings made through it; it does not influence what we write.',
    fallback: 'The activity lists require JavaScript.',
    guides: 'Travel guides', lastMinute: 'Last-minute fares',
  },
};

export function experiencesPage({ sections }, lang = 'hu') {
  const language = lang === 'en' ? 'en' : 'hu', text = copy[language];
  if (!Array.isArray(sections) || !sections.length) invalid('at least one section is required to render the page');
  return `<div id="trip-experiences" class="flights-page container"><section class="flights-hero"><div><p class="flights-eyebrow">${text.eye}</p><h1>${text.title}</h1></div><div><p>${text.intro}</p><small>${text.source}</small></div></section>${sections.map(section => `<section class="experiences-block" aria-labelledby="experience-${section.id}"><h2 id="experience-${section.id}">${escape(section[language].title)}</h2><p>${escape(section[language].intro)}</p><div class="experiences-widget"><script async src="${escape(section.src)}" charset="utf-8"></script></div><small class="experiences-disclosure">${text.affiliate}</small></section>`).join('')}<p class="flights-more"><a href="/${language}/last-minute/">${text.lastMinute} ↗</a> · <a href="/${language}/blog/">${text.guides} ↗</a></p><noscript><p>${text.fallback}</p></noscript></div>`;
}
