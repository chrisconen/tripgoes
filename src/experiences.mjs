// Partner booking widgets are third-party code. They never run in a TripGoes
// document: each one is served as its own sandboxed page under /widgets/, so the
// site keeps its pinned script policy and a widget cannot read this origin.
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const invalid = reason => { throw new TypeError(`Invalid experience configuration: ${reason}`); };

// Hosts a widget snippet may load code from. Anything else fails the build.
export const WIDGET_SCRIPT_HOSTS = ['tp.media', 'www.travelpayouts.com', 'emrldco.com'];
const SCRIPT = /<script\b([^>]*)><\/script>/gi;
const ATTRIBUTE = /([a-z-]+)="([^"]*)"/gi;
const ALLOWED_ATTRIBUTES = ['src', 'async', 'defer', 'charset', 'type'];

export function validateWidgetEmbed(embed) {
  if (typeof embed !== 'string' || !embed.trim() || embed.length > 4000) invalid('embed must be a non-empty string under 4000 characters');
  if (/on[a-z]+\s*=/i.test(embed) || /<iframe|<style|<link|javascript:/i.test(embed)) invalid('embed may not contain inline handlers, frames, styles or javascript: URLs');
  const sources = [];
  let remainder = embed.replace(SCRIPT, (match, attributes) => {
    const found = {};
    for (const [, name, value] of attributes.matchAll(ATTRIBUTE)) {
      if (!ALLOWED_ATTRIBUTES.includes(name)) invalid(`script attribute ${name} is not allowed`);
      found[name] = value;
    }
    let url;
    try { url = new URL(found.src ?? ''); } catch { invalid('every script needs an absolute https src'); }
    if (url.protocol !== 'https:' || url.username || url.password || !WIDGET_SCRIPT_HOSTS.includes(url.hostname)) invalid(`script host ${url.hostname} is not an allowed widget host`);
    sources.push(url.href);
    return '';
  });
  // Besides scripts a snippet may only carry empty layout containers.
  remainder = remainder.replace(/<div\b[^>]*><\/div>/gi, '').replace(/<p\b[^>]*><\/p>/gi, '').trim();
  if (remainder) invalid('embed may only contain scripts and empty containers');
  if (!sources.length) invalid('embed contains no widget script');
  return { embed: embed.trim(), sources };
}

export function validateExperiences(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.sections) || !data.sections.length || data.sections.length > 12) invalid('version 1 and 1–12 sections are required');
  const seen = new Set();
  return data.sections.map(section => {
    if (!section || typeof section.id !== 'string' || !/^[a-z0-9-]{2,40}$/.test(section.id) || seen.has(section.id)) invalid('each section needs a unique kebab-case id');
    if (!Number.isInteger(section.height) || section.height < 160 || section.height > 1200) invalid(`section ${section.id} needs a height between 160 and 1200`);
    const locales = {};
    for (const lang of ['hu', 'en']) {
      const copy = section[lang];
      if (!copy || typeof copy.title !== 'string' || !copy.title.trim() || copy.title.length > 80
        || typeof copy.intro !== 'string' || copy.intro.trim().length < 40 || copy.intro.length > 400) invalid(`section ${section.id} needs a ${lang} title and a 40–400 character intro`);
      locales[lang] = { title: copy.title.trim(), intro: copy.intro.trim() };
    }
    seen.add(section.id);
    return { id: section.id, height: section.height, ...locales, ...validateWidgetEmbed(section.embed) };
  });
}

// The sandboxed document: scripts may run, popups may open in a normal tab, and
// without allow-same-origin the widget gets an opaque origin, so it cannot reach
// TripGoes storage or DOM. Its own policy is declared here, not site-wide.
export function widgetDocument(section, lang = 'hu') {
  const hosts = [...new Set(section.sources.map(href => new URL(href).origin))].join(' ');
  const policy = [
    "default-src 'none'",
    `script-src ${hosts} 'unsafe-inline'`,
    `style-src ${hosts} 'unsafe-inline'`,
    `img-src https: data:`,
    `connect-src ${hosts}`,
    `frame-src ${hosts}`,
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ');
  return `<!doctype html>
<html lang="${lang === 'en' ? 'en' : 'hu'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${policy.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])}">
<meta name="robots" content="noindex">
<title>${escape(section[lang === 'en' ? 'en' : 'hu'].title)}</title>
<style>:root{color-scheme:light}body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#fff}</style>
</head>
<body>
${section.embed}
</body>
</html>
`;
}

const copy = {
  hu: {
    eye: 'ÉLMÉNYEK / FOGLALHATÓ PROGRAMOK', title: 'Amit<br><em>csinálni fogsz.</em>',
    intro: 'Foglalható belépők, séták és kirándulások partnereink kínálatából, városonként. Az árakat és az elérhetőséget a foglalási oldal mutatja.',
    source: 'A programlisták a partnerek saját, külön keretben futó felületéről érkeznek; a tartalmukat nem mi állítjuk össze, és nem ellenőrizzük tételesen. A foglalás és a fizetés a szolgáltató oldalán történik.',
    affiliate: 'Partnerkeret. A programok lefoglalása után jutalékot kaphatunk; ez nem befolyásolja, mit írunk.',
    fallback: 'A programlista betöltéséhez JavaScript szükséges.',
    guides: 'Utazási útmutatók', lastMinute: 'Last minute jegyárak',
  },
  en: {
    eye: 'EXPERIENCES / BOOKABLE THINGS TO DO', title: 'What you<br><em>will actually do.</em>',
    intro: 'Bookable tickets, walks and day trips from our partners, city by city. Prices and availability are shown on the booking page.',
    source: 'These lists come from partners’ own interfaces, running in a separate frame. We do not compile or individually verify their contents. Booking and payment take place on the provider’s website.',
    affiliate: 'Partner frame. We may earn a commission on bookings made here; it does not influence what we write.',
    fallback: 'The activity list requires JavaScript.',
    guides: 'Travel guides', lastMinute: 'Last-minute fares',
  },
};

export function experiencesPage(sections, lang = 'hu') {
  const language = lang === 'en' ? 'en' : 'hu', text = copy[language];
  if (!Array.isArray(sections) || !sections.length) invalid('at least one section is required to render the page');
  return `<div id="trip-experiences" class="flights-page container"><section class="flights-hero"><div><p class="flights-eyebrow">${text.eye}</p><h1>${text.title}</h1></div><div><p>${text.intro}</p><small>${text.source}</small></div></section>${sections.map(section => `<section class="experiences-block" aria-labelledby="experience-${section.id}"><h2 id="experience-${section.id}">${escape(section[language].title)}</h2><p>${escape(section[language].intro)}</p><iframe class="experiences-frame" src="/widgets/${section.id}-${language}.html" title="${escape(section[language].title)}" height="${section.height}" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"></iframe><small class="experiences-disclosure">${text.affiliate}</small></section>`).join('')}<p class="flights-more"><a href="/${language}/last-minute/">${text.lastMinute} ↗</a> · <a href="/${language}/blog/">${text.guides} ↗</a></p><noscript><p>${text.fallback}</p></noscript></div>`;
}
