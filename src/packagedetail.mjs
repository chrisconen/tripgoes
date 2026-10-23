// The detail panel behind a package card.
//
// A card is one link to the booking page, so the details cannot open from
// inside it: an interactive control inside a link is invalid markup and a
// keyboard trap. A button beside the link opens a native <dialog> instead,
// which brings the focus trap, the Esc key and the backdrop with no code of
// ours, and leaves the card itself exactly as it was.
//
// Everything the panel shows is already in the page: the card's own data
// attributes and its rendered price markup. Opening one costs no request, so
// it works on a flaky connection, and the panel can never disagree with the
// card it came from.
import { tagOffers, visitCampaign } from './campaign.mjs';

const copy = {
  hu: {
    details: 'Részletek', close: 'Bezárás', photo: n => `${n}. kép`,
    when: 'Időpont', length: 'Hossz', nights: n => `${n} éjszaka`,
    food: 'Ellátás', travel: 'Utazás', type: 'Típus', off: 'Kedvezmény',
    go: 'Megnyitom az ajánlatot', hotel: 'A szálláshely többi időpontja', map: 'Hol van? Térkép',
  },
  en: {
    details: 'Details', close: 'Close', photo: n => `Photo ${n}`,
    when: 'Dates', length: 'Length', nights: n => `${n} nights`,
    food: 'Board', travel: 'Travel', type: 'Type', off: 'Discount',
    go: 'Open the offer', hotel: 'Other dates at this property', map: 'Where is it? Map',
  },
};

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// The price strings are our own build-time markup, already escaped there, so
// they travel as HTML. The card's trailing "open ↗" cue is cut: the panel has
// a real button for that, and two calls to action say less than one.
const priceMarkup = value => String(value ?? '').replace(/<em>[\s\S]*?<\/em>/g, '');

const dates = (from, to, lang) => {
  const locale = lang === 'en' ? 'en-GB' : 'hu-HU';
  const day = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const start = Date.parse(from), end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '';
  return `${day.format(new Date(start))} – ${day.format(new Date(end))}`;
};

const row = (label, value) => (value ? `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>` : '');

// OpenStreetMap rather than an embedded map: an embed would pull a third
// party into every page view and need its own consent, while a link sends
// nothing until someone chooses to follow it.
const mapLink = coords => {
  const [lat, lng] = String(coords ?? '').split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return '';
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=14/${lat}/${lng}`;
};

export function detailMarkup(offer, lang = 'hu') {
  const text = copy[lang === 'en' ? 'en' : 'hu'];
  const photos = (offer.photos ?? []).filter(Boolean);
  const map = mapLink(offer.coords);
  const strip = photos.length > 1
    ? `<ul class="pkg-detail-thumbs">${photos.map((photo, index) =>
        `<li><button type="button" class="pkg-detail-thumb${index ? '' : ' on'}" data-photo="${escape(photo)}"`
        + ` aria-label="${escape(text.photo(index + 1))}"><img src="${escape(photo)}" alt="" loading="lazy" decoding="async"></button></li>`).join('')}</ul>`
    : '';
  return `<button type="button" class="pkg-detail-close" data-close aria-label="${escape(text.close)}">×</button>`
    + `<div class="pkg-detail-body">`
    + `<figure class="pkg-detail-gallery">`
    + `<img class="pkg-detail-photo" src="${escape(photos[0] ?? '')}" alt="" width="450" height="300" decoding="async">`
    + strip
    + `</figure>`
    + `<div class="pkg-detail-facts">`
    + (offer.where ? `<p class="pkg-detail-where">${escape(offer.where)}</p>` : '')
    + `<h2 id="pkg-detail-title">${escape(offer.hotel ?? '')}`
    + (offer.stars > 0 ? ` <span class="pkg-stars" aria-label="${offer.stars}">${'★'.repeat(Math.round(offer.stars))}</span>` : '')
    + `</h2>`
    + `<dl class="pkg-detail-list">`
    + row(text.when, dates(offer.from, offer.to, lang))
    + row(text.length, offer.nights > 0 ? text.nights(offer.nights) : '')
    + row(text.food, offer.food)
    + row(text.travel, offer.depart)
    + row(text.type, offer.type)
    + row(text.off, offer.discount >= 10 ? `−${offer.discount}%` : '')
    + `</dl>`
    + `<p class="pkg-detail-price">${priceMarkup(offer.price)}</p>`
    + (offer.unit ? `<p class="pkg-detail-unit">${priceMarkup(offer.unit)}</p>` : '')
    + (offer.note ? `<p class="pkg-detail-note">${escape(offer.note)}</p>` : '')
    + `<a class="pkg-detail-go" href="${escape(offer.href ?? '')}" rel="sponsored noopener" target="_blank">${escape(text.go)} ↗</a>`
    + (offer.hotelUrl || map
      ? `<p class="pkg-detail-links">`
        + (offer.hotelUrl ? `<a href="${escape(offer.hotelUrl)}" rel="sponsored noopener" target="_blank">${escape(text.hotel)} ↗</a>` : '')
        + (map ? `<a href="${escape(map)}" rel="noopener" target="_blank">${escape(text.map)} ↗</a>` : '')
        + `</p>`
      : '')
    + `</div></div>`;
}

// What the panel needs, read off the card that was clicked.
export function offerFromCard(card, note = '') {
  const link = card.querySelector('a[rel~="sponsored"]'), image = card.querySelector('img');
  const photos = [image?.getAttribute('src'),
    ...(card.dataset.photos ?? '').split('|'), ...(card.dataset.more ?? '').split('|')].filter(Boolean);
  return {
    hotel: card.querySelector('strong')?.textContent ?? '',
    where: card.querySelector('.pkg-where')?.textContent ?? '',
    depart: card.querySelector('.pkg-depart')?.textContent ?? '',
    // Already rewritten by the campaign tagger, so the label travels on.
    href: link?.href ?? '',
    price: card.querySelector('.pkg-price')?.innerHTML ?? '',
    unit: card.querySelector('.pkg-unit')?.innerHTML ?? '',
    stars: Number(card.dataset.stars) || 0,
    nights: Number(card.dataset.nights) || 0,
    discount: Number(card.dataset.discount) || 0,
    food: card.dataset.board || card.dataset.food || '', type: card.dataset.type ?? '',
    from: card.dataset.from ?? '', to: card.dataset.to ?? '',
    coords: card.dataset.coords ?? '', hotelUrl: card.dataset.hotelUrl ?? '',
    photos, note,
  };
}

export function initPackageDetail(lang = 'hu', root = document) {
  const grid = root.querySelector('.pkg-grid');
  if (!grid || typeof root.createElement !== 'function') return null;
  const dialog = root.createElement('dialog');
  dialog.className = 'pkg-detail';
  dialog.setAttribute('aria-labelledby', 'pkg-detail-title');
  root.body.append(dialog);
  // The grid already prints when the prices were read; the panel repeats it
  // rather than inventing a second, quieter version of the same caveat.
  const note = root.querySelector('.pkg-note')?.textContent?.trim() ?? '';
  // The trigger ships hidden, so a card without this script never offers a
  // button that would do nothing.
  for (const button of root.querySelectorAll('.pkg-more')) button.hidden = false;

  const close = () => { if (dialog.open) dialog.close(); };
  root.addEventListener('click', event => {
    const opener = event.target.closest?.('.pkg-more');
    if (opener) {
      const card = opener.closest('.pkg-card');
      if (!card) return;
      dialog.innerHTML = detailMarkup(offerFromCard(card, note), lang);
      // A link built after the page loaded missed the tagger's single pass.
      tagOffers(visitCampaign(), dialog);
      if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.open = true;
      return;
    }
    if (!dialog.open) return;
    if (event.target.closest?.('[data-close]')) return close();
    // Clicking the backdrop lands on the dialog itself, never on its content.
    if (event.target === dialog) return close();
    const thumb = event.target.closest?.('.pkg-detail-thumb');
    if (thumb) {
      const photo = dialog.querySelector('.pkg-detail-photo');
      if (photo) photo.src = thumb.dataset.photo;
      for (const other of dialog.querySelectorAll('.pkg-detail-thumb')) other.classList.toggle('on', other === thumb);
    }
  });
  return dialog;
}
