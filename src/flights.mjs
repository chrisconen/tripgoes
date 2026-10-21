import { flightCityField, flightCityCode, initFlightCities } from './flight-cities.mjs';
import { createOfferClock } from './offers.mjs';

const currencies = ['HUF', 'EUR', 'USD', 'GBP', 'CHF'];
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const iata = value => typeof value === 'string' && /^[A-Z]{3}$/.test(value);
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && day(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
const invalid = () => { throw new TypeError('Invalid flight data.'); };
export function flightDateBounds(now = Date.now()) {
  if (!Number.isFinite(now)) invalid();
  const today = new Date(now).toISOString().slice(0, 10);
  const midnight = Date.parse(today);
  return { min: new Date(midnight + 86_400_000).toISOString().slice(0, 10), max: new Date(midnight + 365 * 86_400_000).toISOString().slice(0, 10) };
}
export function validateFlightQuery(input, now = Date.now()) {
  const bounds = flightDateBounds(now);
  if (!isObject(input) || !iata(input.origin) || (input.destination !== null && !iata(input.destination)) || input.destination === input.origin
    || !currencies.includes(input.currency) || typeof input.direct !== 'boolean' || typeof input.oneWay !== 'boolean'
    || !day(input.departureDate) || input.departureDate < bounds.min || input.departureDate > bounds.max
    || (input.oneWay ? input.returnDate !== null : !day(input.returnDate) || input.returnDate < input.departureDate || input.returnDate > bounds.max)) invalid();
  return { origin: input.origin, destination: input.destination, departureDate: input.departureDate, returnDate: input.returnDate, currency: input.currency, direct: input.direct, oneWay: input.oneWay };
}
export function buildFlightsUrl(apiBase, query, now = Date.now()) {
  if (typeof apiBase !== 'string' || !apiBase.trim()) invalid();
  const url = new URL(apiBase);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) invalid();
  url.pathname = `${url.pathname.replace(/\/$/, '')}/v1/flights${query === undefined ? '/status' : ''}`;
  if (query !== undefined) for (const [key, value] of Object.entries(validateFlightQuery(query, now))) if (value !== null) url.searchParams.set(key, String(value));
  return url.href;
}
export function validateFlightStatus(data) {
  if (!isObject(data) || typeof data.configured !== 'boolean' || data.source !== 'aviasales-data') invalid();
  return { configured: data.configured, source: data.source };
}
export function safeFlightBookingUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const url = new URL(value);
    if (url.origin !== 'https://www.aviasales.com' || url.username || url.password || !/^\/search\/[^/]+$/.test(url.pathname) || url.hash
      || !/^\d{1,30}$/.test(url.searchParams.get('marker') || '') || [...url.searchParams.keys()].some(key => /token|secret|api.?key/i.test(key))) return null;
    return url.href;
  } catch { return null; }
}
export function validateFlightsPayload(data, expectedQuery) {
  if (!isObject(data) || !timestamp(data.asOf) || !timestamp(data.fetchedAt) || !timestamp(data.cacheUntil)
    || Date.parse(data.fetchedAt) > Date.parse(data.asOf) || Date.parse(data.cacheUntil) <= Date.parse(data.fetchedAt)
    || Date.parse(data.cacheUntil) - Date.parse(data.fetchedAt) > 600_000
    || !isObject(data.source) || data.source.id !== 'aviasales-data' || data.source.name !== 'Aviasales Data API' || data.source.kind !== 'cached_search' || data.source.maxProviderAgeHours !== 48
    || !Array.isArray(data.flights) || data.flights.length > 20 || typeof data.hasMore !== 'boolean') invalid();
  const query = validateFlightQuery(data.query, Date.parse(data.asOf));
  if (expectedQuery && Object.keys(query).some(key => query[key] !== expectedQuery[key])) invalid();
  const seen = new Set();
  const flights = data.flights.map(item => {
    if (!isObject(item) || typeof item.id !== 'string' || !/^[a-f0-9]{64}$/.test(item.id) || seen.has(item.id)
      || !iata(item.origin) || !iata(item.destination) || item.origin === item.destination
      || (item.originAirport !== null && !iata(item.originAirport)) || (item.destinationAirport !== null && !iata(item.destinationAirport))
      || (query.origin !== item.origin && query.origin !== item.originAirport) || (query.destination && query.destination !== item.destination && query.destination !== item.destinationAirport)
      || !timestamp(item.departureAt) || item.departureAt.slice(0, 10) !== query.departureDate
      || (query.oneWay ? item.returnAt !== null : !timestamp(item.returnAt) || item.returnAt.slice(0, 10) !== query.returnDate || Date.parse(item.returnAt) < Date.parse(item.departureAt))
      || !Number.isSafeInteger(item.priceMinor) || item.priceMinor < 0 || item.currency !== query.currency || !safeFlightBookingUrl(item.bookingUrl)) invalid();
    for (const key of ['transfers', 'returnTransfers', 'durationMinutes']) if (item[key] !== null && (!Number.isInteger(item[key]) || item[key] < 0 || item[key] > 100_000)) invalid();
    for (const key of ['airline', 'flightNumber']) if (item[key] !== null && (typeof item[key] !== 'string' || !item[key].trim() || item[key].length > 40)) invalid();
    if (query.direct && (item.transfers !== 0 || (!query.oneWay && item.returnTransfers !== 0))) invalid();
    seen.add(item.id);
    return { id: item.id, origin: item.origin, destination: item.destination, originAirport: item.originAirport, destinationAirport: item.destinationAirport, departureAt: item.departureAt, returnAt: item.returnAt, priceMinor: item.priceMinor, currency: item.currency, airline: item.airline, flightNumber: item.flightNumber, transfers: item.transfers, returnTransfers: item.returnTransfers, durationMinutes: item.durationMinutes, bookingUrl: safeFlightBookingUrl(item.bookingUrl) };
  });
  return { asOf: data.asOf, fetchedAt: data.fetchedAt, cacheUntil: data.cacheUntil, source: { id: 'aviasales-data', name: 'Aviasales Data API', kind: 'cached_search', maxProviderAgeHours: 48 }, query, flights, hasMore: data.hasMore };
}

const copy = {
  hu: {
    eye: 'REPÜLŐJEGYEK / AVIASALES DATA API', title: 'Egy új út<br><em>első nyoma.</em>', intro: 'Nézz körül a korábbi keresésekből származó repülőjegyárak között. Egy konkrét úti célhoz vagy egy nyitott tervhez.',
    source: 'Gyorsítótárazott keresési adatok, legfeljebb 48 órás forrásablakból. Nem élő ár vagy foglalhatósági ígéret. Egy felnőtt, turistaosztály; a poggyász, díjak és helyi eljutás teljes költsége nem ismert.',
    departure: 'Indulás napja', return: 'Visszaút napja', currency: 'Pénznem', oneWay: 'Csak odaút', direct: 'Csak közvetlen járatok', search: 'Árak keresése', refresh: 'Újrakeresés', statusRetry: 'Kapcsolat újraellenőrzése',
    datesHint: 'Holnaptól legfeljebb egy évre előre, UTC naptári napok szerint. Az időpontokat a szolgáltatónál is ellenőrizd.',
    privacy: 'Az árlekérdezés csak kereséskor indul. A keresési feltételeket és eredményt tíz percig névtelen közös gyorsítótárban tároljuk.',
    checking: 'Az adatkapcsolat ellenőrzése…', checkingBody: 'Az árkeresés csak az ellenőrzés után, külön gombnyomásra indul.', ready: 'Az adatkapcsolat be van állítva. A keresés külön gombnyomásra indul.', unconfigured: 'Az adatkapcsolat még nincs beállítva.', unconfiguredBody: 'A repülőjegy-adatforrás nincs bekapcsolva. Itt most nem mutatunk árakat vagy mintaajánlatokat.', unavailable: 'Az adatkapcsolat most nem érhető el.', unavailableBody: 'A kapcsolat állapotát nem sikerült ellenőrizni. Ez nem azt jelenti, hogy nincs járat.',
    idle: 'Merre indulnál?', idleBody: 'Budapestről indulunk, de választhatsz más IATA-várost vagy repülőteret. Úti cél nélkül a megadott napokhoz keresünk lehetőségeket.',
    loading: 'Gyorsítótárazott árak lekérése…', empty: 'Most nincs ilyen tárolt találat.', emptyBody: 'Az adatforrás nem adott találatot ezekre a feltételekre. Ez nem teljes járatlista, és nem bizonyítja, hogy nincs foglalható repülőjegy.',
    error: 'Az árakat most nem sikerült lekérni.', errorBody: 'Adatforrás- vagy kapcsolati hiba történt. Próbáld újra később; ezt nem kezeljük üres találatként.', limited: 'A lekérdezési korlátot most elértük.', limitedBody: 'Az adatforrás vagy a TripGoes átmeneti lekérdezési korlátja miatt most nem kérhető új eredmény. Próbáld meg később.',
    stale: 'Az eredmény újrahasználati ideje lejárt.', staleBody: 'Újabb adatokhoz indíts új keresést. Ez a TripGoes gyorsítótárának határa, nem a repülőjegy árának lejárati ideje.',
    invalid: 'Válassz indulási IATA-kódot, érvényes dátumokat és pénznemet. Városnevet válassz a listából; tetszőleges szövegből nem találunk ki repülőteret.',
    results: 'Talált árak', count: 'Megjelenített találatok', retrieved: 'API-lekérés ideje', reuse: 'TripGoes újrahasználati határ', timing: 'A lekérés ideje nem az ár felfedezésének időpontja. A forrás nem ad megbízható, egyedi ármegfigyelési időt.',
    fare: 'Tárolt jegyár · 1 felnőtt', departureLabel: 'Odaút', returnLabel: 'Visszaút', airport: 'Jelzett repülőterek', airline: 'Légitársaság / járat', stops: 'Átszállások oda / vissza', duration: 'Jelzett teljes repülési idő', minutes: 'perc', unknown: 'Nem közölt', notApplicable: '—',
    extras: 'A poggyász és további díjak feltételeit ellenőrizd. A teljes utazási költséget ebből nem számoljuk ki, és TripScore-t sem adunk rá.', book: 'Ellenőrzés az Aviasales oldalán', affiliate: 'Partnerlink. A végleges árat és feltételeket a foglalási oldalon látod.', more: 'További tárolt találatok is lehetnek. Szűkítsd a keresést; itt legfeljebb 20 jelenik meg.', planner: 'Saját teljes költség megtervezése', guides: 'Utazási útmutatók', noJS: 'A kereséshez JavaScript szükséges.',
  },
  en: {
    eye: 'FLIGHTS / AVIASALES DATA API', title: 'The first clue<br><em>to your next trip.</em>', intro: 'Explore flight prices from previous searches. Start with a destination in mind, or leave room for a new idea.',
    source: 'Cached search data from a provider window of up to 48 hours. This is not a live price or an availability promise. One adult, economy; complete baggage, fee and ground-transport costs are unknown.',
    departure: 'Departure date', return: 'Return date', currency: 'Currency', oneWay: 'One way', direct: 'Direct flights only', search: 'Search prices', refresh: 'Search again', statusRetry: 'Check connection again',
    datesHint: 'From tomorrow to 365 days ahead, using UTC calendar days. Confirm the actual flight times with the provider.',
    privacy: 'Price requests start only when you search. Search conditions and results are stored anonymously in a shared cache for ten minutes.',
    checking: 'Checking the data connection…', checkingBody: 'After this check, price searching starts only when you press the search button.', ready: 'The data connection is configured. Searching starts only when you press the search button.', unconfigured: 'The data connection is not configured yet.', unconfiguredBody: 'The flight data source is not enabled. No prices or sample offers are displayed here.', unavailable: 'The data connection is unavailable right now.', unavailableBody: 'We could not check the connection status. This does not mean that no flights exist.',
    idle: 'Where would you like to go?', idleBody: 'Budapest is the starting point; choose another IATA city or airport if needed. Leave the destination blank to explore options for your dates.',
    loading: 'Retrieving cached prices…', empty: 'No matching cached results right now.', emptyBody: 'The source returned no results for these conditions. This is not a complete flight inventory and does not establish that no bookable flight exists.',
    error: 'Prices could not be retrieved right now.', errorBody: 'The data source or connection failed. Try again later; this is not an empty search result.', limited: 'The request limit has been reached.', limitedBody: 'A temporary provider or TripGoes request limit prevents another result right now. Please try again later.',
    stale: 'This result’s reuse window has ended.', staleBody: 'Search again to request newer data. This is the TripGoes cache cutoff, not the expiry time of a fare.',
    invalid: 'Choose a departure IATA code, valid dates and currency. Select city names from the suggestions; we do not guess an airport from arbitrary text.',
    results: 'Prices found', count: 'Results displayed', retrieved: 'API retrieval time', reuse: 'TripGoes reuse cutoff', timing: 'Retrieval time is not when a fare was discovered. The source does not provide a reliable observation timestamp for each individual price.',
    fare: 'Cached fare · 1 adult', departureLabel: 'Outbound', returnLabel: 'Return', airport: 'Reported airports', airline: 'Airline / flight', stops: 'Stops outbound / return', duration: 'Reported total flight time', minutes: 'min', unknown: 'Not provided', notApplicable: '—',
    extras: 'Check baggage and additional fee conditions. We do not calculate a complete trip cost or assign a TripScore from this fare.', book: 'Check on Aviasales', affiliate: 'Affiliate link. Confirm the final price and conditions on the booking page.', more: 'More cached results may exist. Narrow your search; a maximum of 20 is displayed here.', planner: 'Plan your complete trip cost', guides: 'Travel guides', noJS: 'Searching requires JavaScript.',
  },
};
const langCode = lang => lang === 'en' ? 'en' : 'hu';
const utcTime = (value, lang) => `${new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'hu-HU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value))} UTC`;
const scheduledTime = value => `${value.slice(0, 10)} · ${value.slice(11, 16)} (UTC${value.endsWith('Z') ? '' : value.slice(-6)})`;
const stateHTML = (state, text, lang) => `<div class="flights-state"><span class="flights-state-mark" aria-hidden="true">↗</span><h3>${text[state]}</h3><p>${text[`${state}Body`]}</p><div class="flights-next"><a href="/${lang}/planner/">${text.planner} ↗</a><a href="/${lang}/blog/">${text.guides} ↗</a></div></div>`;
export function renderFlights(data, lang = 'hu') {
  const language = langCode(lang), text = copy[language];
  const payload = validateFlightsPayload(data);
  if (!payload.flights.length) return stateHTML('empty', text, language);
  const shown = value => value === null ? text.unknown : escape(value);
  return `<div class="flights-timing"><div><span>${text.retrieved}</span><strong>${utcTime(payload.fetchedAt, language)}</strong></div><div><span>${text.reuse}</span><strong>${utcTime(payload.cacheUntil, language)}</strong></div><p>${text.timing}</p></div><div class="flights-grid">${payload.flights.map(item => `<article class="flights-card"><div class="flights-card-top"><p class="flights-source">Aviasales Data API · ${text.fare}</p><h3>${item.origin} <span aria-hidden="true">→</span> ${item.destination}</h3><strong class="flights-price">${escape(new Intl.NumberFormat(language === 'en' ? 'en-GB' : 'hu-HU', { style: 'currency', currency: item.currency }).format(item.priceMinor / 100))}</strong></div><dl class="flights-facts"><div><dt>${text.departureLabel}</dt><dd>${scheduledTime(item.departureAt)}</dd></div>${item.returnAt ? `<div><dt>${text.returnLabel}</dt><dd>${scheduledTime(item.returnAt)}</dd></div>` : ''}<div><dt>${text.airport}</dt><dd>${shown(item.originAirport)} → ${shown(item.destinationAirport)}</dd></div><div><dt>${text.airline}</dt><dd>${shown(item.airline)} / ${shown(item.flightNumber)}</dd></div><div><dt>${text.stops}</dt><dd>${shown(item.transfers)} / ${payload.query.oneWay ? text.notApplicable : shown(item.returnTransfers)}</dd></div><div><dt>${text.duration}</dt><dd>${item.durationMinutes === null ? text.unknown : `${item.durationMinutes} ${text.minutes}`}</dd></div></dl><p class="flights-extras">${text.extras}</p><div class="flights-card-bottom"><a class="flights-button flights-button-dark" data-flight-booking href="${escape(item.bookingUrl)}" target="_blank" rel="sponsored noopener noreferrer" referrerpolicy="no-referrer">${text.book} ↗</a><small>${text.affiliate}</small></div></article>`).join('')}</div>${payload.hasMore ? `<p class="flights-more">${text.more}</p>` : ''}`;
}
export function flightPage(lang = 'hu') {
  const language = langCode(lang), text = copy[language];
  return `<div id="trip-flights" class="flights-page container" data-flights-lang="${language}"><section class="flights-hero"><div><p class="flights-eyebrow">${text.eye}</p><h1>${text.title}</h1></div><div><p>${text.intro}</p><small>${text.source}</small></div></section><div class="flights-connection"><p data-flights-connection role="status" aria-live="polite">${text.checking}</p><button type="button" class="flights-button flights-button-text" data-flights-check hidden>${text.statusRetry}</button></div><form class="flights-search" data-flights-form><div class="flights-route-fields">${flightCityField('origin', language, true)}${flightCityField('destination', language)}</div><div class="flights-date-fields"><label for="flights-departure"><span>${text.departure}</span><input id="flights-departure" name="departureDate" type="date" required aria-describedby="flights-date-hint"></label><label for="flights-return"><span>${text.return}</span><input id="flights-return" name="returnDate" type="date" required aria-describedby="flights-date-hint"></label><label for="flights-currency"><span>${text.currency}</span><select id="flights-currency" name="currency">${currencies.map(code => `<option value="${code}"${code === (language === 'hu' ? 'HUF' : 'EUR') ? ' selected' : ''}>${code}</option>`).join('')}</select></label></div><p class="flights-date-hint" id="flights-date-hint">${text.datesHint}</p><div class="flights-search-bottom"><div class="flights-toggles"><label><input name="oneWay" type="checkbox">${text.oneWay}</label><label><input name="direct" type="checkbox">${text.direct}</label></div><button type="submit" class="flights-button flights-button-dark" data-flights-submit disabled>${text.search}</button></div><p class="flights-privacy">${text.privacy}</p></form><section class="flights-results" aria-labelledby="flights-results-heading"><div class="flights-results-head"><h2 id="flights-results-heading">${text.results}</h2><button type="button" class="flights-button flights-button-outline" data-flights-refresh hidden>${text.refresh}</button></div><p data-flights-status class="flights-status" role="status" aria-live="polite" aria-atomic="true"></p><div data-flights-results>${stateHTML('checking', text, language)}</div></section><noscript><p>${text.noJS}</p></noscript></div>`;
}

export function initFlights(lang, { apiBase } = {}) {
  if (typeof document === 'undefined') return false;
  const root = document.getElementById('trip-flights');
  if (!root || root.dataset.flightsBound === 'true') return false;
  root.dataset.flightsBound = 'true';
  const language = langCode(lang || root.dataset.flightsLang), text = copy[language];
  const form = root.querySelector('[data-flights-form]'), results = root.querySelector('[data-flights-results]');
  const connection = root.querySelector('[data-flights-connection]'), status = root.querySelector('[data-flights-status]');
  const submit = root.querySelector('[data-flights-submit]'), refresh = root.querySelector('[data-flights-refresh]'), check = root.querySelector('[data-flights-check]');
  form.addEventListener('submit', event => event.preventDefault());
  const bounds = flightDateBounds();
  for (const name of ['departureDate', 'returnDate']) { form.elements[name].min = bounds.min; form.elements[name].max = bounds.max; }
  form.elements.oneWay.addEventListener('change', () => { form.elements.returnDate.disabled = form.elements.oneWay.checked; form.elements.returnDate.required = !form.elements.oneWay.checked; });
  const cleanupCities = initFlightCities(root, language);
  let statusUrl;
  try { statusUrl = buildFlightsUrl(apiBase); } catch { connection.textContent = text.unconfigured; results.innerHTML = stateHTML('unconfigured', text, language); return cleanupCities; }
  let configured = false, disposed = false, generation = 0, statusVersion = 0;
  let searchController, statusController, timer, serverNow, cacheUntil, lastQuery;
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
  const checkStatus = async () => {
    const current = ++statusVersion;
    generation++; searchController?.abort(); clearTimeout(timer); cacheUntil = null;
    statusController?.abort(); statusController = new AbortController();
    configured = false; submit.disabled = true; check.disabled = true; check.hidden = false; connection.textContent = text.checking;
    status.textContent = ''; clearResult('checking');
    try {
      const response = await fetch(statusUrl, requestOptions(statusController.signal));
      if (!response.ok) throw new Error('Status failed.');
      const payload = validateFlightStatus(await response.json());
      if (disposed || !root.isConnected || current !== statusVersion) return;
      configured = payload.configured; submit.disabled = !configured; connection.textContent = configured ? text.ready : text.unconfigured;
      if (!configured) { generation++; searchController?.abort(); clearTimeout(timer); cacheUntil = null; clearResult('unconfigured'); }
      else clearResult('idle');
    } catch (error) { if (!disposed && root.isConnected && current === statusVersion && error.name !== 'AbortError') { connection.textContent = text.unavailable; clearResult('unavailable'); } }
    finally { if (current === statusVersion) check.disabled = false; }
  };
  const search = async query => {
    if (!configured) return;
    let url;
    try { url = buildFlightsUrl(apiBase, query); } catch { status.textContent = text.invalid; return; }
    const current = ++generation;
    searchController?.abort(); searchController = new AbortController();
    clearTimeout(timer); cacheUntil = null; lastQuery = query;
    status.textContent = text.loading; results.innerHTML = ''; results.setAttribute('aria-busy', 'true'); refresh.hidden = false;
    const requestStarted = monotonicNow();
    try {
      const response = await fetch(url, requestOptions(searchController.signal));
      if (!response.ok) {
        let code = ''; try { const errorBody = await response.json(); code = errorBody?.error?.code ?? errorBody?.error ?? errorBody?.code ?? ''; } catch { /* Status remains useful for non-JSON failures. */ }
        if (current !== generation || disposed || !root.isConnected) return;
        const state = code === 'flight_provider_not_configured' ? 'unconfigured' : response.status === 429 || /rate_limited|quota/.test(String(code)) ? 'limited' : 'error';
        if (state === 'unconfigured') { configured = false; submit.disabled = true; connection.textContent = text.unconfigured; }
        clearResult(state); status.textContent = text[state]; return;
      }
      const raw = await response.json(), receivedAt = monotonicNow();
      if (current !== generation || disposed || !root.isConnected) return;
      const payload = validateFlightsPayload(raw, query);
      serverNow = createOfferClock(payload.asOf, { requestStarted, receivedAt, monotonicNow, minimumTime: serverNow?.() ?? 0 });
      cacheUntil = Date.parse(payload.cacheUntil);
      if (removeStale()) return;
      results.innerHTML = renderFlights(payload, language); status.textContent = `${text.count}: ${payload.flights.length}.`; watchCache();
    } catch (error) { if (current === generation && !disposed && root.isConnected && error.name !== 'AbortError') { clearResult('error'); status.textContent = text.error; } }
    finally { if (current === generation) results.setAttribute('aria-busy', 'false'); }
  };
  form.addEventListener('submit', event => {
    event.preventDefault();
    const fields = form.elements;
    const origin = flightCityCode(fields.origin.value, fields.origin.dataset.flightCode, fields.origin.dataset.flightLabel);
    const destination = fields.destination.value.trim() ? flightCityCode(fields.destination.value, fields.destination.dataset.flightCode, fields.destination.dataset.flightLabel) : null;
    if (!origin || (fields.destination.value.trim() && !destination)) { status.textContent = text.invalid; (!origin ? fields.origin : fields.destination).focus(); return; }
    search({ origin, destination, departureDate: fields.departureDate.value, returnDate: fields.oneWay.checked ? null : fields.returnDate.value, currency: fields.currency.value, direct: fields.direct.checked, oneWay: fields.oneWay.checked });
  });
  refresh.addEventListener('click', () => { if (lastQuery) search(lastQuery); });
  check.addEventListener('click', checkStatus);
  const guardLinks = event => { if (event.target.closest('[data-flight-booking]') && removeStale()) event.preventDefault(); };
  results.addEventListener('click', guardLinks); results.addEventListener('auxclick', guardLinks); results.addEventListener('contextmenu', guardLinks);
  const visibility = () => { if (document.visibilityState === 'visible' && root.isConnected) { removeStale(); watchCache(); } };
  document.addEventListener('visibilitychange', visibility);
  checkStatus();
  return () => { disposed = true; generation++; statusVersion++; searchController?.abort(); statusController?.abort(); clearTimeout(timer); cleanupCities(); document.removeEventListener('visibilitychange', visibility); };
}
