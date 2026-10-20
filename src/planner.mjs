export const PLANNER_STORAGE_KEY = 'tripgoes:planner:v1';
export const PLANNER_VERSION = 1;
export const PLANNER_CURRENCIES = Object.freeze(['HUF', 'EUR', 'USD', 'GBP', 'CHF']);
const fields = ['name', 'currency', 'base', 'extras', 'travelers', 'nights', 'hours', 'budget'];
const amountFields = ['base', 'extras', 'budget'];
const e = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

function decimal(value, maximum, places = 2) {
  if (value === undefined || value === null || String(value).trim() === '') return { value: null, missing: true };
  const text = String(value).trim();
  const expression = places ? /^\d+(?:[.,]\d{1,2})?$/ : /^\d+$/;
  if (!expression.test(text)) return { value: null, invalid: true };
  const [whole, fraction = ''] = text.replace(',', '.').split('.');
  const scale = 10 ** places;
  const result = Number(whole) * scale + Number(fraction.padEnd(places, '0'));
  if (!Number.isSafeInteger(result) || result > maximum * scale) return { value: null, invalid: true };
  return { value: result };
}

/**
 * All monetary outputs are integer hundredths of the selected currency.
 * Empty costs are unknown. The function neither retrieves nor estimates prices.
 */
export function calculatePlan(offer = {}) {
  if (!offer || typeof offer !== 'object' || Array.isArray(offer)) offer = {};
  const errors = {};
  const parsed = {};
  for (const key of amountFields) parsed[key] = decimal(offer[key], 1_000_000_000);
  parsed.travelers = decimal(offer.travelers, 99, 0);
  parsed.nights = decimal(offer.nights, 3650, 0);
  parsed.hours = decimal(offer.hours, 87_600);
  for (const [key, item] of Object.entries(parsed)) if (item.invalid) errors[key] = amountFields.includes(key) ? 'money' : key;
  if (parsed.travelers.value === 0) errors.travelers = 'travelers';
  if (!PLANNER_CURRENCIES.includes(offer.currency)) errors.currency = 'currency';
  if (offer.name !== undefined && (typeof offer.name !== 'string' || offer.name.length > 120)) errors.name = 'name';
  const missing = ['base', 'extras', 'travelers'].filter(key => parsed[key].missing);
  const valid = Object.keys(errors).length === 0;
  const costsKnown = valid && parsed.base.value !== null && parsed.extras.value !== null;
  const totalPerPersonMinor = costsKnown ? parsed.base.value + parsed.extras.value : null;
  const groupTotalMinor = totalPerPersonMinor !== null && parsed.travelers.value !== null
    ? totalPerPersonMinor * parsed.travelers.value : null;
  return {
    valid, complete: valid && missing.length === 0, errors, missing,
    currency: PLANNER_CURRENCIES.includes(offer.currency) ? offer.currency : null,
    source: offer.source === 'sample' ? 'sample' : 'manual',
    name: typeof offer.name === 'string' ? offer.name.trim() : '',
    baseMinor: parsed.base.value, extrasMinor: parsed.extras.value,
    travelers: parsed.travelers.value, nights: parsed.nights.value,
    hours: parsed.hours.value === null ? null : parsed.hours.value / 100,
    budgetMinor: parsed.budget.value,
    totalPerPersonMinor, groupTotalMinor,
    surchargePercent: costsKnown && parsed.base.value > 0
      ? Math.round(parsed.extras.value * 10_000 / parsed.base.value) / 100 : null,
    perHourMinor: totalPerPersonMinor !== null && parsed.hours.value > 0
      ? Math.round(totalPerPersonMinor * 100 / parsed.hours.value) : null,
    perNightMinor: totalPerPersonMinor !== null && parsed.nights.value > 0
      ? Math.round(totalPerPersonMinor / parsed.nights.value) : null,
    budgetRemainingMinor: groupTotalMinor !== null && parsed.budget.value !== null
      ? parsed.budget.value - groupTotalMinor : null,
  };
}

/** Preserves input order. No ranking or currency conversion is performed. */
export function comparePlans(offers) {
  if (!Array.isArray(offers) || offers.length < 1 || offers.length > 3) throw new RangeError('Compare one to three offers.');
  const results = offers.map(calculatePlan);
  return { results, mixedCurrencies: new Set(results.map(item => item.currency).filter(Boolean)).size > 1 };
}

const blank = lang => ({
  name: '', currency: lang === 'en' ? 'EUR' : 'HUF', base: '', extras: '',
  travelers: '2', nights: '', hours: '', budget: '', source: 'manual',
});

function validStoredOffer(offer) {
  if (!offer || typeof offer !== 'object' || Array.isArray(offer)) return false;
  if (Object.keys(offer).some(key => ![...fields, 'source'].includes(key))) return false;
  if (!fields.every(key => typeof offer[key] === 'string')) return false;
  if (!['manual', 'sample'].includes(offer.source)) return false;
  if (fields.some(key => offer[key].length > (key === 'name' ? 120 : 32))) return false;
  return calculatePlan(offer).valid;
}

export function serializePlanner(offers, savedAt = new Date().toISOString()) {
  if (!Array.isArray(offers) || offers.length < 1 || offers.length > 3 || !offers.every(validStoredOffer)) {
    throw new TypeError('Invalid planner data.');
  }
  if (typeof savedAt !== 'string' || !Number.isFinite(Date.parse(savedAt)) || new Date(savedAt).toISOString() !== savedAt) {
    throw new TypeError('Invalid save timestamp.');
  }
  return JSON.stringify({ version: PLANNER_VERSION, savedAt, offers });
}

export function parseStoredPlanner(raw) {
  if (typeof raw !== 'string' || raw.length > 12000) return { ok: false, reason: 'invalid' };
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, reason: 'invalid' };
    if (data.version !== PLANNER_VERSION) return { ok: false, reason: 'version' };
    if (Object.keys(data).some(key => !['version', 'savedAt', 'offers'].includes(key)) || typeof data.savedAt !== 'string') return { ok: false, reason: 'invalid' };
    serializePlanner(data.offers, data.savedAt);
    return { ok: true, value: data };
  } catch { return { ok: false, reason: 'invalid' }; }
}

export function readPlannerStorage(storage) {
  try {
    const raw = storage.getItem(PLANNER_STORAGE_KEY);
    return raw === null ? { ok: true, value: null } : parseStoredPlanner(raw);
  } catch { return { ok: false, reason: 'unavailable' }; }
}

export function savePlannerStorage(storage, offers, savedAt) {
  let data;
  try { data = serializePlanner(offers, savedAt); } catch { return { ok: false, reason: 'invalid' }; }
  try { storage.setItem(PLANNER_STORAGE_KEY, data); return { ok: true }; }
  catch { return { ok: false, reason: 'unavailable' }; }
}

export function clearPlannerStorage(storage) {
  try { storage.removeItem(PLANNER_STORAGE_KEY); return { ok: true }; }
  catch { return { ok: false, reason: 'unavailable' }; }
}

const copy = {
  hu: {
    eye: 'UTAZÁSI DÖNTÉSTERVEZŐ / 02', title: 'Három lehetőség.<br><em>A te döntésed.</em>',
    intro: 'Tedd egymás mellé az utakat, amelyeket fontolgatsz. A teljes költség és a használható idő együtt többet mond, mint egy kiemelt ár.',
    private: 'Saját bevitelből számolunk, a böngésződben. Nem keresünk piaci árat, és nem küldjük el a terveidet.',
    sample: 'Példa betöltése', fresh: 'Tiszta lap', add: 'Harmadik lehetőség', addMore: 'Új lehetőség',
    save: 'Mentés ezen az eszközön', load: 'Mentett terv betöltése', noSaved: 'Ezen az eszközön nincs mentett terv.', delete: 'Eszközre mentett terv törlése', export: 'Terv letöltése (JSON)',
    workspace: 'A lehetőségeid', hint: 'Minden költség a teljes útra, egy főre vonatkozik. Az üres mező ismeretlen, a 0 ismert nulla költség.',
    offer: 'Lehetőség', remove: 'Eltávolítás', manual: 'SAJÁT BEVITEL', sampleBadge: 'SZEMLÉLTETŐ MINTA',
    sampleNote: 'Kitalált mintaadatok. Szerkesztés és mentés után is mintaként jelöljük őket. Saját tervhez válaszd a Tiszta lap gombot.',
    manualNote: 'A bevitt adatok nincsenek szolgáltatónál ellenőrizve.',
    name: 'Az út neve', namePlaceholder: 'Pl. három nap egy városban', currency: 'Pénznem',
    base: 'Hirdetett ár / fő', extras: 'Minden extra összesen / fő',
    extrasHint: 'Add össze, ami még szükséges: poggyász, helyi eljutás, további szállás, díjak.',
    travelers: 'Utazók száma', nights: 'Szálláséjszakák', hours: 'Használható célállomási órák',
    hoursHint: 'A saját becslésed a helyszínen ténylegesen használható időre. Nem az út teljes hossza.',
    budget: 'Saját teljes csoportkeret (opcionális)', budgetHint: 'Az összes utazóra, a fent választott pénznemben.',
    unknown: 'Ismeretlen', notApplicable: 'Nem számítható', result: 'Ebből áll össze',
    perPerson: 'Teljes költség / fő', group: 'Teljes csoportköltség', uplift: 'Extrák az alapárhoz képest',
    perHour: 'Költség / használható óra / fő', perNight: 'Költség / szálláséjszaka / fő',
    remaining: 'A keretből marad', over: 'Ennyivel haladja meg a keretet',
    emptyCosts: 'A teljes összeghez add meg az alapárat és az összes extrát. Ismert nulla költséghez írj 0-t.',
    noTravelers: 'A csoportköltséghez add meg az utazók egész számát.',
    noDivisor: 'Óra vagy éjszaka szerinti költséget csak ismert, pozitív értéknél számolunk. Nulla alapárnál nincs felárszázalék.',
    invalid: 'Javítsd a jelölt mezőket; addig nem mutatunk összesített eredményt.',
    moneyError: '0 és 1 000 000 000 közötti összeg kell, legfeljebb két tizedesjeggyel.',
    travelersError: '1 és 99 közötti egész utazólétszám kell.',
    nightsError: '0 és 3650 közötti egész éjszakaszám kell.',
    hoursError: '0 és 87 600 közötti óraszám kell, legfeljebb két tizedesjeggyel.',
    currencyError: 'Válassz a felsorolt pénznemekből.', nameError: 'Legfeljebb 120 karaktert adj meg.',
    mixed: 'Különböző pénznemek: nincs átváltás vagy közös árrangsor. Minden eredmény a saját pénznemében értendő.',
    noRanking: 'Egymás melletti számítások. A több használható idő vagy az alacsonyabb óraköltség önmagában nem minősíti az utat.',
    unsaved: 'Ez a terv még nincs az eszközre mentve.', dirty: 'Módosított terv. Az eszközön az utolsó külön mentett változat marad.',
    saved: 'Elmentve ezen az eszközön.', restored: 'Az ezen az eszközön mentett terv betöltve.',
    loadError: 'A helyi terv nem olvasható vagy nem megfelelő verziójú. A képernyőn lévő terv és a régi mentés változatlan maradt.',
    saveError: 'A helyi mentés nem sikerült. A terv ezen az oldalon megmaradt; JSON-fájlként letöltheted.',
    saveInvalid: 'Mentés előtt javítsd a jelölt hibákat. Az ismeretlen, üres mezők menthetők.',
    deleted: 'Az eszközre mentett tervet töröltük. A képernyőn lévő változatot nem mentjük automatikusan.',
    deleteError: 'A helyi mentést nem sikerült törölni. Próbáld újra, vagy használd a böngésző webhelyadat-kezelését.',
    sampleLoaded: 'Szemléltető minták betöltve. Az eszköz mentését nem módosítottuk.',
    freshDone: 'Új, saját terv indult. A korábbi eszközmentés csak külön mentéssel vagy törléssel változik.',
    downloaded: 'A saját tervfájl letöltése elindult. A fájl a bevitt adatokat és a minta jelölését is tartalmazza.',
    exportError: 'A letöltés most nem indítható. A terv az oldalon megmaradt.',
    storageNote: 'A mentés csak ezen a böngészőn és eszközön érhető el. Nem fiók, nem biztonsági mentés. A betöltés lecseréli a képernyőn lévő tervet. A helyi tárhely törölhető vagy elérhetetlenné válhat.',
    methodEye: 'ÁTLÁTHATÓ SZÁMÍTÁS', methodTitle: 'Semmi rejtett pontszám.',
    formula1: 'Teljes / fő = hirdetett ár / fő + minden extra / fő. Csoport = teljes / fő × utazók.',
    formula2: 'Extrák aránya = extrák ÷ hirdetett ár × 100. Óraköltség = teljes / fő ÷ használható órák. Éjszakaköltség = teljes / fő ÷ éjszakák.',
    formula3: 'Keretkülönbség = saját csoportkeret − csoportköltség. Negatív eredmény túllépést jelent.',
    rounding: 'Az összegeket századrészben számoljuk; az osztás eredménye legfeljebb két tizedesre kerekített. A használható idő saját becslés, nem minőségi mérőszám.',
    read: 'Hogyan hasonlíts össze két ajánlatot?', noJS: 'A számoláshoz JavaScript szükséges. Az útmutatók nélküle is olvashatók.',
  },
  en: {
    eye: 'TRAVEL DECISION PLANNER / 02', title: 'Three possibilities.<br><em>Your decision.</em>',
    intro: 'Put the trips you are considering side by side. Complete cost and usable time tell you more together than a headline price.',
    private: 'Calculated from your inputs, in your browser. We do not retrieve market prices or send your plans away.',
    sample: 'Load an example', fresh: 'Start fresh', add: 'Add a third option', addMore: 'Add an option',
    save: 'Save on this device', load: 'Load saved plan', noSaved: 'There is no saved plan on this device.', delete: 'Delete device-saved plan', export: 'Download plan (JSON)',
    workspace: 'Your possibilities', hint: 'All costs cover the whole trip, per person. A blank field means unknown; 0 means a known zero cost.',
    offer: 'Option', remove: 'Remove', manual: 'YOUR INPUT', sampleBadge: 'ILLUSTRATIVE SAMPLE',
    sampleNote: 'Invented sample data. Editing and saving keep the sample label. Choose Start fresh to create your own plan.',
    manualNote: 'The entered information has not been checked with a provider.',
    name: 'Trip name', namePlaceholder: 'For example, three days in a city', currency: 'Currency',
    base: 'Headline price / person', extras: 'All extras combined / person',
    extrasHint: 'Add everything still needed: baggage, ground transport, additional accommodation and fees.',
    travelers: 'Number of travellers', nights: 'Accommodation nights', hours: 'Usable hours at the destination',
    hoursHint: 'Your estimate of time you can actually use at the destination, rather than the full journey length.',
    budget: 'Your complete group budget (optional)', budgetHint: 'For all travellers, in the currency selected above.',
    unknown: 'Unknown', notApplicable: 'Not calculated', result: 'The complete picture',
    perPerson: 'Complete cost / person', group: 'Complete group cost', uplift: 'Extras relative to headline price',
    perHour: 'Cost / usable hour / person', perNight: 'Cost / accommodation night / person',
    remaining: 'Budget remaining', over: 'Amount over budget',
    emptyCosts: 'Enter the headline price and combined extras to calculate a total. Enter 0 for a known zero cost.',
    noTravelers: 'Enter a whole number of travellers to calculate the group cost.',
    noDivisor: 'Costs per hour or night require a known positive value. A zero headline price has no surcharge percentage.',
    invalid: 'Correct the marked fields; combined results are withheld until then.',
    moneyError: 'Enter an amount from 0 to 1,000,000,000 with at most two decimal places.',
    travelersError: 'Enter a whole number of travellers from 1 to 99.',
    nightsError: 'Enter a whole number of nights from 0 to 3650.',
    hoursError: 'Enter hours from 0 to 87,600 with at most two decimal places.',
    currencyError: 'Choose one of the listed currencies.', nameError: 'Use no more than 120 characters.',
    mixed: 'Different currencies: no conversion or combined price ranking. Each result is in its own currency.',
    noRanking: 'Side-by-side calculations. More usable time or a lower hourly cost does not, by itself, rate the trip.',
    unsaved: 'This plan has not been saved on the device.', dirty: 'Plan edited. The device retains the last version you explicitly saved.',
    saved: 'Saved on this device.', restored: 'The plan saved on this device has been restored.',
    loadError: 'The local plan is unreadable or uses an unsupported version. Your on-screen plan and previous saved data were left unchanged.',
    saveError: 'Local saving failed. Your plan remains on this page; you can download it as a JSON file.',
    saveInvalid: 'Correct marked errors before saving. Unknown, blank fields can be saved.',
    deleted: 'The device-saved plan was deleted. The version on screen is not saved automatically.',
    deleteError: 'The local plan could not be deleted. Try again or use your browser’s site-data controls.',
    sampleLoaded: 'Illustrative samples loaded. The device-saved plan was not changed.',
    freshDone: 'A fresh personal plan is ready. Previous device data changes only when you explicitly save or delete.',
    downloaded: 'The plan file download has started. It contains your inputs and any sample labels.',
    exportError: 'The download could not start. Your plan remains on this page.',
    storageNote: 'Saved data is available only in this browser on this device. It is not an account or a backup. Loading replaces the plan on screen. Local storage can be cleared or become unavailable.',
    methodEye: 'OPEN CALCULATIONS', methodTitle: 'No hidden score.',
    formula1: 'Complete / person = headline / person + all extras / person. Group = complete / person × travellers.',
    formula2: 'Extras percentage = extras ÷ headline × 100. Hourly cost = complete / person ÷ usable hours. Nightly cost = complete / person ÷ nights.',
    formula3: 'Budget difference = personal group budget − group cost. A negative result means the budget is exceeded.',
    rounding: 'Amounts are calculated in hundredths; division results are rounded to at most two decimal places. Usable time is your estimate, not a quality measure.',
    read: 'How do you compare two offers?', noJS: 'Calculations need JavaScript. The guides remain readable without it.',
  },
};

function fieldHTML(index, field, offer, text, { hint, wide = false, integer = false } = {}) {
  const id = `planner-${index}-${field}`;
  const isName = field === 'name';
  return `<label class="planner-field${wide ? ' planner-field-wide' : ''}" for="${id}"><span>${text[field]}</span><input id="${id}" name="${field}-${index}" data-planner-field="${field}" type="text" ${isName ? 'maxlength="120" autocomplete="off"' : `inputmode="${integer ? 'numeric' : 'decimal'}" maxlength="32" autocomplete="off"`} value="${e(offer[field])}" ${isName ? `placeholder="${e(text.namePlaceholder)}"` : 'placeholder="—"'} aria-describedby="${id}-error${hint ? ` ${id}-hint` : ''}">${hint ? `<small id="${id}-hint">${hint}</small>` : ''}<span class="planner-error" id="${id}-error"></span></label>`;
}

function offerHTML(offer, index, count, text) {
  return `<article class="planner-offer" data-planner-index="${index}" aria-labelledby="planner-offer-${index}">
    <div class="planner-offer-top"><span class="planner-number">0${index + 1}</span><h3 id="planner-offer-${index}">${text.offer} ${index + 1}</h3>${count > 1 ? `<button type="button" class="planner-remove" data-planner-remove="${index}" aria-label="${text.remove}: ${text.offer} ${index + 1}">${text.remove} <span aria-hidden="true">×</span></button>` : ''}</div>
    <p class="planner-provenance ${offer.source === 'sample' ? 'planner-provenance-sample' : ''}">${offer.source === 'sample' ? text.sampleBadge : text.manual}</p>
    <div class="planner-fields">
      ${fieldHTML(index, 'name', offer, text, { wide: true })}
      <label class="planner-field" for="planner-${index}-currency"><span>${text.currency}</span><select id="planner-${index}-currency" data-planner-field="currency" aria-describedby="planner-${index}-currency-error">${PLANNER_CURRENCIES.map(currency => `<option value="${currency}"${currency === offer.currency ? ' selected' : ''}>${currency}</option>`).join('')}</select><span class="planner-error" id="planner-${index}-currency-error"></span></label>
      ${fieldHTML(index, 'travelers', offer, text, { integer: true })}
      ${fieldHTML(index, 'base', offer, text, { wide: true })}
      ${fieldHTML(index, 'extras', offer, text, { wide: true, hint: text.extrasHint })}
      ${fieldHTML(index, 'nights', offer, text, { integer: true })}
      ${fieldHTML(index, 'hours', offer, text)}
      <p class="planner-field-hint">${text.hoursHint}</p>
      ${fieldHTML(index, 'budget', offer, text, { wide: true, hint: text.budgetHint })}
    </div>
    <div class="planner-result" data-planner-result="${index}" aria-label="${text.result}: ${text.offer} ${index + 1}"></div>
  </article>`;
}

const money = (minor, currency, lang) => minor === null ? null : new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'hu-HU', {
  style: 'currency', currency, minimumFractionDigits: minor % 100 ? 2 : 0, maximumFractionDigits: 2,
}).format(minor / 100);

function resultHTML(result, text, lang) {
  const number = (value, fallback = text.unknown) => value === null ? fallback : e(money(value, result.currency, lang));
  const percent = result.surchargePercent === null ? text.notApplicable : `${new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'hu-HU', { maximumFractionDigits: 2 }).format(result.surchargePercent)}%`;
  const warning = !result.valid ? text.invalid : result.totalPerPersonMinor === null ? text.emptyCosts : result.groupTotalMinor === null ? text.noTravelers : '';
  return `<p class="planner-result-eye">${text.result}</p><p class="planner-total-label">${text.perPerson}</p><strong class="planner-total">${number(result.totalPerPersonMinor)}</strong>
    ${warning ? `<p class="planner-result-note">${warning}</p>` : ''}
    <dl class="planner-metrics">
      <div><dt>${text.group}</dt><dd>${number(result.groupTotalMinor)}</dd></div>
      <div><dt>${text.uplift}</dt><dd>${percent}</dd></div>
      <div><dt>${text.perHour}</dt><dd>${number(result.perHourMinor, text.notApplicable)}</dd></div>
      <div><dt>${text.perNight}</dt><dd>${number(result.perNightMinor, text.notApplicable)}</dd></div>
      <div class="planner-budget${result.budgetRemainingMinor < 0 ? ' planner-budget-over' : ''}"><dt>${result.budgetRemainingMinor < 0 ? text.over : text.remaining}</dt><dd>${number(result.budgetRemainingMinor === null ? null : Math.abs(result.budgetRemainingMinor))}</dd></div>
    </dl><p class="planner-result-footnote">${text.noDivisor}</p>`;
}

export function plannerPage(lang = 'hu') {
  const language = lang === 'en' ? 'en' : 'hu';
  const text = copy[language];
  const offers = [blank(language), blank(language)];
  return `<div id="trip-planner" class="planner-page container" data-planner-lang="${language}">
    <section class="planner-hero"><div><p class="planner-eyebrow">${text.eye}</p><h1>${text.title}</h1></div><div class="planner-hero-copy"><p>${text.intro}</p><small>${text.private}</small></div></section>
    <section class="planner-workspace" aria-labelledby="planner-workspace-heading">
      <div class="planner-toolbar"><div><h2 id="planner-workspace-heading">${text.workspace}</h2><p>${text.hint}</p></div><div class="planner-top-actions"><button class="planner-button planner-button-outline" type="button" data-planner-sample>${text.sample}</button><button class="planner-button planner-button-text" type="button" data-planner-fresh>${text.fresh}</button></div></div>
      <p class="planner-source-note" data-planner-source-note>${text.manualNote}</p>
      <div class="planner-grid" data-planner-grid>${offers.map((offer, index) => offerHTML(offer, index, offers.length, text)).join('')}</div>
      <button class="planner-add" type="button" data-planner-add><span aria-hidden="true">＋</span>${text.add}</button>
      <p class="planner-comparison-note" data-planner-comparison-note>${text.noRanking}</p>
      <noscript><p class="planner-source-note">${text.noJS}</p></noscript>
    </section>
    <section class="planner-save-panel" aria-label="${text.save}"><div><p class="planner-save-state" data-planner-save-state>${text.unsaved}</p><p class="planner-storage-note">${text.storageNote}</p></div><div class="planner-save-actions"><button type="button" class="planner-button planner-button-dark" data-planner-save>${text.save}</button><button type="button" class="planner-button planner-button-outline" data-planner-load>${text.load}</button><button type="button" class="planner-button planner-button-outline" data-planner-export>${text.export}</button><button type="button" class="planner-button planner-button-text" data-planner-delete>${text.delete}</button></div><p class="planner-status" data-planner-status role="status" aria-live="polite" aria-atomic="true"></p></section>
    <section class="planner-method"><div><p class="planner-eyebrow">${text.methodEye}</p><h2>${text.methodTitle}</h2><a href="/${language}/blog/ket-ajanlat-azonos-alapon/">${text.read} <span aria-hidden="true">↗</span></a></div><div class="planner-formulas"><p>${text.formula1}</p><p>${text.formula2}</p><p>${text.formula3}</p><small>${text.rounding}</small></div></section>
  </div>`;
}

function samples(lang) {
  const hu = lang === 'hu';
  return [
    { name: hu ? 'Minta · rövid városi út' : 'Sample · short city break', base: hu ? '68000' : '170', extras: hu ? '22000' : '55', nights: '3', hours: '38' },
    { name: hu ? 'Minta · nyugodtabb hétvége' : 'Sample · slower weekend', base: hu ? '76000' : '190', extras: hu ? '12000' : '30', nights: '3', hours: '47' },
    { name: hu ? 'Minta · egy nappal tovább' : 'Sample · one extra day', base: hu ? '82000' : '205', extras: hu ? '28000' : '70', nights: '4', hours: '60' },
  ].map(item => ({ ...blank(lang), ...item, budget: hu ? '200000' : '500', source: 'sample' }));
}

export function initPlanner(lang) {
  if (typeof document === 'undefined') return false;
  const root = document.getElementById('trip-planner');
  if (!root || root.dataset.plannerBound === 'true') return false;
  root.dataset.plannerBound = 'true';
  const language = (lang || root.dataset.plannerLang) === 'en' ? 'en' : 'hu';
  const text = copy[language];
  const grid = root.querySelector('[data-planner-grid]');
  const status = root.querySelector('[data-planner-status]');
  const saveState = root.querySelector('[data-planner-save-state]');
  const add = root.querySelector('[data-planner-add]');
  let offers = [blank(language), blank(language)];
  let hasSavedVersion = false;
  const storage = () => { try { return globalThis.localStorage; } catch { return undefined; } };
  const announce = message => { status.textContent = message; };
  const update = () => {
    const comparison = comparePlans(offers);
    comparison.results.forEach((result, index) => {
      root.querySelector(`[data-planner-result="${index}"]`).innerHTML = resultHTML(result, text, language);
      fields.forEach(field => {
        const input = root.querySelector(`#planner-${index}-${field}`);
        const error = root.querySelector(`#planner-${index}-${field}-error`);
        const code = result.errors[field];
        input.setAttribute('aria-invalid', code ? 'true' : 'false');
        error.textContent = code ? text[`${code}Error`] : '';
      });
    });
    root.querySelector('[data-planner-comparison-note]').textContent = comparison.mixedCurrencies ? text.mixed : text.noRanking;
    root.querySelector('[data-planner-source-note]').textContent = offers.some(offer => offer.source === 'sample') ? text.sampleNote : text.manualNote;
    add.hidden = offers.length === 3;
    add.innerHTML = `<span aria-hidden="true">＋</span>${offers.length === 2 ? text.add : text.addMore}`;
    return comparison;
  };
  const renderOffers = () => {
    grid.innerHTML = offers.map((offer, index) => offerHTML(offer, index, offers.length, text)).join('');
    grid.dataset.count = offers.length;
    update();
  };
  const markDirty = () => {
    saveState.textContent = hasSavedVersion ? text.dirty : text.unsaved;
    announce('');
  };
  renderOffers();
  const onField = event => {
    const field = event.target.dataset?.plannerField;
    if (!fields.includes(field)) return;
    const card = event.target.closest('[data-planner-index]');
    const index = Number(card?.dataset.plannerIndex);
    if (!Number.isInteger(index) || !offers[index]) return;
    offers[index][field] = event.target.value;
    markDirty();
    update(); // Only results and error text are replaced: focused inputs survive.
  };
  grid.addEventListener('input', onField);
  grid.addEventListener('change', onField);
  grid.addEventListener('click', event => {
    const button = event.target.closest('[data-planner-remove]');
    if (!button || offers.length <= 1) return;
    const index = Number(button.dataset.plannerRemove);
    if (!Number.isInteger(index) || !offers[index]) return;
    offers.splice(index, 1);
    markDirty();
    renderOffers();
    root.querySelector(`#planner-${Math.min(index, offers.length - 1)}-name`)?.focus();
  });
  add.addEventListener('click', () => {
    if (offers.length >= 3) return;
    offers.push(blank(language));
    markDirty();
    renderOffers();
    root.querySelector(`#planner-${offers.length - 1}-name`)?.focus();
  });
  root.querySelector('[data-planner-sample]').addEventListener('click', () => {
    offers = samples(language);
    markDirty();
    renderOffers();
    announce(text.sampleLoaded);
  });
  root.querySelector('[data-planner-fresh]').addEventListener('click', () => {
    offers = [blank(language), blank(language)];
    markDirty();
    renderOffers();
    announce(text.freshDone);
  });
  const showInvalid = () => {
    update();
    announce(text.saveInvalid);
    root.querySelector('[aria-invalid="true"]')?.focus();
  };
  root.querySelector('[data-planner-save]').addEventListener('click', () => {
    const saved = savePlannerStorage(storage(), offers);
    if (!saved.ok && saved.reason === 'invalid') return showInvalid();
    if (!saved.ok) { announce(text.saveError); return; }
    hasSavedVersion = true;
    saveState.textContent = text.saved;
    announce(`${text.saved}${offers.some(offer => offer.source === 'sample') ? ` ${text.sampleNote}` : ''}`);
  });
  root.querySelector('[data-planner-load]').addEventListener('click', () => {
    const restored = readPlannerStorage(storage());
    if (!restored.ok) { announce(text.loadError); return; }
    if (!restored.value) { announce(text.noSaved); return; }
    offers = restored.value.offers;
    hasSavedVersion = true;
    renderOffers();
    saveState.textContent = text.restored;
    announce(`${text.restored}${offers.some(offer => offer.source === 'sample') ? ` ${text.sampleNote}` : ''}`);
  });
  root.querySelector('[data-planner-delete]').addEventListener('click', () => {
    const deleted = clearPlannerStorage(storage());
    if (!deleted.ok) { announce(text.deleteError); return; }
    hasSavedVersion = false;
    saveState.textContent = text.unsaved;
    announce(text.deleted);
  });
  root.querySelector('[data-planner-export]').addEventListener('click', () => {
    let data;
    try { data = serializePlanner(offers); } catch { return showInvalid(); }
    let url;
    try {
      url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `tripgoes-planner-${language}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      announce(text.downloaded);
    } catch { announce(text.exportError); }
    finally { if (url) setTimeout(() => URL.revokeObjectURL(url), 1000); }
  });
  return true;
}
