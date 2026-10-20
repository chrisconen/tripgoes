const currencies = ['HUF', 'EUR', 'USD', 'GBP', 'CHF'];
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const iso = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const string = (value, max = 120) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const currency = value => typeof value === 'string' && /^[A-Z]{3}$/.test(value);
const price = value => Number.isSafeInteger(value) && value >= 0;
const fail = () => { throw new TypeError('Invalid offer response.'); };

export function safeBookingUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}

function validateSource(value) {
  if (!object(value) || !identifier(value.id) || !string(value.name, 160) || !['editorial', 'provider'].includes(value.kind)) fail();
  return { id: value.id, name: value.name, kind: value.kind };
}

export function validateOffersPayload(data, now = Date.parse(data?.asOf)) {
  if (!object(data) || !iso(data.asOf) || !Array.isArray(data.offers) || data.offers.length > 20 || typeof data.hasMore !== 'boolean' || !Number.isFinite(now)) fail();
  const seen = new Set();
  const offers = data.offers.map(item => {
    if (!object(item) || !identifier(item.id) || seen.has(item.id) || !string(item.title, 240) || !string(item.origin) || !string(item.destination)
      || !day(item.departureDate) || !day(item.returnDate) || item.returnDate < item.departureDate
      || !Number.isInteger(item.travelers) || item.travelers < 1 || item.travelers > 999
      || !currency(item.currency) || !price(item.totalPriceMinor) || !safeBookingUrl(item.bookingUrl)
      || !iso(item.observedAt) || !iso(item.expiresAt) || Date.parse(item.expiresAt) <= Date.parse(item.observedAt)
      || Date.parse(item.observedAt) > Date.parse(data.asOf)
      || !string(item.inclusions, 3000)) fail();
    seen.add(item.id);
    return {
      id: item.id, title: item.title, origin: item.origin, destination: item.destination,
      departureDate: item.departureDate, returnDate: item.returnDate, travelers: item.travelers,
      currency: item.currency, totalPriceMinor: item.totalPriceMinor, bookingUrl: safeBookingUrl(item.bookingUrl),
      observedAt: item.observedAt, expiresAt: item.expiresAt, source: validateSource(item.source), inclusions: item.inclusions,
    };
  });
  const current = offers.filter(item => Date.parse(item.expiresAt) > now);
  return { asOf: data.asOf, offers: current, hasMore: data.hasMore, expiredCount: offers.length - current.length };
}

export function validateHistoryPayload(data, expectedOffer) {
  if (!object(data) || !identifier(data.offerId) || !iso(data.asOf) || !currency(data.currency) || data.basis !== 'per_person'
    || !Array.isArray(data.history) || data.history.length > 500) fail();
  const source = validateSource(data.source);
  if (expectedOffer && (data.offerId !== expectedOffer.id || data.currency !== expectedOffer.currency || source.id !== expectedOffer.source.id || source.kind !== expectedOffer.source.kind)) fail();
  const history = data.history.map(item => {
    if (!object(item) || !iso(item.observedAt) || Date.parse(item.observedAt) > Date.parse(data.asOf) || !price(item.totalPriceMinor)) fail();
    return { observedAt: item.observedAt, totalPriceMinor: item.totalPriceMinor };
  }).sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
  return { offerId: data.offerId, asOf: data.asOf, currency: data.currency, basis: 'per_person', source, history };
}

/** Server time is trusted over HTTPS. Include the entire request duration as a
 * conservative expiry bound; a later response cannot rewind a known clock. */
export function createOfferClock(asOf, { requestStarted, receivedAt, monotonicNow = () => performance.now(), minimumTime = 0 } = {}) {
  if (!iso(asOf) || !Number.isFinite(requestStarted) || !Number.isFinite(receivedAt) || receivedAt < requestStarted || !Number.isFinite(minimumTime) || typeof monotonicNow !== 'function') fail();
  const atReceipt = Math.max(Date.parse(asOf) + receivedAt - requestStarted, minimumTime);
  let latest = atReceipt;
  return () => {
    const elapsed = monotonicNow() - receivedAt;
    if (!Number.isFinite(elapsed)) fail();
    latest = Math.max(latest, atReceipt + Math.max(0, elapsed));
    return latest;
  };
}

export function buildOffersUrl(apiBase, { origin = '', destination = '', currency: selectedCurrency = 'EUR' } = {}, historyId) {
  if (typeof apiBase !== 'string' || !apiBase.trim()) throw new TypeError('API configuration required.');
  const base = new URL(apiBase);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new TypeError('HTTPS API base required.');
  base.pathname = `${base.pathname.replace(/\/$/, '')}/v1/offers${historyId === undefined ? '' : `/${encodeURIComponent(historyId)}/history`}`;
  if (historyId !== undefined) { if (!identifier(historyId)) throw new TypeError('Invalid offer identifier.'); }
  else {
    if (typeof origin !== 'string' || origin.length > 120 || typeof destination !== 'string' || destination.length > 120 || !currencies.includes(selectedCurrency)) throw new TypeError('Invalid search filters.');
    if (origin.trim()) base.searchParams.set('origin', origin.trim());
    if (destination.trim()) base.searchParams.set('destination', destination.trim());
    base.searchParams.set('currency', selectedCurrency);
    base.searchParams.set('limit', '20');
  }
  return base.href;
}

const words = {
  hu: {
    eye: 'AJÁNLATOK / ADAT ÉS FORRÁS', title: 'Előbb a részletek.<br><em>Aztán a döntés.</em>',
    intro: 'Keress indulási város és úti cél szerint, majd nézd meg a teljes, egy főre megadott árat, a forrást és a megfigyelés időpontját.',
    scope: 'Az árakat és a kötelező díjakat a forrás közlése alapján mutatjuk. Ezeket nem ellenőrizzük függetlenül; a foglalásnál elérhető végleges feltételeket mindig a szolgáltatónál nézd meg.',
    origin: 'Indulási város', destination: 'Úti cél', optional: 'Opcionális; bármely város', currency: 'Pénznem', search: 'Ajánlatok keresése', refresh: 'Frissítés',
    privacy: 'A keresés gombnyomásra indul. A megadott városokat és pénznemet az ajánlat-API kapja meg. Nem küldünk sütit vagy belépési tokent, és nem mentjük a keresést az eszközre.',
    idle: 'A keresés még nem indult el.', idleBody: 'Választhatsz városokat, vagy üresen hagyhatod őket. Az ajánlatok csak keresés után jelennek meg.',
    unavailable: 'Az ajánlatkapcsolat jelenleg nincs beállítva.', unavailableBody: 'Innen most nem kérhető le élő ajánlat. A saját ajánlataidat a döntéstervezőben összevetheted, vagy folytathatod az olvasást.',
    empty: 'Most nincs megjeleníthető ajánlat.', emptyBody: 'A keresés nem adott érvényes, le nem járt rekordot. Ez nem jelenti azt, hogy az útvonalon nincs elérhető utazás.',
    error: 'Az ajánlatokat most nem sikerült lekérni.', errorBody: 'Ez kapcsolati vagy adathiba, nem üres találat. Próbáld meg újra a keresést.',
    loading: 'Ajánlatok lekérése…', loaded: 'Megjeleníthető ajánlatok:', results: 'A keresés eredménye', asOf: 'Válasz időpontja', more: 'További találatok is lehetnek. Szűkítsd a keresést; itt legfeljebb 20 ajánlat jelenik meg.',
    expired: 'A közben lejárt ajánlatokat eltávolítottuk. Új adatokhoz indíts frissítést.', invalid: 'Legfeljebb 120 karakteres városneveket és a felsorolt pénznemek egyikét add meg.',
    person: 'Teljes ár / fő', travelers: 'Az árhoz tartozó utazólétszám', dates: 'Utazás', observed: 'Forrás megfigyelése', expires: 'Érvényesség vége', editorial: 'Szerkesztőségi forrás', provider: 'Szolgáltatói forrás',
    included: 'A forrás szerint tartalmazza', booking: 'Ajánlat a szolgáltatónál', history: 'Ártörténet megtekintése', historyLoading: 'Ártörténet lekérése…', historyError: 'Az ártörténet most nem érhető el. Próbáld újra.', historyEmpty: 'Ehhez az ajánlathoz még nincs megjeleníthető ártörténet.',
    historyTitle: 'Rögzített árak / fő', historyNote: 'Az API által rögzített megfigyelések, nem folyamatos piacfigyelés. Az időpontok között az ár változhatott.', date: 'Megfigyelés időpontja', price: 'Teljes ár / fő',
    planner: 'Saját ajánlatok összevetése', journal: 'Utazási útmutatók', noJS: 'A kereséshez JavaScript szükséges. Az útmutatók nélküle is olvashatók.',
  },
  en: {
    eye: 'OFFERS / DATA AND SOURCE', title: 'First, the details.<br><em>Then, your decision.</em>',
    intro: 'Search by departure city and destination, then check the complete per-person price, its source and when it was observed.',
    scope: 'Prices and mandatory charges are shown as reported by the source. We do not independently verify them; always check final availability and conditions with the booking provider.',
    origin: 'Departure city', destination: 'Destination', optional: 'Optional; any city', currency: 'Currency', search: 'Search offers', refresh: 'Refresh',
    privacy: 'Searching starts only when you press a button. Your entered cities and currency are sent to the offers API. No cookies or login tokens are sent, and searches are not saved on your device.',
    idle: 'Your search has not started yet.', idleBody: 'Choose cities or leave them blank. Offers appear only after you search.',
    unavailable: 'The offers connection is not configured.', unavailableBody: 'Live offers cannot be retrieved here right now. Compare your own options in the planner, or continue reading the guides.',
    empty: 'No offers are available to display right now.', emptyBody: 'The search returned no valid, unexpired records. This does not mean that no travel is available on the route.',
    error: 'Offers could not be retrieved right now.', errorBody: 'This is a connection or data error, not an empty search result. Please try searching again.',
    loading: 'Retrieving offers…', loaded: 'Offers available to display:', results: 'Search results', asOf: 'Response time', more: 'More results may exist. Narrow your search; a maximum of 20 offers is shown here.',
    expired: 'Offers that expired while you were here have been removed. Refresh to request new data.', invalid: 'Use city names of up to 120 characters and one of the listed currencies.',
    person: 'Complete price / person', travelers: 'Traveller count for this price', dates: 'Travel dates', observed: 'Source observation', expires: 'Expires', editorial: 'Editorial source', provider: 'Provider source',
    included: 'Included according to the source', booking: 'View offer with provider', history: 'View price history', historyLoading: 'Retrieving price history…', historyError: 'Price history is unavailable right now. Please try again.', historyEmpty: 'There is no price history to display for this offer yet.',
    historyTitle: 'Recorded prices / person', historyNote: 'Observations recorded by the API, not continuous market monitoring. Prices may have changed between observations.', date: 'Observation time', price: 'Complete price / person',
    planner: 'Compare your own offers', journal: 'Travel guides', noJS: 'Searching needs JavaScript. The guides remain readable without it.',
  },
};
const locale = lang => lang === 'en' ? 'en-GB' : 'hu-HU';
const dateTime = (value, lang) => `${new Intl.DateTimeFormat(locale(lang), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value))} UTC`;
const formatMoney = (minor, code, lang) => new Intl.NumberFormat(locale(lang), { style: 'currency', currency: code }).format(minor / (10 ** new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits));
const links = (lang, text) => `<div class="offers-next"><a href="/${lang}/planner/">${text.planner} ↗</a><a href="/${lang}/blog/">${text.journal} ↗</a></div>`;
const stateHTML = (state, text, lang) => `<div class="offers-state"><span class="offers-state-mark" aria-hidden="true">↗</span><h3>${text[state]}</h3><p>${text[`${state}Body`]}</p>${links(lang, text)}</div>`;

export function renderOfferCard(offer, lang = 'hu', now) {
  const language = lang === 'en' ? 'en' : 'hu';
  const text = words[language];
  const validated = validateOffersPayload({ asOf: new Date(now).toISOString(), offers: [offer], hasMore: false }, now).offers[0];
  if (!validated) return '';
  const item = validated;
  return `<article class="offers-card" data-offer-id="${escape(item.id)}"><div class="offers-card-head"><p class="offers-source">${text[item.source.kind]} · ${escape(item.source.name)}</p><h3>${escape(item.title)}</h3><p class="offers-route">${escape(item.origin)} <span aria-hidden="true">→</span> ${escape(item.destination)}</p></div><div class="offers-price"><small>${text.person}</small><strong>${escape(formatMoney(item.totalPriceMinor, item.currency, language))}</strong><span>${text.travelers}: ${item.travelers}</span></div><dl class="offers-facts"><div><dt>${text.dates}</dt><dd><time datetime="${item.departureDate}">${item.departureDate}</time> — <time datetime="${item.returnDate}">${item.returnDate}</time></dd></div><div><dt>${text.observed}</dt><dd><time datetime="${item.observedAt}">${dateTime(item.observedAt, language)}</time></dd></div><div><dt>${text.expires}</dt><dd><time datetime="${item.expiresAt}">${dateTime(item.expiresAt, language)}</time></dd></div></dl><div class="offers-inclusions"><h4>${text.included}</h4><p>${escape(item.inclusions)}</p></div><div class="offers-card-actions"><a class="offers-button offers-button-dark" href="${escape(item.bookingUrl)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${text.booking} ↗</a><button class="offers-button offers-button-outline" type="button" data-offer-history="${escape(item.id)}" aria-expanded="false" aria-controls="offer-history-${escape(item.id)}">${text.history}</button></div><div id="offer-history-${escape(item.id)}" class="offers-history" data-offer-history-result="${escape(item.id)}" hidden></div></article>`;
}

export function renderOfferHistory(data, lang = 'hu') {
  const language = lang === 'en' ? 'en' : 'hu';
  const text = words[language];
  const validated = validateHistoryPayload(data);
  if (!validated.history.length) return `<p>${text.historyEmpty}</p>`;
  return `<h4>${text.historyTitle}</h4><p>${text.historyNote}</p><p>${text.asOf}: ${dateTime(validated.asOf, language)}</p><div class="offers-table-wrap"><table><caption>${escape(validated.source.name)} · ${escape(validated.currency)}</caption><thead><tr><th scope="col">${text.date}</th><th scope="col">${text.price}</th></tr></thead><tbody>${validated.history.map(item => `<tr><td><time datetime="${item.observedAt}">${dateTime(item.observedAt, language)}</time></td><td>${escape(formatMoney(item.totalPriceMinor, validated.currency, language))}</td></tr>`).join('')}</tbody></table></div>`;
}

export function offersPage(lang = 'hu') {
  const language = lang === 'en' ? 'en' : 'hu';
  const text = words[language];
  return `<div id="trip-offers" class="offers-page container" data-offers-lang="${language}"><section class="offers-hero"><div><p class="offers-eyebrow">${text.eye}</p><h1>${text.title}</h1></div><div><p>${text.intro}</p><small>${text.scope}</small></div></section><form class="offers-search" data-offers-form><div class="offers-fields"><label for="offers-origin"><span>${text.origin}</span><input id="offers-origin" name="origin" type="text" value="${language === 'hu' ? 'Budapest' : ''}" maxlength="120" data-city-input autocomplete="off" placeholder="${text.optional}"></label><label for="offers-destination"><span>${text.destination}</span><input id="offers-destination" name="destination" type="text" maxlength="120" data-city-input autocomplete="off" placeholder="${text.optional}"></label><label for="offers-currency"><span>${text.currency}</span><select id="offers-currency" name="currency">${currencies.map(code => `<option value="${code}"${code === (language === 'hu' ? 'HUF' : 'EUR') ? ' selected' : ''}>${code}</option>`).join('')}</select></label><button type="submit" class="offers-button offers-button-dark" data-offers-submit disabled>${text.search}</button></div><p class="offers-privacy">${text.privacy}</p></form><section class="offers-results" aria-labelledby="offers-results-title"><div class="offers-results-heading"><h2 id="offers-results-title">${text.results}</h2><button class="offers-button offers-button-outline" type="button" data-offers-refresh hidden>${text.refresh}</button></div><p class="offers-status" data-offers-status role="status" aria-live="polite" aria-atomic="true"></p><div data-offers-results>${stateHTML('unavailable', text, language)}</div><noscript><p>${text.noJS}</p></noscript></section></div>`;
}

export function initOffers(lang, { apiBase } = {}) {
  if (typeof document === 'undefined') return false;
  const root = document.getElementById('trip-offers');
  if (!root || root.dataset.offersBound === 'true') return false;
  root.dataset.offersBound = 'true';
  const language = (lang || root.dataset.offersLang) === 'en' ? 'en' : 'hu';
  const text = words[language];
  const form = root.querySelector('[data-offers-form]');
  const results = root.querySelector('[data-offers-results]');
  const status = root.querySelector('[data-offers-status]');
  const submit = root.querySelector('[data-offers-submit]');
  const refresh = root.querySelector('[data-offers-refresh]');
  form.addEventListener('submit', event => event.preventDefault());
  try { buildOffersUrl(apiBase); } catch { return false; }
  submit.disabled = false;
  results.innerHTML = stateHTML('idle', text, language);
  let generation = 0;
  let controller;
  let expiryTimer;
  let offers = [];
  let lastFilters;
  let serverNow;
  const monotonicNow = () => performance.now();
  const histories = new Map();
  const stopHistory = () => { for (const request of histories.values()) request.abort(); histories.clear(); };
  const announce = message => { status.textContent = message; };
  const render = (payload) => {
    results.innerHTML = offers.length ? `<p class="offers-asof">${text.asOf}: ${dateTime(payload.asOf, language)}</p><div class="offers-grid">${offers.map(item => renderOfferCard(item, language, serverNow())).join('')}</div>${payload.hasMore ? `<p class="offers-more">${text.more}</p>` : ''}` : stateHTML('empty', text, language);
  };
  const removeExpired = () => {
    if (!serverNow) return;
    const now = serverNow();
    const expired = offers.filter(item => Date.parse(item.expiresAt) <= now);
    for (const item of expired) {
      histories.get(item.id)?.abort(); histories.delete(item.id);
      root.querySelector(`[data-offer-id="${item.id}"]`)?.remove();
    }
    offers = offers.filter(item => Date.parse(item.expiresAt) > now);
    if (expired.length) { if (!offers.length) results.innerHTML = stateHTML('empty', text, language); announce(text.expired); }
  };
  const watchExpiry = () => {
    clearTimeout(expiryTimer);
    if (!offers.length || !root.isConnected) return;
    const next = Math.min(...offers.map(item => Date.parse(item.expiresAt)));
    expiryTimer = setTimeout(() => {
      if (!root.isConnected) return;
      removeExpired();
      watchExpiry();
    }, Math.min(Math.max(next - serverNow() + 1, 1), 60_000));
  };
  const onVisibility = () => {
    if (document.visibilityState === 'visible' && root.isConnected) { removeExpired(); watchExpiry(); }
  };
  document.addEventListener('visibilitychange', onVisibility);
  const request = async filters => {
    let url;
    try { url = buildOffersUrl(apiBase, filters); } catch { announce(text.invalid); return; }
    const current = ++generation;
    controller?.abort(); stopHistory(); clearTimeout(expiryTimer);
    controller = new AbortController();
    offers = [];
    lastFilters = { ...filters };
    refresh.hidden = false;
    announce(text.loading);
    results.innerHTML = '';
    results.setAttribute('aria-busy', 'true');
    const requestStarted = monotonicNow();
    try {
      const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('HTTP response failed.');
      const raw = await response.json();
      const receivedAt = monotonicNow();
      if (current !== generation || !root.isConnected) return;
      const candidateClock = createOfferClock(raw?.asOf, { requestStarted, receivedAt, monotonicNow, minimumTime: serverNow?.() ?? 0 });
      const payload = validateOffersPayload(raw, candidateClock());
      serverNow = candidateClock;
      offers = payload.offers;
      render(payload);
      announce(`${text.loaded} ${offers.length}.${payload.expiredCount ? ` ${text.expired}` : ''}`);
      watchExpiry();
    } catch (error) {
      if (current !== generation || !root.isConnected || error.name === 'AbortError') return;
      results.innerHTML = stateHTML('error', text, language);
      announce(text.error);
    } finally { if (current === generation) results.setAttribute('aria-busy', 'false'); }
  };
  form.addEventListener('submit', event => {
    event.preventDefault();
    request({ origin: form.elements.origin.value, destination: form.elements.destination.value, currency: form.elements.currency.value });
  });
  refresh.addEventListener('click', () => { if (lastFilters) request(lastFilters); });
  results.addEventListener('click', async event => {
    const card = event.target.closest('[data-offer-id]');
    const clickedOffer = card && offers.find(item => item.id === card.dataset.offerId);
    if (clickedOffer && Date.parse(clickedOffer.expiresAt) <= serverNow()) {
      event.preventDefault();
      card.remove();
      offers = offers.filter(item => item.id !== clickedOffer.id);
      histories.get(clickedOffer.id)?.abort(); histories.delete(clickedOffer.id);
      if (!offers.length) results.innerHTML = stateHTML('empty', text, language);
      announce(text.expired); watchExpiry(); return;
    }
    const button = event.target.closest('[data-offer-history]');
    if (!button || !results.contains(button)) return;
    const id = button.dataset.offerHistory;
    const offer = offers.find(item => item.id === id);
    if (!offer || Date.parse(offer.expiresAt) <= serverNow()) { removeExpired(); watchExpiry(); return; }
    const area = root.querySelector(`[data-offer-history-result="${id}"]`);
    const current = generation;
    histories.get(id)?.abort();
    const historyController = new AbortController();
    histories.set(id, historyController);
    button.disabled = true;
    button.setAttribute('aria-expanded', 'true');
    area.hidden = false;
    area.textContent = text.historyLoading;
    area.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch(buildOffersUrl(apiBase, {}, id), { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: historyController.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('HTTP response failed.');
      const payload = validateHistoryPayload(await response.json(), offer);
      if (current !== generation || !root.isConnected || Date.parse(offer.expiresAt) <= serverNow()) { removeExpired(); return; }
      area.innerHTML = renderOfferHistory(payload, language);
    } catch (error) { if (current === generation && root.isConnected && error.name !== 'AbortError') area.textContent = text.historyError; }
    finally { if (histories.get(id) === historyController) { histories.delete(id); button.disabled = false; area.setAttribute('aria-busy', 'false'); } }
  });
  return () => { generation++; controller?.abort(); stopHistory(); clearTimeout(expiryTimer); document.removeEventListener('visibilitychange', onVisibility); };
}
