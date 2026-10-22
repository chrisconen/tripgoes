// Which advert produced a booking.
//
// The booking happens on the operator's site, so our pixel can never see it
// — but their affiliate report can. Its order detail has a Data1 column,
// filled from an `adata1` parameter on the link we hand over. So the
// campaign label travels with the hand-off, and the report can be filtered
// by it.
//
// This is a commercial label on a referral we already make, not a profile of
// a visitor: no identifier, nothing sent to a third party, and it carries
// only what the arriving URL itself announced.
export const PARAM = 'adata1';
export const KEY = 'tripgoes-campaign';
const LIMIT = 40;

// The value lands in someone else's report and arrives from a query string,
// so it is reduced to a short slug or to nothing at all.
export const clean = value => String(value ?? '')
  .toLowerCase()
  // "Október" is worth reading back as oktober rather than okt-ber: the
  // accents come off before the rest is dropped.
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, LIMIT)
  .replace(/-+$/, '');

export function campaignFrom(search = '') {
  const query = new URLSearchParams(search);
  return clean(query.get('utm_campaign') || query.get('utm_source')
    || (query.has('fbclid') ? 'facebook' : ''));
}

const store = given => { try { return given ?? globalThis.sessionStorage; } catch { return null; } };

// Remembered for the visit: the label arrives on the landing page, and the
// click that matters usually happens a page or two later.
export function visitCampaign(search = location.search, storage) {
  const arriving = campaignFrom(search);
  try {
    if (arriving) store(storage)?.setItem(KEY, arriving);
    else return clean(store(storage)?.getItem(KEY));
  } catch { /* private mode, or storage refused: the label is simply lost */ }
  return arriving;
}

// Tagged once, on load, rather than on click: a middle-click and a
// ctrl-click open the href too, and neither is an ordinary click event.
export function tagOffers(label, root = document) {
  if (!label) return 0;
  let tagged = 0;
  for (const link of root.querySelectorAll('a[rel~="sponsored"]')) {
    try {
      const url = new URL(link.href);
      url.searchParams.set(PARAM, label);
      link.href = url.toString();
      tagged += 1;
    } catch { /* not a link we can rewrite */ }
  }
  return tagged;
}

export const initCampaign = () => tagOffers(visitCampaign());
