import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateServices, servicePolicy, servicesPage, WIDGET_HOSTS, MARKER, TRS } from '../src/services.mjs';

const widget = (changes = {}) => ({
  id: 'esim',
  src: `https://tpscr.com/content?trs=${TRS}&shmarker=${MARKER}&locale=en&powered_by=false&promo_id=8588&campaign_id=541`,
  hosts: { script: ['https://tpscr.com'], img: ['https://tpscr.com'], frame: [], connect: ['https://tpo.gg'] },
  hu: { title: 'Mobilnet külföldön', intro: 'eSIM-adatcsomag több mint 200 országra, kártyacsere nélkül, a leszállás után.' },
  en: { title: 'Mobile data abroad', intro: 'eSIM data packs for more than 200 countries, with no card to swap on arrival.' },
  ...changes,
});
const config = (changes = {}) => ({ version: 1, widgets: [widget()], ...changes });

test('a widget must sit on a known host and carry our affiliate identifiers', () => {
  const { widgets } = validateServices(config());
  assert.equal(widgets.length, 1);
  assert.ok(WIDGET_HOSTS.includes(new URL(widgets[0].src).hostname));
  for (const broken of [
    null, { version: 2, widgets: [widget()] }, config({ widgets: [] }),
    config({ widgets: [widget(), widget()] }),
    config({ widgets: [widget({ id: 'eSIM' })] }),
    config({ widgets: [widget({ src: 'http://tpscr.com/content?trs=' + TRS + '&shmarker=' + MARKER })] }),
    config({ widgets: [widget({ src: 'https://evil.example/content?trs=' + TRS + '&shmarker=' + MARKER })] }),
    // Earning nothing is a silent failure, so a missing marker fails the build.
    config({ widgets: [widget({ src: `https://tpscr.com/content?trs=${TRS}` })] }),
    config({ widgets: [widget({ src: `https://tpscr.com/content?shmarker=${MARKER}` })] }),
    config({ widgets: [widget({ src: `https://tpscr.com/content?trs=${TRS}&shmarker=999` })] }),
    // The badge would name the supplier.
    config({ widgets: [widget({ src: `https://tpscr.com/content?trs=${TRS}&shmarker=${MARKER}&powered_by=true` })] }),
    // No parameter may smuggle in another destination.
    config({ widgets: [widget({ src: `https://tpscr.com/content?trs=${TRS}&shmarker=${MARKER}&back=https://evil.example` })] }),
    config({ widgets: [widget({ hosts: { script: [], img: [], frame: [], connect: [] } })] }),
    config({ widgets: [widget({ hosts: { script: ['https://tpscr.com/path'], img: [], frame: [], connect: [] } })] }),
    config({ widgets: [widget({ hosts: { script: ['https://tpscr.com'], img: [], frame: [] } })] }),
    config({ widgets: [widget({ hu: { title: 'x', intro: 'rövid' } })] }),
    config({ widgets: [widget({ en: undefined })] }),
  ]) assert.throws(() => validateServices(broken), TypeError, JSON.stringify(broken)?.slice(0, 70));
});

test('the policy is the union of the declared hosts and widens nothing else', () => {
  const parsed = validateServices(config({ widgets: [
    widget(),
    widget({ id: 'car', src: `https://tp.media/content?campaign_id=222&promo_id=8813&shmarker=${MARKER}&trs=${TRS}`,
      hosts: { script: ['https://tp.media'], img: [], frame: ['https://getrentacar.com'], connect: [] } }),
  ] }));
  const policy = servicePolicy(parsed);
  assert.equal(policy.scriptExtra, ' https://tp.media https://tpscr.com');
  assert.equal(policy.frameSrc, 'https://getrentacar.com');
  assert.deepEqual(policy.connectExtra, ['https://tpo.gg']);
  // These widgets style themselves inline; the allowance is scoped to them.
  assert.equal(policy.styleExtra, " 'unsafe-inline'");
  assert.equal(servicePolicy(validateServices(config())).frameSrc, "'none'");
});

test('the page renders one block per widget and escapes its copy', () => {
  const parsed = validateServices(config());
  const html = servicesPage(parsed, 'hu');
  assert.equal(html.match(/<script async src="https:\/\/tpscr\.com/g).length, 1);
  assert.ok(html.includes('Mobilnet külföldön'));
  assert.ok(servicesPage(parsed, 'en').includes('Mobile data abroad'));
  assert.ok(html.includes('noscript'));
  // The commission wording is kept off every visitor-facing page.
  for (const banned of ['jutalék', 'commission']) assert.ok(!html.toLowerCase().includes(banned));
  const injected = servicesPage(validateServices(config({ widgets: [widget({ hu: { title: '<img src=x>', intro: 'eSIM-adatcsomag több mint 200 országra, kártyacsere nélkül, a leszállás után.' } })] })), 'hu');
  assert.ok(injected.includes('&lt;img src=x&gt;') && !injected.includes('<img src=x'));
  assert.throws(() => servicesPage({ widgets: [] }, 'hu'), TypeError);
});

test('the shipped configuration is valid and every widget declares its own origin', async () => {
  const raw = JSON.parse(await readFile(new URL('../content/services.json', import.meta.url), 'utf8'));
  const { widgets } = validateServices(raw);
  assert.ok(widgets.length >= 4, `only ${widgets.length} widgets`);
  for (const entry of widgets) {
    assert.ok(entry.hosts.script.includes(new URL(entry.src).origin), `${entry.id} omits its own origin`);
    assert.equal(new URL(entry.src).searchParams.get('shmarker'), MARKER);
    assert.equal(new URL(entry.src).searchParams.get('trs'), TRS);
  }
  assert.deepEqual(widgets.map(entry => entry.id), ['esim', 'transfer', 'car', 'compensation']);
});
