import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetEmbed, validateExperiences, widgetDocument, experiencesPage, WIDGET_SCRIPT_HOSTS } from '../src/experiences.mjs';

const embed = '<div id="tp-widget"></div><script async src="https://tp.media/content?promo_id=1&shmarker=793137" charset="utf-8"></script>';
const section = (changes = {}) => ({
  id: 'budapest', height: 420,
  hu: { title: 'Budapest', intro: 'Belépők és séták a városban, foglalható időpontokkal és a szolgáltató saját feltételeivel.' },
  en: { title: 'Budapest', intro: 'Tickets and walking tours in the city, with bookable times and the provider’s own conditions.' },
  embed, ...changes,
});
const config = (changes = {}) => ({ version: 1, sections: [section()], ...changes });

test('a widget snippet may only load scripts from allowed partner hosts', () => {
  const result = validateWidgetEmbed(embed);
  assert.equal(result.sources.length, 1);
  assert.ok(WIDGET_SCRIPT_HOSTS.includes(new URL(result.sources[0]).hostname));
  for (const broken of [
    '', '   ', 42,
    '<script async src="https://evil.example/widget.js"></script>',
    '<script async src="http://tp.media/content"></script>',
    '<script>alert(1)</script>',
    '<script async src="https://tp.media/content">doSomething()</script>',
    '<div onclick="alert(1)"></div><script async src="https://tp.media/content"></script>',
    '<iframe src="https://tp.media/content"></iframe>',
    '<script async src="https://tp.media/content" onload="x()"></script>',
    '<div id="x"></div>',
    '<p>Marketing copy we did not write</p><script async src="https://tp.media/content"></script>',
  ]) assert.throws(() => validateWidgetEmbed(broken), TypeError, String(broken).slice(0, 40));
});

test('configuration requires bilingual copy, a bounded height and unique ids', () => {
  const sections = validateExperiences(config());
  assert.equal(sections.length, 1);
  assert.equal(sections[0].hu.title, 'Budapest');
  for (const broken of [
    null, { version: 2, sections: [section()] }, { version: 1, sections: [] },
    config({ sections: [section(), section()] }),
    config({ sections: [section({ id: 'Budapest' })] }),
    config({ sections: [section({ height: 10 })] }),
    config({ sections: [section({ hu: { title: 'Budapest', intro: 'Rövid.' } })] }),
    config({ sections: [section({ en: undefined })] }),
  ]) assert.throws(() => validateExperiences(broken), TypeError);
});

test('each widget gets its own sandboxed document with a policy of its own', () => {
  const [parsed] = validateExperiences(config());
  const html = widgetDocument(parsed, 'hu');
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('https://tp.media'));
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(html.includes('name="robots" content="noindex"'));
  assert.ok(html.includes(embed.split('><script')[1] ? 'tp.media/content' : 'tp.media'));
  // The widget document is where third-party code is allowed, nowhere else.
  assert.ok(!html.includes('tripgoes-api'));
});

test('the page frames each widget without granting it this origin', () => {
  const sections = validateExperiences(config());
  const html = experiencesPage(sections, 'hu');
  assert.ok(html.includes('src="/widgets/budapest-hu.html"'));
  assert.ok(html.includes('sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"'));
  assert.ok(!html.includes('allow-same-origin'));
  assert.ok(html.includes('referrerpolicy="no-referrer"'));
  assert.ok(html.includes('loading="lazy"'));
  // Commission disclosure stays on the page itself, not inside the partner frame.
  assert.ok(html.includes('jutalékot kaphatunk'));
  assert.ok(experiencesPage(sections, 'en').includes('src="/widgets/budapest-en.html"'));
  assert.ok(experiencesPage(sections, 'en').includes('commission'));
  assert.ok(!html.includes('<script'));
  assert.throws(() => experiencesPage([], 'hu'), TypeError);
});

test('supplied copy is escaped before it reaches the page', () => {
  const sections = validateExperiences(config({ sections: [section({ hu: { title: '<img src=x>', intro: 'Belépők és séták a városban, foglalható időpontokkal és a szolgáltató saját feltételeivel.' } })] }));
  const html = experiencesPage(sections, 'hu');
  assert.ok(html.includes('&lt;img src=x&gt;'));
  assert.ok(!html.includes('<img src=x'));
});
