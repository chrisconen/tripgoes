const copy = {
  hu: {
    eyebrow: 'JÓ ÖTLETEK, KÖZÖS TERVEK',
    heading: 'Küldd tovább az útitársadnak.',
    description: 'Egy jó út egy beszélgetéssel kezdődik.',
    via: 'Megosztás itt:',
    newTab: 'új lapon nyílik meg',
    copy: 'Link másolása',
    native: 'További lehetőségek',
    copied: 'A linket a vágólapra másoltuk.',
    manual: 'Az automatikus másolás nem sikerült. Másold ki a kijelölt linket.',
    unavailable: 'A megosztó most nem érhető el. Másold ki a kijelölt linket.',
    field: 'Az oldal megosztható linkje',
    privacy: 'Az oldal linkjét osztod meg. A kereséseid és űrlapadataid nem kerülnek bele.',
  },
  en: {
    eyebrow: 'GOOD IDEAS, SHARED PLANS',
    heading: 'Send it to your travel companion.',
    description: 'A good trip starts with a conversation.',
    via: 'Share via',
    newTab: 'opens in a new tab',
    copy: 'Copy link',
    native: 'More sharing options',
    copied: 'Link copied to the clipboard.',
    manual: 'Automatic copying was unavailable. Copy the selected link.',
    unavailable: 'Sharing is unavailable right now. Copy the selected link.',
    field: 'Shareable page link',
    privacy: 'Share this page’s link. Your searches and form entries are not included.',
  },
};

const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

function canonicalURL(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new TypeError('Sharing requires an absolute public HTTPS canonical URL.'); }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port ||
      !host.includes('.') || host.startsWith('[') || /^\d+(?:\.\d+){3}$/.test(host) ||
      /(?:^|\.)(?:localhost|local|internal|test)$/.test(host)) {
    throw new TypeError('Sharing requires an absolute public HTTPS canonical URL.');
  }
  // Build-provided public routes only. Never forward search state or fragments.
  parsed.search = '';
  parsed.hash = '';
  return parsed;
}

function payload({ url, title = '', image = '' }) {
  const canonical = canonicalURL(url);
  let publicImage = '';
  if (image) {
    try {
      const candidate = canonicalURL(new URL(image, canonical).href);
      if (candidate.origin === canonical.origin) publicImage = candidate.href;
    } catch {
      // An optional image must never weaken the canonical URL boundary.
    }
  }
  return { url: canonical.href, title: String(title), image: publicImage };
}

function composer(base, parameters) {
  const result = new URL(base);
  for (const [key, value] of Object.entries(parameters)) result.searchParams.set(key, value);
  return result.href;
}

/** Pure link builder. Inputs must be public build metadata, never user-entered state. */
export function shareLinks(options) {
  const { url, title, image } = payload(options);
  return [
    { id: 'facebook', label: 'Facebook', url: composer('https://www.facebook.com/sharer/sharer.php', { u: url }) },
    { id: 'x', label: 'X', url: composer('https://x.com/intent/tweet', { url, text: title }) },
    { id: 'whatsapp', label: 'WhatsApp', url: composer('https://wa.me/', { text: `${title}${title ? '\n' : ''}${url}` }) },
    { id: 'telegram', label: 'Telegram', url: composer('https://t.me/share/url', { url, text: title }) },
    { id: 'linkedin', label: 'LinkedIn', url: composer('https://www.linkedin.com/sharing/share-offsite/', { url }) },
    { id: 'pinterest', label: 'Pinterest', url: composer('https://www.pinterest.com/pin/create/button/', {
      url, description: title, ...(image ? { media: image } : {}),
    }) },
  ];
}

const marks = { facebook: 'f', x: 'X', whatsapp: 'wa', telegram: 'tg', linkedin: 'in', pinterest: 'p' };
const linkIcon = '<svg class="share-symbol" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m10 13 4-4m-6 7-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 1)"/></svg>';
const shareIcon = '<svg class="share-symbol" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 15V3m-4 4 4-4 4 4M5 12v8h14v-8"/></svg>';

/** Render once per page; fixed IDs support an accessible, independent section. */
export function renderSharing({ url, title = '', image = '', lang = 'hu' }) {
  const language = lang === 'en' ? 'en' : 'hu';
  const text = copy[language];
  const data = payload({ url, title, image });
  const links = shareLinks(data).map(link => `<a class="share-link share-${link.id}" href="${escapeHTML(link.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" aria-label="${escapeHTML(`${text.via} ${link.label} (${text.newTab})`)}"><span class="share-mark" aria-hidden="true">${marks[link.id]}</span><span>${link.label}</span></a>`).join('');
  return `<section id="page-sharing" class="share-bar" aria-labelledby="share-heading" data-share-url="${escapeHTML(data.url)}" data-share-title="${escapeHTML(data.title)}" data-share-lang="${language}">
  <div class="share-intro"><p class="share-eyebrow">${text.eyebrow}</p><h2 id="share-heading" class="share-heading">${text.heading}</h2><p class="share-description">${text.description}</p></div>
  <div class="share-controls"><div class="share-networks">${links}</div>
  <div class="share-actions"><button type="button" class="share-button share-copy" data-share-copy hidden>${linkIcon}<span>${text.copy}</span></button><button type="button" class="share-button share-native" data-share-native hidden>${shareIcon}<span>${text.native}</span></button></div>
  <p class="share-privacy">${text.privacy}</p>
  <div class="share-fallback" data-share-fallback><label class="share-field-label" for="share-manual-url">${text.field}</label><input id="share-manual-url" class="share-input" type="url" value="${escapeHTML(data.url)}" readonly spellcheck="false" aria-describedby="share-status"></div>
  <p id="share-status" class="share-status" role="status" aria-live="polite" aria-atomic="true"></p></div>
</section>`;
}

/** Progressive enhancement. Does not read location, search fields, forms or storage. */
export function initSharing(lang) {
  if (typeof document === 'undefined') return false;
  const root = document.getElementById('page-sharing');
  if (!root || root.dataset.shareBound === 'true') return false;
  const text = copy[(lang || root.dataset.shareLang) === 'en' ? 'en' : 'hu'];
  let data;
  try { data = payload({ url: root.dataset.shareUrl, title: root.dataset.shareTitle }); }
  catch { return false; }
  const copyButton = root.querySelector('[data-share-copy]');
  const nativeButton = root.querySelector('[data-share-native]');
  const fallback = root.querySelector('[data-share-fallback]');
  const input = root.querySelector('#share-manual-url');
  const status = root.querySelector('#share-status');
  if (!copyButton || !nativeButton || !fallback || !input || !status) return false;
  root.dataset.shareBound = 'true';
  const nav = globalThis.navigator;
  input.value = data.url;
  fallback.hidden = true;
  copyButton.hidden = false;
  const showManual = message => {
    fallback.hidden = false;
    input.value = data.url;
    status.textContent = message;
    input.focus();
    input.select();
  };
  copyButton.addEventListener('click', async () => {
    copyButton.disabled = true;
    status.textContent = '';
    try {
      if (typeof nav?.clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable');
      await nav.clipboard.writeText(data.url);
      fallback.hidden = true;
      status.textContent = text.copied;
    } catch {
      showManual(text.manual);
    } finally {
      copyButton.disabled = false;
    }
  });
  const nativeData = { url: data.url, title: data.title };
  let nativeAvailable = typeof nav?.share === 'function' && globalThis.isSecureContext !== false;
  if (nativeAvailable && typeof nav.canShare === 'function') {
    try { nativeAvailable = nav.canShare(nativeData); } catch { nativeAvailable = false; }
  }
  nativeButton.hidden = !nativeAvailable;
  if (nativeAvailable) nativeButton.addEventListener('click', async () => {
    nativeButton.disabled = true;
    status.textContent = '';
    try {
      await nav.share(nativeData);
      // Resolution does not prove publication. Do not announce a fabricated post.
    } catch (error) {
      if (error?.name !== 'AbortError') showManual(text.unavailable);
    } finally {
      nativeButton.disabled = false;
    }
  });
  return true;
}
