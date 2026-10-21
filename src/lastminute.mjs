import { safeFlightBookingUrl, validateFlightStatus, buildFlightsUrl, flightValue } from './flights.mjs';
import { createOfferClock } from './offers.mjs';

const { escape, isObject, iata, day, timestamp, invalid, currencies } = flightValue;
const REUSE_WINDOW = 21_600_000;
// ponytail: one fixed origin keeps a public board at seven provider requests per
// six hours and currency. Add an origin picker when the quota budget allows it.
export const LAST_MINUTE_ORIGIN = 'BUD';
export const lastMinuteCurrency = lang => lang === 'en' ? 'EUR' : 'HUF';

export function buildLastMinuteUrl(apiBase, query) {
  if (typeof apiBase !== 'string' || !apiBase.trim() || !isObject(query) || !iata(query.origin) || !currencies.includes(query.currency)) invalid();
  const url = new URL(apiBase);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) invalid();
  url.pathname = `${url.pathname.replace(/\/$/, '')}/v1/lastminute`;
  url.searchParams.set('origin', query.origin);
  url.searchParams.set('currency', query.currency);
  return url.href;
}

export function validateLastMinutePayload(data, expectedQuery) {
  if (!isObject(data) || !timestamp(data.asOf) || !timestamp(data.fetchedAt) || !timestamp(data.cacheUntil)
    || Date.parse(data.fetchedAt) > Date.parse(data.asOf) || Date.parse(data.cacheUntil) <= Date.parse(data.fetchedAt)
    || Date.parse(data.cacheUntil) - Date.parse(data.fetchedAt) > REUSE_WINDOW
    || !isObject(data.source) || data.source.id !== 'aviasales-data' || data.source.name !== 'Aviasales Data API' || data.source.kind !== 'cached_search' || data.source.maxProviderAgeHours !== 48
    || !isObject(data.query) || !iata(data.query.origin) || !currencies.includes(data.query.currency)
    || !Array.isArray(data.dates) || !data.dates.length || data.dates.length > 31 || data.dates.some((value, index) => !day(value) || (index > 0 && value <= data.dates[index - 1]))
    || !Array.isArray(data.deals) || data.deals.length > 20
    || !Number.isInteger(data.requestedDays) || data.requestedDays !== data.dates.length
    || !Number.isInteger(data.completedDays) || data.completedDays < 1 || data.completedDays > data.requestedDays) invalid();
  if (expectedQuery && (data.query.origin !== expectedQuery.origin || data.query.currency !== expectedQuery.currency)) invalid();
  const seen = new Set(), days = new Set();
  const deals = data.deals.map(item => {
    if (!isObject(item) || typeof item.id !== 'string' || !/^[a-f0-9]{64}$/.test(item.id) || seen.has(item.id)
      || !iata(item.origin) || !iata(item.destination) || item.origin === item.destination || days.has(item.departureAt?.slice?.(0, 10))
      || (item.originAirport !== null && !iata(item.originAirport)) || (item.destinationAirport !== null && !iata(item.destinationAirport))
      || (data.query.origin !== item.origin && data.query.origin !== item.originAirport)
      || !timestamp(item.departureAt) || !data.dates.includes(item.departureAt.slice(0, 10)) || item.returnAt !== null
      || !Number.isSafeInteger(item.priceMinor) || item.priceMinor < 0 || item.currency !== data.query.currency
      || !safeFlightBookingUrl(item.bookingUrl)) invalid();
    for (const key of ['transfers', 'durationMinutes']) if (item[key] !== null && (!Number.isInteger(item[key]) || item[key] < 0 || item[key] > 100_000)) invalid();
    for (const key of ['airline', 'flightNumber']) if (item[key] !== null && (typeof item[key] !== 'string' || !item[key].trim() || item[key].length > 40)) invalid();
    seen.add(item.id); days.add(item.departureAt.slice(0, 10));
    // returnAt stays in the normalized deal: rendering revalidates its own input,
    // and a one-way fare must keep its explicit null rather than become undefined.
    return { id: item.id, origin: item.origin, destination: item.destination, originAirport: item.originAirport, destinationAirport: item.destinationAirport, departureAt: item.departureAt, returnAt: null, priceMinor: item.priceMinor, currency: item.currency, airline: item.airline, flightNumber: item.flightNumber, transfers: item.transfers, durationMinutes: item.durationMinutes, bookingUrl: safeFlightBookingUrl(item.bookingUrl) };
  });
  // The board reports one fare per departure day, price ascending.
  if (deals.some((item, index) => index > 0 && item.priceMinor < deals[index - 1].priceMinor)) invalid();
  return { asOf: data.asOf, fetchedAt: data.fetchedAt, cacheUntil: data.cacheUntil, source: { id: 'aviasales-data', name: 'Aviasales Data API', kind: 'cached_search', maxProviderAgeHours: 48 }, query: { origin: data.query.origin, currency: data.query.currency }, dates: [...data.dates], deals, completedDays: data.completedDays, requestedDays: data.requestedDays };
}

const copy = {
  hu: {
    eye: 'LAST MINUTE / AVIASALES DATA API', title: 'Hét nap.<br><em>Egy döntés.</em>', intro: 'A következő hét indulási nap legolcsóbb tárolt egyirányú jegyára Budapestről, napi egy ajánlattal.',
    source: 'Gyorsítótárazott keresési adatok, legfeljebb 48 órás forrásablakból. Nem utazási csomag, nem tartalmaz szállást, és nem élő ár vagy foglalhatósági ígéret. Egy felnőtt, turistaosztály, csak odaút; a poggyász és a további díjak nem ismertek.',
    window: 'Vizsgált indulási napok', refresh: 'Lista frissítése', statusRetry: 'Kapcsolat újraellenőrzése',
    privacy: 'Az oldal megnyitásakor egy névtelen lekérés indul a TripGoes API-hoz. A lista hat órán át közös gyorsítótárból érkezik, felhasználói azonosítás nélkül.',
    checking: 'Az adatkapcsolat ellenőrzése…', checkingBody: 'A lista az ellenőrzés után töltődik be.', unconfigured: 'Az adatkapcsolat még nincs beállítva.', unconfiguredBody: 'A repülőjegy-adatforrás nincs bekapcsolva. Itt most nem mutatunk árakat vagy mintaajánlatokat.', unavailable: 'Az adatkapcsolat most nem érhető el.', unavailableBody: 'A kapcsolat állapotát nem sikerült ellenőrizni. Ez nem azt jelenti, hogy nincs járat.',
    loading: 'Tárolt árak lekérése a következő hét napra…', empty: 'Most nincs tárolt találat erre a hétre.', emptyBody: 'Az adatforrás nem adott vissza árat ezekre a napokra. Ez nem teljes járatlista, és nem bizonyítja, hogy nincs foglalható repülőjegy.',
    error: 'A listát most nem sikerült lekérni.', errorBody: 'Adatforrás- vagy kapcsolati hiba történt. Próbáld újra később; ezt nem kezeljük üres találatként.', limited: 'A lekérdezési korlátot most elértük.', limitedBody: 'Az adatforrás vagy a TripGoes átmeneti lekérdezési korlátja miatt most nem frissíthető a lista. Próbáld meg később.',
    stale: 'A lista újrahasználati ideje lejárt.', staleBody: 'Frissíts a gombbal újabb adatokért. Ez a TripGoes gyorsítótárának határa, nem a jegyárak lejárati ideje.',
    results: 'Legolcsóbb tárolt árak', count: 'Megjelenített napok', retrieved: 'API-lekérés ideje', reuse: 'TripGoes újrahasználati határ', timing: 'A lekérés ideje nem az ár felfedezésének időpontja. A forrás nem ad megbízható, egyedi ármegfigyelési időt.',
    partial: 'nap adatai hiányoznak a vizsgált hétből; a lista ennyivel kevesebb napra épül.',
    fare: 'Tárolt egyirányú jegyár · 1 felnőtt', departureLabel: 'Indulás', airport: 'Jelzett repülőterek', airline: 'Légitársaság / járat', stops: 'Átszállások', duration: 'Jelzett repülési idő', minutes: 'perc', unknown: 'Nem közölt',
    extras: 'A visszautat, a poggyászt és a további díjakat a szolgáltatónál állítsd össze és ellenőrizd. Teljes utazási költséget nem számolunk belőle, és TripScore-t sem adunk rá.', book: 'Ellenőrzés az Aviasales oldalán', affiliate: 'Partnerlink. A végleges árat és feltételeket a foglalási oldalon látod.',
    planner: 'Saját teljes költség megtervezése', flights: 'Saját repülőjegy-keresés', noJS: 'A listához JavaScript szükséges.',
  },
  en: {
    eye: 'LAST MINUTE / AVIASALES DATA API', title: 'Seven days.<br><em>One decision.</em>', intro: 'The cheapest cached one-way fare from Budapest for each of the next seven departure days, one per day.',
    source: 'Cached search data from a provider window of up to 48 hours. This is not a package, includes no accommodation, and is not a live price or an availability promise. One adult, economy, one way; baggage and additional fees are unknown.',
    window: 'Departure days covered', refresh: 'Refresh the list', statusRetry: 'Check connection again',
    privacy: 'Opening this page starts one anonymous request to the TripGoes API. The list is served from a shared six-hour cache, with no user identification.',
    checking: 'Checking the data connection…', checkingBody: 'The list loads after this check.', unconfigured: 'The data connection is not configured yet.', unconfiguredBody: 'The flight data source is not enabled. No prices or sample offers are displayed here.', unavailable: 'The data connection is unavailable right now.', unavailableBody: 'We could not check the connection status. This does not mean that no flights exist.',
    loading: 'Retrieving cached prices for the next seven days…', empty: 'No cached results for this week right now.', emptyBody: 'The source returned no prices for these days. This is not a complete flight inventory and does not establish that no bookable flight exists.',
    error: 'The list could not be retrieved right now.', errorBody: 'The data source or connection failed. Try again later; this is not an empty result.', limited: 'The request limit has been reached.', limitedBody: 'A temporary provider or TripGoes request limit prevents a refresh right now. Please try again later.',
    stale: 'This list’s reuse window has ended.', staleBody: 'Refresh to request newer data. This is the TripGoes cache cutoff, not the expiry time of a fare.',
    results: 'Cheapest cached fares', count: 'Days displayed', retrieved: 'API retrieval time', reuse: 'TripGoes reuse cutoff', timing: 'Retrieval time is not when a fare was discovered. The source does not provide a reliable observation timestamp for each individual price.',
    partial: 'day(s) of the covered week are missing; the list is built from fewer days.',
    fare: 'Cached one-way fare · 1 adult', departureLabel: 'Departure', airport: 'Reported airports', airline: 'Airline / flight', stops: 'Stops', duration: 'Reported flight time', minutes: 'min', unknown: 'Not provided',
    extras: 'Arrange and confirm the return leg, baggage and additional fees with the provider. We do not calculate a complete trip cost or assign a TripScore from this fare.', book: 'Check on Aviasales', affiliate: 'Affiliate link. Confirm the final price and conditions on the booking page.',
    planner: 'Plan your complete trip cost', flights: 'Search flights yourself', noJS: 'The list requires JavaScript.',
  },
};
const langCode = lang => lang === 'en' ? 'en' : 'hu';
const locale = lang => lang === 'en' ? 'en-GB' : 'hu-HU';
const utcTime = (value, lang) => `${new Intl.DateTimeFormat(locale(lang), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value))} UTC`;
const scheduledTime = value => `${value.slice(0, 10)} · ${value.slice(11, 16)} (UTC${value.endsWith('Z') ? '' : value.slice(-6)})`;
const stateHTML = (state, text, lang) => `<div class="flights-state"><span class="flights-state-mark" aria-hidden="true">↗</span><h3>${text[state]}</h3><p>${text[`${state}Body`]}</p><div class="flights-next"><a href="/${lang}/flights/">${text.flights} ↗</a><a href="/${lang}/planner/">${text.planner} ↗</a></div></div>`;

export function renderLastMinute(data, lang = 'hu') {
  const language = langCode(lang), text = copy[language];
  const payload = validateLastMinutePayload(data);
  if (!payload.deals.length) return stateHTML('empty', text, language);
  const shown = value => value === null ? text.unknown : escape(value);
  const missing = payload.requestedDays - payload.completedDays;
  const price = item => escape(new Intl.NumberFormat(locale(language), { style: 'currency', currency: item.currency }).format(item.priceMinor / 100));
  return `<div class="flights-timing"><div><span>${text.window}</span><strong>${escape(payload.dates[0])} – ${escape(payload.dates[payload.dates.length - 1])}</strong></div><div><span>${text.retrieved}</span><strong>${utcTime(payload.fetchedAt, language)}</strong></div><div><span>${text.reuse}</span><strong>${utcTime(payload.cacheUntil, language)}</strong></div><p>${text.timing}${missing ? ` ${missing} ${text.partial}` : ''}</p></div><div class="flights-grid">${payload.deals.map(item => `<article class="flights-card"><div class="flights-card-top"><p class="flights-source">Aviasales Data API · ${text.fare}</p><h3>${item.origin} <span aria-hidden="true">→</span> ${item.destination}</h3><strong class="flights-price">${price(item)}</strong></div><dl class="flights-facts"><div><dt>${text.departureLabel}</dt><dd>${scheduledTime(item.departureAt)}</dd></div><div><dt>${text.airport}</dt><dd>${shown(item.originAirport)} → ${shown(item.destinationAirport)}</dd></div><div><dt>${text.airline}</dt><dd>${shown(item.airline)} / ${shown(item.flightNumber)}</dd></div><div><dt>${text.stops}</dt><dd>${shown(item.transfers)}</dd></div><div><dt>${text.duration}</dt><dd>${item.durationMinutes === null ? text.unknown : `${item.durationMinutes} ${text.minutes}`}</dd></div></dl><p class="flights-extras">${text.extras}</p><div class="flights-card-bottom"><a class="flights-button flights-button-dark" data-flight-booking href="${escape(item.bookingUrl)}" target="_blank" rel="sponsored noopener noreferrer" referrerpolicy="no-referrer">${text.book} ↗</a><small>${text.affiliate}</small></div></article>`).join('')}</div>`;
}

export function lastMinutePage(lang = 'hu') {
  const language = langCode(lang), text = copy[language];
  return `<div id="trip-lastminute" class="flights-page container" data-lastminute-lang="${language}" data-lastminute-origin="${LAST_MINUTE_ORIGIN}" data-lastminute-currency="${lastMinuteCurrency(language)}"><section class="flights-hero"><div><p class="flights-eyebrow">${text.eye}</p><h1>${text.title}</h1></div><div><p>${text.intro}</p><small>${text.source}</small></div></section><div class="flights-connection"><p data-lastminute-connection role="status" aria-live="polite">${text.checking}</p><button type="button" class="flights-button flights-button-text" data-lastminute-check hidden>${text.statusRetry}</button></div><p class="flights-privacy">${text.privacy}</p><section class="flights-results" aria-labelledby="lastminute-results-heading"><div class="flights-results-head"><h2 id="lastminute-results-heading">${text.results}</h2><button type="button" class="flights-button flights-button-outline" data-lastminute-refresh hidden>${text.refresh}</button></div><p data-lastminute-status class="flights-status" role="status" aria-live="polite" aria-atomic="true"></p><div data-lastminute-results>${stateHTML('checking', text, language)}</div></section><noscript><p>${text.noJS}</p></noscript></div>`;
}

export function initLastMinute(lang, { apiBase } = {}) {
  if (typeof document === 'undefined') return false;
  const root = document.getElementById('trip-lastminute');
  if (!root || root.dataset.lastminuteBound === 'true') return false;
  root.dataset.lastminuteBound = 'true';
  const language = langCode(lang || root.dataset.lastminuteLang), text = copy[language];
  const query = { origin: root.dataset.lastminuteOrigin || LAST_MINUTE_ORIGIN, currency: root.dataset.lastminuteCurrency || lastMinuteCurrency(language) };
  const results = root.querySelector('[data-lastminute-results]'), status = root.querySelector('[data-lastminute-status]');
  const connection = root.querySelector('[data-lastminute-connection]'), refresh = root.querySelector('[data-lastminute-refresh]'), check = root.querySelector('[data-lastminute-check]');
  let statusUrl, boardUrl;
  try { statusUrl = buildFlightsUrl(apiBase); boardUrl = buildLastMinuteUrl(apiBase, query); }
  catch { connection.textContent = text.unconfigured; results.innerHTML = stateHTML('unconfigured', text, language); return false; }
  let configured = false, disposed = false, generation = 0, statusVersion = 0;
  let boardController, statusController, timer, serverNow, cacheUntil;
  const clearResult = state => { results.innerHTML = stateHTML(state, text, language); };
  const monotonicNow = () => performance.now();
  const removeStale = () => {
    if (!cacheUntil || !serverNow || serverNow() < cacheUntil) return false;
    clearTimeout(timer); cacheUntil = null; clearResult('stale'); status.textContent = text.stale; return true;
  };
  const watchCache = () => {
    clearTimeout(timer);
    if (!cacheUntil || !root.isConnected || disposed || removeStale()) return;
    timer = setTimeout(watchCache, Math.min(60_000, Math.max(1, cacheUntil - serverNow() + 1)));
  };
  const requestOptions = signal => ({ credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', redirect: 'error', signal, headers: { Accept: 'application/json' } });
  const load = async () => {
    if (!configured) return;
    const current = ++generation;
    boardController?.abort(); boardController = new AbortController();
    clearTimeout(timer); cacheUntil = null;
    status.textContent = text.loading; results.innerHTML = ''; results.setAttribute('aria-busy', 'true'); refresh.hidden = false;
    const requestStarted = monotonicNow();
    try {
      const response = await fetch(boardUrl, requestOptions(boardController.signal));
      if (!response.ok) {
        let code = ''; try { const errorBody = await response.json(); code = errorBody?.error?.code ?? errorBody?.error ?? errorBody?.code ?? ''; } catch { /* Status remains useful for non-JSON failures. */ }
        if (current !== generation || disposed || !root.isConnected) return;
        const state = code === 'flight_provider_not_configured' ? 'unconfigured' : response.status === 429 || /rate_limited|budget|quota/.test(String(code)) ? 'limited' : 'error';
        if (state === 'unconfigured') { configured = false; connection.textContent = text.unconfigured; }
        clearResult(state); status.textContent = text[state]; return;
      }
      const raw = await response.json(), receivedAt = monotonicNow();
      if (current !== generation || disposed || !root.isConnected) return;
      const payload = validateLastMinutePayload(raw, query);
      serverNow = createOfferClock(payload.asOf, { requestStarted, receivedAt, monotonicNow, minimumTime: serverNow?.() ?? 0 });
      cacheUntil = Date.parse(payload.cacheUntil);
      if (removeStale()) return;
      results.innerHTML = renderLastMinute(payload, language); status.textContent = `${text.count}: ${payload.deals.length}.`; watchCache();
    } catch (error) { if (current === generation && !disposed && root.isConnected && error.name !== 'AbortError') { clearResult('error'); status.textContent = text.error; } }
    finally { if (current === generation) results.setAttribute('aria-busy', 'false'); }
  };
  const checkStatus = async () => {
    const current = ++statusVersion;
    generation++; boardController?.abort(); clearTimeout(timer); cacheUntil = null;
    statusController?.abort(); statusController = new AbortController();
    configured = false; check.disabled = true; check.hidden = false; refresh.hidden = true;
    connection.textContent = text.checking; status.textContent = ''; clearResult('checking');
    try {
      const response = await fetch(statusUrl, requestOptions(statusController.signal));
      if (!response.ok) throw new Error('Status failed.');
      const payload = validateFlightStatus(await response.json());
      if (disposed || !root.isConnected || current !== statusVersion) return;
      configured = payload.configured; connection.textContent = configured ? '' : text.unconfigured;
      if (!configured) { clearResult('unconfigured'); return; }
      await load();
    } catch (error) { if (!disposed && root.isConnected && current === statusVersion && error.name !== 'AbortError') { connection.textContent = text.unavailable; clearResult('unavailable'); } }
    finally { if (current === statusVersion) check.disabled = false; }
  };
  refresh.addEventListener('click', () => { load(); });
  check.addEventListener('click', checkStatus);
  const guardLinks = event => { if (event.target.closest('[data-flight-booking]') && removeStale()) event.preventDefault(); };
  results.addEventListener('click', guardLinks); results.addEventListener('auxclick', guardLinks); results.addEventListener('contextmenu', guardLinks);
  const visibility = () => { if (document.visibilityState === 'visible' && root.isConnected) { removeStale(); watchCache(); } };
  document.addEventListener('visibilitychange', visibility);
  checkStatus();
  return () => { disposed = true; generation++; statusVersion++; boardController?.abort(); statusController?.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', visibility); };
}
