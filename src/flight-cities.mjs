const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fold = value => String(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
export const FLIGHT_CITY_SOURCE = 'https://api.travelpayouts.com/data/en/cities.json';
export function validateFlightCities(data) {
  if (!data || data.version !== 1 || data.source !== FLIGHT_CITY_SOURCE || !Array.isArray(data.rows) || data.rows.length > 12000) throw new TypeError('Invalid city catalogue.');
  const seen = new Set();
  return data.rows.map(row => {
    if (!Array.isArray(row) || row.length !== 3 || typeof row[0] !== 'string' || !row[0].trim() || row[0].length > 120 || !/^[A-Z]{3}$/.test(row[1]) || !/^[A-Z]{2}$/.test(row[2]) || seen.has(row[1])) throw new TypeError('Invalid city row.');
    seen.add(row[1]); return [...row];
  });
}
export function findFlightCities(rows, query, limit = 8) {
  const term = fold(query);
  if (term.length < 2 || term.length > 120) return [];
  return rows.map(row => ({ row, rank: fold(row[1]) === term ? 0 : fold(row[0]) === term ? 1 : fold(row[0]).startsWith(term) ? 2 : fold(row[1]).startsWith(term) ? 3 : fold(row[0]).includes(term) ? 4 : fold(row[2]) === term ? 5 : 99 }))
    .filter(item => item.rank < 99).sort((a, b) => a.rank - b.rank || a.row[0].localeCompare(b.row[0]) || a.row[1].localeCompare(b.row[1]))
    .slice(0, Math.max(1, Math.min(20, Number.isInteger(limit) ? limit : 8))).map(item => item.row);
}
export const flightCityLabel = row => `${row[0]} · ${row[2]} (${row[1]})`;
export function flightCityCode(value, selectedCode = '', selectedLabel = '') {
  if (typeof value !== 'string') return null;
  const input = value.trim();
  if (/^[A-Za-z]{3}$/.test(input)) return input.toUpperCase();
  return value === selectedLabel && /^[A-Z]{3}$/.test(selectedCode) ? selectedCode : null;
}
export function flightCityField(name, lang = 'hu', defaultBudapest = false) {
  const hu = lang !== 'en';
  const title = name === 'origin' ? (hu ? 'Indulás' : 'From') : (hu ? 'Úti cél' : 'To');
  const value = defaultBudapest ? 'Budapest · HU (BUD)' : '';
  return `<div class="flights-city"><label for="flights-${name}">${title}</label><input id="flights-${name}" name="${name}" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="flights-${name}-list" aria-describedby="flights-${name}-hint flights-${name}-status" autocomplete="off" maxlength="150" data-flight-city data-flight-code="${defaultBudapest ? 'BUD' : ''}" data-flight-label="${value}" value="${value}" placeholder="${hu ? 'Város vagy IATA-kód' : 'City or IATA code'}"${name === 'origin' ? ' required' : ''}><small id="flights-${name}-hint">${name === 'destination' ? (hu ? 'Üresen: úti célok felfedezése. ' : 'Leave blank to explore destinations. ') : ''}${hu ? 'Válassz a listából, vagy írj be 3 betűs IATA-kódot.' : 'Choose a suggestion or enter a 3-letter IATA code.'}</small><div id="flights-${name}-list" class="flights-city-list" role="listbox" aria-label="${title}" hidden></div><span id="flights-${name}-status" class="flights-city-status" role="status" aria-live="polite"></span></div>`;
}

export function initFlightCities(root, lang = 'hu') {
  const hu = lang !== 'en';
  let catalogue, pending, disposed = false;
  const cleanups = [];
  const load = () => pending ||= fetch('/assets/flight-cities.json', { credentials: 'omit', referrerPolicy: 'no-referrer' })
    .then(response => { if (!response.ok) throw new Error('Catalogue unavailable.'); return response.json(); })
    .then(validateFlightCities).then(rows => { catalogue = rows; return rows; }).catch(error => { pending = null; throw error; });
  for (const input of root.querySelectorAll('[data-flight-city]')) {
    const list = root.querySelector(`#${input.id}-list`);
    const status = root.querySelector(`#${input.id}-status`);
    let rows = [], active = -1, ticket = 0;
    const close = () => { ticket++; list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
    const highlight = () => {
      [...list.children].forEach((option, index) => option.setAttribute('aria-selected', String(index === active)));
      if (active >= 0) input.setAttribute('aria-activedescendant', `${input.id}-option-${active}`);
      else input.removeAttribute('aria-activedescendant');
    };
    const select = index => {
      if (!rows[index]) return;
      input.value = flightCityLabel(rows[index]);
      input.dataset.flightCode = rows[index][1]; input.dataset.flightLabel = input.value;
      close(); status.textContent = hu ? `Kiválasztva: ${input.value}` : `Selected: ${input.value}`;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const suggest = async () => {
      const current = ++ticket;
      const query = input.value;
      if (query.trim().length < 2 || query === input.dataset.flightLabel) { close(); return; }
      if (!catalogue) status.textContent = hu ? 'IATA-városlista betöltése…' : 'Loading IATA city catalogue…';
      try { if (!catalogue) await load(); }
      catch { if (!disposed && current === ticket) status.textContent = hu ? 'A lista nem érhető el. Ismert, 3 betűs IATA-kód továbbra is használható.' : 'The catalogue is unavailable. You can still enter a known 3-letter IATA code.'; return; }
      if (disposed || current !== ticket || !input.isConnected) return;
      rows = findFlightCities(catalogue, query);
      list.innerHTML = rows.map((row, index) => `<div role="option" aria-selected="false" id="${input.id}-option-${index}" data-flight-option="${index}"><strong>${escape(row[0])}</strong><span>${escape(row[2])} · ${escape(row[1])}</span></div>`).join('');
      active = -1; list.hidden = rows.length === 0; input.setAttribute('aria-expanded', String(rows.length > 0)); input.removeAttribute('aria-activedescendant');
      status.textContent = rows.length ? (hu ? `${rows.length} javaslat. A nyílbillentyűkkel választhatsz.` : `${rows.length} suggestions. Use the arrow keys to choose.`) : (hu ? 'Nincs városjavaslat. Ismert IATA-kódot megadhatsz; városnévből nem találunk ki kódot.' : 'No city suggestion. Enter a known IATA code; we do not guess codes from city names.');
    };
    const onInput = () => { input.dataset.flightCode = ''; input.dataset.flightLabel = ''; close(); suggest(); };
    const keydown = event => {
      if (event.key === 'Escape') { close(); return; }
      if (event.key === 'Tab') { close(); return; }
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        if (list.hidden) { suggest(); return; }
        active = event.key === 'ArrowDown' ? (active + 1) % rows.length : (active - 1 + rows.length) % rows.length;
        highlight(); return;
      }
      if (event.key === 'Enter' && !list.hidden && active >= 0) { event.preventDefault(); select(active); }
    };
    const click = event => { const option = event.target.closest('[data-flight-option]'); if (option && list.contains(option)) select(Number(option.dataset.flightOption)); };
    const keepFocus = event => event.preventDefault();
    input.addEventListener('input', onInput); input.addEventListener('focus', suggest); input.addEventListener('blur', close); input.addEventListener('keydown', keydown);
    list.addEventListener('mousedown', keepFocus); list.addEventListener('click', click);
    cleanups.push(() => { close(); input.removeEventListener('input', onInput); input.removeEventListener('focus', suggest); input.removeEventListener('blur', close); input.removeEventListener('keydown', keydown); list.removeEventListener('mousedown', keepFocus); list.removeEventListener('click', click); });
  }
  return () => { disposed = true; cleanups.forEach(fn => fn()); };
}
