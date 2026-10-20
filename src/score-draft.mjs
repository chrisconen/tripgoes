// Local, explicitly saved input only. Stored results and verification claims are never restored.
export const SCORE_DRAFT_KEY = 'tripgoes-score-draft-v1';
export const DRAFT_VERSION = 1;
export const MAX_DRAFT_LENGTH = 16_384;
export const DRAFT_FIELDS = Object.freeze([
  'route', 'departureDate', 'nights', 'travelers', 'currency', 'price',
  'baggage', 'transfer', 'accommodation', 'other', 'inclusions',
]);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function text(value, maximum) {
  return typeof value === 'string' && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);
}
function date(value) {
  return value === '' || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
}
function money(value) {
  return typeof value === 'string' && (value === '' ||
    (value.length <= 13 && /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value) && Number(value) <= 1_000_000_000));
}
function integer(value, min, max) {
  return typeof value === 'string' && (value === '' ||
    (/^\d{1,3}$/.test(value) && Number(value) >= min && Number(value) <= max));
}
function normalize(value, savedAt) {
  if (!record(value) || !record(value.fields) || !['sample', 'user-entered'].includes(value.evidence) ||
      !Array.isArray(value.history) || value.history.length > 30 ||
      typeof savedAt !== 'string' || savedAt.length !== 24 || !Number.isFinite(Date.parse(savedAt)) ||
      new Date(savedAt).toISOString() !== savedAt) return null;
  const source = value.fields;
  if (!text(source.route, 120) || !text(source.inclusions, 240) || !date(source.departureDate) ||
      !integer(source.nights, 0, 365) || !integer(source.travelers, 1, 99) ||
      !['HUF', 'EUR', 'GBP', 'USD'].includes(source.currency) ||
      !['price', 'baggage', 'transfer', 'accommodation', 'other'].every(key => money(source[key]))) return null;
  if (value.history.some(row => !record(row) || !date(row.date) || !money(row.price))) return null;
  return {
    version: DRAFT_VERSION, savedAt, evidence: value.evidence,
    fields: Object.fromEntries(DRAFT_FIELDS.map(key => [key, source[key]])),
    history: value.history.map(row => ({date: row.date, price: row.price})),
  };
}
export function createDraft(input, {now = new Date().toISOString()} = {}) {
  const draft = normalize(input, now);
  if (!draft || JSON.stringify(draft).length > MAX_DRAFT_LENGTH) throw new TypeError('Invalid draft input.');
  return draft;
}
export function parseDraft(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_DRAFT_LENGTH) return null;
  try {
    const value = JSON.parse(raw);
    return value?.version === DRAFT_VERSION ? normalize(value, value.savedAt) : null;
  } catch { return null; }
}
export function readDraft(storage) {
  try {
    const raw = (storage ?? globalThis.localStorage).getItem(SCORE_DRAFT_KEY);
    if (raw === null) return {status: 'missing'};
    const draft = parseDraft(raw);
    return draft ? {status: 'ok', draft} : {status: 'invalid'};
  } catch { return {status: 'unavailable'}; }
}
export function saveDraft(input, {storage, now} = {}) {
  let draft;
  try { draft = createDraft(input, {now}); } catch { return {status: 'invalid'}; }
  try {
    (storage ?? globalThis.localStorage).setItem(SCORE_DRAFT_KEY, JSON.stringify(draft));
    return {status: 'ok', draft};
  } catch { return {status: 'unavailable'}; }
}
export function deleteDraft(storage) {
  try {
    (storage ?? globalThis.localStorage).removeItem(SCORE_DRAFT_KEY);
    return {status: 'ok'};
  } catch { return {status: 'unavailable'}; }
}
