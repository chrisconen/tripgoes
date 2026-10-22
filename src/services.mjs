import {searchUrl} from './tools.mjs';
// Partner service widgets: eSIM, airport transfer, car hire, flight
// compensation. Unlike the experiences page these are four different vendors
// with four different parameter sets, so the validator checks what actually
// matters — the host, our attribution, and that the partner badge stays off —
// instead of an allowlist that would need editing for every new widget.
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const invalid = reason => { throw new TypeError(`Invalid service configuration: ${reason}`); };

export const WIDGET_HOSTS = ['tpscr.com', 'tp.media', 'www.travelpayouts.com'];
const HOST_KINDS = ['script', 'img', 'frame', 'connect'];
// Our affiliate identifiers. A widget without them earns nothing, which is a
// silent failure no page would ever show, so the build refuses it instead.
export const MARKER = '793137', TRS = '588496';

function origin(value) {
  let url;
  try { url = new URL(value); } catch { invalid(`${value} is not an absolute URL`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') invalid(`${value} must be a bare https origin`);
  return url.origin;
}

export function validateServices(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.widgets) || !data.widgets.length || data.widgets.length > 12) invalid('version 1 and 1–12 widgets are required');
  const seen = new Set();
  const widgets = data.widgets.map(widget => {
    if (!widget || typeof widget.id !== 'string' || !/^[a-z0-9-]{2,40}$/.test(widget.id) || seen.has(widget.id)) invalid('each widget needs a unique kebab-case id');
    seen.add(widget.id);
    if (typeof widget.src !== 'string' || widget.src.length > 1200) invalid(`widget ${widget.id} needs a src`);
    let url;
    try { url = new URL(widget.src); } catch { invalid(`widget ${widget.id} has an unparseable src`); }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) invalid(`widget ${widget.id} must be a plain https URL`);
    if (!WIDGET_HOSTS.includes(url.hostname)) invalid(`widget ${widget.id} is on the unknown host ${url.hostname}`);
    if (url.searchParams.get('shmarker') !== MARKER || url.searchParams.get('trs') !== TRS) invalid(`widget ${widget.id} is missing our affiliate identifiers`);
    // The badge names the supplier, which is exactly what these pages avoid.
    if (url.searchParams.has('powered_by') && url.searchParams.get('powered_by') !== 'false') invalid(`widget ${widget.id} must set powered_by=false`);
    for (const [name, value] of url.searchParams) if (value.includes('://')) invalid(`widget ${widget.id} parameter ${name} carries a URL`);
    const hosts = {};
    for (const kind of HOST_KINDS) {
      const list = widget.hosts?.[kind];
      if (!Array.isArray(list) || list.length > 8) invalid(`widget ${widget.id} needs a hosts.${kind} list`);
      hosts[kind] = list.map(origin);
    }
    if (Object.keys(widget.hosts ?? {}).some(kind => !HOST_KINDS.includes(kind))) invalid(`widget ${widget.id} declares an unknown host kind`);
    if (!hosts.script.includes(url.origin)) invalid(`widget ${widget.id} must declare its own origin as a script host`);
    const copy = {};
    for (const lang of ['hu', 'en']) {
      const text = widget[lang];
      if (!text || typeof text.title !== 'string' || !text.title.trim() || text.title.length > 80
        || typeof text.intro !== 'string' || text.intro.trim().length < 40 || text.intro.length > 400) invalid(`widget ${widget.id} needs a ${lang} title and a 40–400 character intro`);
      copy[lang] = { title: text.title.trim(), intro: text.intro.trim() };
    }
    return { id: widget.id, src: url.href, hosts, ...copy };
  });
  return { widgets };
}

// The union across every widget on the page, and only on this route.
export function servicePolicy({ widgets }) {
  const collect = kind => [...new Set(widgets.flatMap(widget => widget.hosts[kind]))].sort();
  return {
    scriptExtra: collect('script').map(host => ` ${host}`).join(''),
    imgExtra: collect('img').map(host => ` ${host}`).join(''),
    frameSrc: collect('frame').join(' ') || "'none'",
    connectExtra: collect('connect'),
    // These widgets style themselves with inline <style> and style attributes,
    // including inside a shadow root. On a route that already runs four
    // third-party scripts with full DOM access, refusing their CSS buys
    // nothing; it stays off every other page.
    styleExtra: " 'unsafe-inline'",
  };
}

const copy = {
  hu: {
    eye: 'ÚTIKELLÉKEK', heading: 'A repülőjegy<br><em>még nem az egész út.</em>',
    intro: 'Mobilnet, transzfer, bérautó és kártérítés — a négy dolog, ami a jegyfoglalás után jön. Mindegyik a szolgáltató saját felületén zárul.',
    source: 'A keresést és a foglalást partnereink felülete végzi; az árakat és a feltételeket ők állítják, mi nem ellenőrizzük tételesen. A felületek angol nyelvűek.',
    fallback: 'A keresőkhöz JavaScript szükséges.',
    more: 'Jegykereső', experiences: 'Foglalható programok',
  },
  en: {
    eye: 'TRAVEL ESSENTIALS', heading: 'The ticket<br><em>is not the whole trip.</em>',
    intro: 'Mobile data, a transfer, a rental car and compensation — the four things that come after the ticket. Each finishes on the provider’s own site.',
    source: 'Search and booking run on our partners’ interfaces; they set the prices and conditions, and we do not verify them item by item. The interfaces are in English.',
    fallback: 'The search forms require JavaScript.',
    more: 'Flight search', experiences: 'Bookable activities',
  },
};

export function servicesPage({ widgets }, lang = 'hu') {
  const language = lang === 'en' ? 'en' : 'hu', text = copy[language];
  if (!Array.isArray(widgets) || !widgets.length) invalid('at least one widget is required to render the page');
  const blocks = widgets.map(widget => `<section class="service-block" aria-labelledby="service-${widget.id}"><h2 id="service-${widget.id}">${escape(widget[language].title)}</h2><p>${escape(widget[language].intro)}</p><div class="service-widget"><script async src="${escape(widget.src)}" charset="utf-8"></script></div></section>`).join('');
  return `<div id="trip-services" class="flights-page container"><section class="flights-hero"><div><p class="flights-eyebrow">${text.eye}</p><h1>${text.heading}</h1></div><div><p>${text.intro}</p><small>${text.source}</small></div></section>${blocks}<p class="flights-more"><a href="${searchUrl(language)}">${text.more} ↗</a> · <a href="/${language}/experiences/">${text.experiences} ↗</a></p><noscript><p>${text.fallback}</p></noscript></div>`;
}
