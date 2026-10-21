import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateWidget, validateExperiences, widgetPolicy, experiencesPage, WIDGET_HOSTS } from '../src/experiences.mjs';

const widget = (changes = {}) => ({
  src: 'https://tpscr.com/content?promo_id=4489&campaign_id=150&powered_by=false&tours=3&locale=en&shmarker=793137.793137&trs=588496',
  hosts: { script: ['https://tpscr.com', 'https://wegotrip.com'], img: ['https://tpscr.com'], frame: ['https://wegotrip.com'], connect: ['https://tpo.gg'] },
  ...changes,
});
const section = (changes = {}) => ({
  id: 'budapest', cityId: '3054643',
  hu: { title: 'Budapest', intro: 'Belépők, séták és vezetett programok a városban, foglalható időpontokkal.' },
  en: { title: 'Budapest', intro: 'Tickets, walks and guided activities in the city, with bookable times.' },
  ...changes,
});
const config = (changes = {}) => ({ version: 1, widget: widget(), sections: [section()], ...changes });

test('the widget template is checked against allowed hosts and parameters', () => {
  const parsed = validateWidget(widget());
  assert.ok(WIDGET_HOSTS.includes(new URL(parsed.src).hostname));
  assert.deepEqual(parsed.hosts.frame, ['https://wegotrip.com']);
  for (const broken of [
    undefined, { src: 'not a url', hosts: widget().hosts },
    widget({ src: 'http://tpscr.com/content?powered_by=false' }),
    widget({ src: 'https://evil.example/content?powered_by=false' }),
    // The attribution badge must stay off, and the city is never baked in.
    widget({ src: 'https://tpscr.com/content?promo_id=4489&powered_by=true' }),
    widget({ src: 'https://tpscr.com/content?promo_id=4489&powered_by=false&city_id=3054643' }),
    widget({ src: 'https://tpscr.com/content?promo_id=4489&powered_by=false&redirect=https://evil.example' }),
    widget({ hosts: { script: ['https://evil.example'], img: ['https://tpscr.com'], frame: ['https://wegotrip.com'], connect: ['https://tpo.gg'] } }),
    widget({ hosts: { script: ['https://tpscr.com/path'], img: ['https://tpscr.com'], frame: ['https://wegotrip.com'], connect: ['https://tpo.gg'] } }),
    widget({ hosts: { script: ['https://tpscr.com'], img: ['https://tpscr.com'], frame: ['https://wegotrip.com'] } }),
    widget({ hosts: { script: ['https://tpscr.com'], img: ['https://tpscr.com'], frame: ['https://wegotrip.com'], connect: ['https://tpo.gg'], other: ['https://x.example'] } }),
  ]) assert.throws(() => validateWidget(broken), TypeError, String(JSON.stringify(broken)).slice(0, 60));
});

test('every section becomes the same template with its own city', () => {
  const { sections } = validateExperiences(config({ sections: [section(), section({ id: 'rome', cityId: '3169070' })] }));
  assert.equal(sections.length, 2);
  assert.equal(new URL(sections[0].src).searchParams.get('city_id'), '3054643');
  assert.equal(new URL(sections[1].src).searchParams.get('city_id'), '3169070');
  assert.equal(new URL(sections[1].src).searchParams.get('powered_by'), 'false');
  // Adding a destination is configuration, never a new snippet.
  assert.equal(new URL(sections[0].src).origin, new URL(sections[1].src).origin);
});

test('configuration requires bilingual copy, unique ids and a plausible city', () => {
  for (const broken of [
    null, { version: 2, widget: widget(), sections: [section()] }, config({ sections: [] }),
    config({ sections: [section(), section()] }),
    config({ sections: [section({ id: 'Budapest' })] }),
    config({ sections: [section({ cityId: '12' })] }),
    config({ sections: [section({ cityId: 3054643 })] }),
    config({ sections: [section({ hu: { title: 'Budapest', intro: 'Rövid.' } })] }),
    config({ sections: [section({ en: undefined })] }),
  ]) assert.throws(() => validateExperiences(broken), TypeError);
});

test('the policy widens only for the declared hosts', () => {
  const { widget: parsed } = validateExperiences(config());
  const policy = widgetPolicy(parsed);
  assert.equal(policy.scriptExtra, ' https://tpscr.com https://wegotrip.com');
  assert.equal(policy.imgExtra, ' https://tpscr.com');
  assert.equal(policy.frameSrc, 'https://wegotrip.com');
  assert.deepEqual(policy.connectExtra, ['https://tpo.gg']);
});

test('the page carries the partner script, the disclosure and escaped copy', () => {
  const parsed = validateExperiences(config());
  const html = experiencesPage(parsed, 'hu');
  assert.ok(html.includes('<script async src="https://tpscr.com/content?'));
  assert.ok(html.includes('city_id=3054643'));
  assert.ok(html.includes('jutalékot kaphatunk'));
  assert.ok(experiencesPage(parsed, 'en').includes('commission'));
  assert.ok(html.includes('noscript'));
  const injected = experiencesPage(validateExperiences(config({ sections: [section({ hu: { title: '<img src=x>', intro: 'Belépők, séták és vezetett programok a városban, foglalható időpontokkal.' } })] })), 'hu');
  assert.ok(injected.includes('&lt;img src=x&gt;') && !injected.includes('<img src=x'));
  assert.throws(() => experiencesPage({ sections: [] }, 'hu'), TypeError);
});

test('the shipped configuration is valid and every city is distinct', async () => {
  const raw = JSON.parse(await readFile(new URL('../content/experiences.json', import.meta.url), 'utf8'));
  const { sections } = validateExperiences(raw);
  assert.ok(sections.length >= 1);
  assert.equal(new Set(sections.map(s => s.cityId)).size, sections.length);
  assert.ok(sections.some(s => s.id === 'budapest'));
});
