// Consent for non-essential tracking.
//
// The site ships no trackers at all today. The moment one arrives it sets
// cookies and sends data to a third party, which under GDPR needs consent
// given first — not assumed, and not extracted.
//
// So: nothing loads until someone says yes, the two answers carry equal
// weight, and a decision is remembered rather than asked again. No
// pre-ticked boxes, no greyed-out refusal, no second banner for the people
// who already said no.
export const CONSENT_KEY = 'tripgoes-consent';
export const GRANTED = 'granted';
export const DENIED = 'denied';

const store = given => { try { return given ?? globalThis.localStorage; } catch { return null; } };

export function readConsent(storage) {
  try {
    const value = store(storage)?.getItem(CONSENT_KEY);
    return value === GRANTED || value === DENIED ? value : null;
  } catch { return null; }
}

export function writeConsent(value, storage) {
  if (value !== GRANTED && value !== DENIED) return false;
  try { store(storage)?.setItem(CONSENT_KEY, value); return true; } catch { return false; }
}

export const copy = {
  hu: {
    title: 'Mérhetjük, honnan érkezel?',
    text: 'Ehhez a Meta egy sütijét használnánk, hogy lássuk, melyik hirdetés hozott ide. Enélkül az oldal mindene működik; csak mi látunk kevesebbet.',
    yes: 'Elfogadom', no: 'Csak a szükségesek', more: 'Mit tárolunk?',
  },
  en: {
    title: 'May we measure where you arrived from?',
    text: 'That uses a Meta cookie so we can see which advert brought you here. Everything on the site works without it; we simply see less.',
    yes: 'Accept', no: 'Essential only', more: 'What we store',
  },
};

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function consentBanner(lang) {
  const language = lang === 'en' ? 'en' : 'hu', text = copy[language];
  // Both answers are plain buttons of the same size: refusing must be no
  // harder than agreeing.
  return `<div class="consent" role="dialog" aria-labelledby="consent-title" aria-describedby="consent-text">`
    + `<div><h2 id="consent-title">${escape(text.title)}</h2>`
    + `<p id="consent-text">${escape(text.text)}</p>`
    + `<a class="text-link" href="/${language}/cookies/">${escape(text.more)} ↗</a></div>`
    + `<div class="consent-actions">`
    + `<button type="button" class="button consent-no" data-consent="${DENIED}">${escape(text.no)}</button>`
    + `<button type="button" class="button consent-yes" data-consent="${GRANTED}">${escape(text.yes)}</button>`
    + `</div></div>`;
}

// Resolves once a decision exists, immediately when one was already made.
export function askConsent(lang, { onDecision } = {}) {
  if (typeof document === 'undefined') return;
  const decided = readConsent();
  if (decided) { onDecision?.(decided); return; }
  const host = document.createElement('div');
  host.className = 'consent-host';
  host.innerHTML = consentBanner(lang);
  host.addEventListener('click', event => {
    const choice = event.target.closest('[data-consent]')?.dataset.consent;
    if (!choice) return;
    writeConsent(choice);
    host.remove();
    onDecision?.(choice);
  });
  document.body.append(host);
}
