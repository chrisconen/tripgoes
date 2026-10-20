/**
 * TripScore v1: a deterministic comparison of supplied all-in per-person prices.
 * This module neither fetches nor authenticates observations. See docs/score-design.md.
 */
export const SCORE_RULES = Object.freeze({
  version: '1.0.0', minimumDays: 5, minimumSpanDays: 7, windowDays: 90,
  maximumLatestAgeDays: 14, maximumRecords: 1000, maximumAmount: 1_000_000_000,
  medianScore: 50, pointsPerSavingsPercent: 1.5,
});
const DAY = 86_400_000;
const FEE_KEYS = ['baggage', 'transfer', 'accommodation', 'other'];
const clamp = value => Math.max(0, Math.min(100, value));
const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function amount(value, allowZero = false) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' &&
      (value.length > 32 || !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value.trim()))) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number > SCORE_RULES.maximumAmount ||
      (allowZero ? number < 0 : number <= 0)) return null;
  const cents = Math.round(number * 100);
  return Math.abs(number * 100 - cents) < 0.0001 ? cents : null;
}

function dateDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
    ? time / DAY : null;
}

function integer(value, min, max) {
  if (typeof value === 'string' && !/^\d{1,3}$/.test(value)) return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

function comparison(value) {
  if (!record(value)) return null;
  if (typeof value.currency !== 'string' || !/^[A-Za-z]{3}$/.test(value.currency)) return null;
  if (typeof value.route !== 'string' || value.route.length > 120 || !value.route.trim() ||
      /[\u0000-\u001f\u007f]/.test(value.route)) return null;
  if (!Array.isArray(value.inclusions) || !value.inclusions.length || value.inclusions.length > 32 ||
      value.inclusions.some(item => typeof item !== 'string' || !item.trim() ||
        item.length > 80 || /[\u0000-\u001f\u007f]/.test(item))) return null;
  const departure = dateDay(value.departureDate);
  const nights = integer(value.nights, 0, 365);
  const travelers = integer(value.travelers, 1, 99);
  if (departure === null || nights === null || travelers === null) return null;
  const normalized = {
    currency: value.currency.toUpperCase(),
    route: value.route.normalize('NFKC').trim().replace(/[–—−]/g, '-').replace(/\s+/g, ' ').toUpperCase(),
    departureDate: value.departureDate, nights, travelers,
    inclusions: [...new Set(value.inclusions.map(item => item.normalize('NFKC').trim().toLowerCase()))].sort(),
  };
  return {key: JSON.stringify(normalized), departure, ...normalized};
}

function median(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** `now` must be fixed by callers that need reproducible replay. Prices are per person. */
export function analyzeOffer(input, {now = new Date().toISOString()} = {}) {
  const flags = new Set();
  const errors = [];
  const result = {
    version: SCORE_RULES.version, status: 'invalid', score: null, qualityScore: 0,
    confidence: {score: 0, label: 'insufficient', kind: 'evidence-coverage'},
    evidence: 'user-entered', totalCost: null, groupCost: null, currency: null,
    median: null, savingsPct: null, savingsAmount: null, components: [],
    sampleCount: 0, excludedCount: 0, historyDays: 0, latestAgeDays: null,
    flags: [], errors, observations: [],
  };
  const finish = () => ({...result, flags: [...flags]});
  const clock = typeof now === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*Z)?$/.test(now)
    ? Date.parse(now) : NaN;
  if (!Number.isFinite(clock) || dateDay(String(now).slice(0, 10)) === null) errors.push('invalid-now');
  if (!record(input)) {
    errors.push('invalid-offer');
    return finish();
  }
  const today = Math.floor(clock / DAY);
  const signature = comparison(input);
  if (!signature) errors.push('invalid-comparison-fields');
  else if (signature.departure < today) errors.push('departure-in-past');
  const base = amount(input.price);
  if (base === null) errors.push('invalid-price');
  const fees = record(input.fees) ? input.fees : {};
  const feeAmounts = FEE_KEYS.map(key => amount(fees[key], true));
  if (feeAmounts.some(value => value === null)) errors.push('incomplete-or-invalid-fees');
  if (Object.keys(fees).some(key => !FEE_KEYS.includes(key))) errors.push('unknown-fee');
  const history = input.history === undefined ? [] : input.history;
  if (!Array.isArray(history) || history.length > SCORE_RULES.maximumRecords) errors.push('invalid-history');
  if (!['user-entered', 'sample', 'verified', undefined].includes(input.evidence)) errors.push('invalid-evidence');
  result.evidence = input.evidence === 'sample' ? 'sample' : 'user-entered';
  flags.add(result.evidence === 'sample' ? 'sample-data' : 'user-entered-data');
  if (input.evidence === 'verified') flags.add('verification-unavailable');
  if (errors.length) return finish();
  const totalCents = base + feeAmounts.reduce((sum, value) => sum + value, 0);
  if (totalCents > SCORE_RULES.maximumAmount * 100) {
    errors.push('total-too-large');
    return finish();
  }
  result.totalCost = totalCents / 100;
  result.groupCost = round(result.totalCost * signature.travelers);
  result.currency = signature.currency;
  result.status = 'insufficient-evidence';
  const byDay = new Map();
  let accepted = 0;
  for (const observation of history) {
    let reason = null;
    const comparable = comparison(observation);
    const price = amount(observation?.price);
    const day = dateDay(observation?.date);
    const evidence = observation?.evidence ?? 'user-entered';
    // Historical `price` is already all-in. A fee object would make that
    // contract ambiguous, so exclude it instead of silently ignoring charges.
    if (!comparable || price === null || day === null || Object.hasOwn(observation, 'fees') ||
        !['user-entered', 'sample', 'verified'].includes(evidence)) reason = 'invalid-history-records';
    else if (comparable.key !== signature.key) reason = 'non-comparable-history';
    else if (day > today || day > signature.departure) reason = 'future-history';
    else if (today - day > SCORE_RULES.windowDays) reason = 'out-of-window-history';
    else if ((evidence === 'sample') !== (result.evidence === 'sample')) reason = 'mixed-evidence-excluded';
    else {
      if (evidence === 'verified') flags.add('verification-unavailable');
      const daily = byDay.get(day) ?? new Set();
      if (daily.has(price)) reason = 'duplicate-history';
      else {
        if (daily.size) flags.add('same-day-history-aggregated');
        daily.add(price);
        byDay.set(day, daily);
        accepted++;
      }
    }
    if (reason) {
      flags.add(reason);
      result.excludedCount++;
    }
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);
  const dailyCents = days.map(day => median([...byDay.get(day)]));
  result.observations = days.map((day, index) => ({
    date: new Date(day * DAY).toISOString().slice(0, 10),
    price: dailyCents[index] / 100,
  }));
  result.sampleCount = days.length;
  result.historyDays = days.length ? days.at(-1) - days[0] : 0;
  result.latestAgeDays = days.length ? today - days.at(-1) : null;
  // Completeness of entered data is not assurance that these data are true.
  result.qualityScore = Math.round(70 + (history.length ? 30 * accepted / history.length : 0));
  if (days.length < SCORE_RULES.minimumDays) flags.add('insufficient-history');
  if (result.historyDays < SCORE_RULES.minimumSpanDays) flags.add('insufficient-date-coverage');
  if (result.latestAgeDays !== null && result.latestAgeDays > SCORE_RULES.maximumLatestAgeDays) flags.add('stale-history');
  const coverage = days.length ? Math.round(
    30 * Math.min(days.length / 20, 1) +
    25 * Math.min(result.historyDays / 30, 1) +
    25 * Math.max(0, 1 - result.latestAgeDays / SCORE_RULES.maximumLatestAgeDays) + 5
  ) : 0;
  result.confidence.score = Math.min(result.evidence === 'sample' ? 20 : 60, coverage);
  const eligible = !['insufficient-history', 'insufficient-date-coverage', 'stale-history'].some(flag => flags.has(flag));
  result.confidence.label = eligible ? (result.evidence === 'sample' ? 'sample' : 'limited') : 'insufficient';
  if (!eligible) return finish();
  const baselineCents = median(dailyCents);
  const savingsPct = (baselineCents - totalCents) / baselineCents * 100;
  const score = Math.round(clamp(SCORE_RULES.medianScore + SCORE_RULES.pointsPerSavingsPercent * savingsPct));
  result.status = 'analyzed';
  result.median = round(baselineCents / 100);
  result.savingsPct = round(savingsPct);
  result.savingsAmount = round((baselineCents - totalCents) / 100);
  result.score = score;
  result.components = [{key: 'price-vs-observed-median', weight: 1, score, contribution: score}];
  flags.add('heuristic-score');
  flags.add('availability-unchecked');
  flags.add('supplied-inclusions-unverified');
  return finish();
}
