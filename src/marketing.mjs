// The Meta pixel, and the one thing it can honestly measure.
//
// A booking happens on the tour operator's site, which will never report
// back to our pixel. So there is no Purchase event to optimise on, and
// pretending otherwise is how an affiliate budget disappears. The closest
// true signal we own is the moment someone leaves for the operator, and
// that is what this sends.
//
// PIXEL_ID is empty until a real account exists. Empty means: no script, no
// widened policy, no banner about tracking that does not happen.
export const PIXEL_ID = '1628810374927155';
export const PIXEL_HOSTS = {
  script: 'https://connect.facebook.net',
  image: 'https://www.facebook.com',
  connect: 'https://www.facebook.com',
};
export const OUTBOUND_EVENT = 'OutboundOffer';

export const pixelConfigured = id => /^\d{6,20}$/.test(id ?? '');

// Meta's own snippet, as a module rather than inline script: the page policy
// pins its inline code by hash and allows nothing else.
function boot(id) {
  if (globalThis.fbq) return globalThis.fbq;
  const fbq = function (...args) { fbq.callMethod ? fbq.callMethod(...args) : fbq.queue.push(args); };
  fbq.push = fbq; fbq.loaded = true; fbq.version = '2.0'; fbq.queue = [];
  globalThis.fbq = globalThis._fbq = fbq;
  const script = document.createElement('script');
  script.async = true;
  script.src = `${PIXEL_HOSTS.script}/en_US/fbevents.js`;
  document.head.append(script);
  fbq('init', id);
  return fbq;
}

export function initPixel(id = PIXEL_ID) {
  if (!pixelConfigured(id) || typeof document === 'undefined') return null;
  const fbq = boot(id);
  fbq('track', 'PageView');
  // Every offer link is rel="sponsored": this is the hand-off to the
  // operator, and the last thing we can see.
  document.addEventListener('click', event => {
    const link = event.target.closest('a[rel~="sponsored"]');
    if (!link) return;
    fbq('trackCustom', OUTBOUND_EVENT, {
      destination: link.closest('[data-country]')?.dataset.country ?? '',
      value: Number(link.closest('[data-price]')?.dataset.price) || undefined,
      currency: 'HUF',
    });
  }, { capture: true });
  return fbq;
}
