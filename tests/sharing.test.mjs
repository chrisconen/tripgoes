import test from 'node:test';
import assert from 'node:assert/strict';
import { shareLinks, renderSharing, initSharing } from '../src/sharing.mjs';

const metadata = {
  url: 'https://tripgoes.com/hu/blog/rugalmas-datumablak/',
  title: 'Árvíztűrő út & "közös terv" <város>',
  image: '/assets/hero.jpg',
};
const byId = options => Object.fromEntries(shareLinks(options).map(link => [link.id, new URL(link.url)]));

test('six HTTPS composers encode the public page, Unicode title and public image correctly', () => {
  const links = byId(metadata);
  assert.deepEqual(Object.keys(links), ['facebook', 'x', 'whatsapp', 'telegram', 'linkedin', 'pinterest']);
  for (const link of Object.values(links)) assert.equal(link.protocol, 'https:');
  assert.equal(links.facebook.origin + links.facebook.pathname, 'https://www.facebook.com/sharer/sharer.php');
  assert.equal(links.facebook.searchParams.get('u'), metadata.url);
  assert.equal(links.x.origin + links.x.pathname, 'https://x.com/intent/tweet');
  assert.equal(links.x.searchParams.get('text'), metadata.title);
  assert.equal(links.x.searchParams.get('url'), metadata.url);
  assert.equal(links.whatsapp.origin, 'https://wa.me');
  assert.equal(links.whatsapp.searchParams.get('text'), `${metadata.title}\n${metadata.url}`);
  assert.equal(links.telegram.origin + links.telegram.pathname, 'https://t.me/share/url');
  assert.equal(links.telegram.searchParams.get('text'), metadata.title);
  assert.equal(links.linkedin.origin + links.linkedin.pathname, 'https://www.linkedin.com/sharing/share-offsite/');
  assert.equal(links.linkedin.searchParams.get('url'), metadata.url);
  assert.deepEqual([...links.linkedin.searchParams.keys()], ['url']);
  assert.equal(links.pinterest.searchParams.get('media'), 'https://tripgoes.com/assets/hero.jpg');
  assert.equal(links.pinterest.searchParams.get('description'), metadata.title);
});

test('query strings and fragments never reach a platform or rendered data attributes', () => {
  const options = { ...metadata, url: `${metadata.url}?search=private-query&email=private@example.com#private-note`, image: '/assets/hero.jpg?token=private-image#hidden' };
  const result = JSON.stringify(shareLinks(options)) + renderSharing(options);
  assert.doesNotMatch(result, /private-query|private%40|private@|private-note|private-image|hidden-note/);
  const links = byId(options);
  assert.equal(links.facebook.searchParams.get('u'), metadata.url);
  assert.equal(links.pinterest.searchParams.get('media'), 'https://tripgoes.com/assets/hero.jpg');
});

test('reject unsafe, credentialled, local and non-HTTPS canonical URLs', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', '/relative/path', 'http://tripgoes.com/', 'https://user:password@tripgoes.com/', 'https://localhost/', 'https://127.0.0.1/', 'https://10.2.3.4/', 'https://[::1]/', 'https://server.internal/', 'https://preview.test/', 'https://tripgoes.com:8443/']) {
    assert.throws(() => shareLinks({ ...metadata, url }), TypeError, url);
    assert.throws(() => renderSharing({ ...metadata, url }), TypeError, url);
  }
});

test('optional images cannot leak third-party, insecure or data URLs', () => {
  for (const image of ['https://other.example/image.jpg', 'http://tripgoes.com/image.jpg', 'data:image/png;base64,private', '//other.example/image.jpg', 'https://user:secret@tripgoes.com/image.jpg']) {
    const links = byId({ ...metadata, image });
    assert.equal(links.pinterest.searchParams.has('media'), false, image);
  }
});

test('render escapes metadata, keeps usable no-JS links, and adds no SDK or event attributes', () => {
  const html = renderSharing({ ...metadata, title: '"><script>alert("unsafe")</script>&\'', lang: 'en' });
  assert.doesNotMatch(html, /<script|\bonclick=|\bonerror=|<iframe|<img|<link/);
  assert.match(html, /data-share-title="&quot;&gt;&lt;script&gt;alert\(&quot;unsafe&quot;\)&lt;\/script&gt;&amp;&#39;"/);
  assert.equal((html.match(/target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer"/g) || []).length, 6);
  assert.equal((html.match(/id="page-sharing"/g) || []).length, 1);
  assert.match(html, /data-share-native hidden/);
  assert.match(html, /data-share-copy hidden/);
  assert.match(html, /data-share-fallback>/);
  assert.match(html, /readonly spellcheck="false"/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /Copy link/);
  assert.match(renderSharing({ ...metadata, lang: 'hu' }), /Link másolása/);
});

function domFixture(nav = {}) {
  const originals = Object.fromEntries(['document', 'navigator', 'isSecureContext'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const element = () => ({
    hidden: true, disabled: false, value: '', textContent: '', handlers: {},
    addEventListener(type, handler) { this.handlers[type] = handler; },
    focus() { this.focused = true; }, select() { this.selected = true; },
  });
  const elements = {
    '[data-share-copy]': element(), '[data-share-native]': element(),
    '[data-share-fallback]': element(), '#share-manual-url': element(), '#share-status': element(),
  };
  const root = {
    dataset: { shareUrl: `${metadata.url}?search=DO-NOT-SHARE#secret`, shareTitle: metadata.title, shareLang: 'en' },
    querySelector(selector) { return elements[selector]; },
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { getElementById(id) { return id === 'page-sharing' ? root : null; } } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: nav });
  Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true });
  return {
    root, elements,
    restore() {
      for (const [key, descriptor] of Object.entries(originals)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

test('initialising does not share or copy; successful copy reports only after completion', async () => {
  let calls = 0;
  let complete;
  const fixture = domFixture({ clipboard: { writeText(url) {
    calls++;
    assert.equal(url, metadata.url);
    return new Promise(resolve => { complete = resolve; });
  } } });
  try {
    assert.equal(initSharing('en'), true);
    assert.equal(initSharing('en'), false);
    assert.equal(calls, 0);
    const button = fixture.elements['[data-share-copy]'];
    assert.equal(button.hidden, false);
    const promise = button.handlers.click();
    assert.equal(calls, 1);
    assert.equal(fixture.elements['#share-status'].textContent, '');
    assert.equal(button.disabled, true);
    complete();
    await promise;
    assert.equal(button.disabled, false);
    assert.equal(fixture.elements['#share-status'].textContent, 'Link copied to the clipboard.');
  } finally { fixture.restore(); }
});

test('denied clipboard exposes and selects a real URL with an honest accessible message', async () => {
  const fixture = domFixture({ clipboard: { writeText: async () => { throw new Error('Denied'); } } });
  try {
    initSharing('en');
    await fixture.elements['[data-share-copy]'].handlers.click();
    assert.equal(fixture.elements['[data-share-fallback]'].hidden, false);
    const field = fixture.elements['#share-manual-url'];
    assert.equal(field.value, metadata.url);
    assert.equal(field.focused, true);
    assert.equal(field.selected, true);
    assert.match(fixture.elements['#share-status'].textContent, /Copy the selected link/);
    assert.doesNotMatch(fixture.elements['#share-status'].textContent, /Link copied/);
  } finally { fixture.restore(); }
});

test('unsupported native sharing stays hidden and missing clipboard also uses manual fallback', async () => {
  const fixture = domFixture();
  try {
    initSharing('hu');
    assert.equal(fixture.elements['[data-share-native]'].hidden, true);
    await fixture.elements['[data-share-copy]'].handlers.click();
    assert.match(fixture.elements['#share-status'].textContent, /Másold ki a kijelölt linket/);
  } finally { fixture.restore(); }
});

test('native sharing is user-triggered, contains only canonical metadata, and cancellation is quiet', async () => {
  let calls = 0;
  const fixture = domFixture({
    canShare(data) { assert.deepEqual(data, { url: metadata.url, title: metadata.title }); return true; },
    async share(data) { calls++; assert.deepEqual(data, { url: metadata.url, title: metadata.title }); throw Object.assign(new Error('cancel'), { name: 'AbortError' }); },
  });
  try {
    initSharing('en');
    const button = fixture.elements['[data-share-native]'];
    assert.equal(button.hidden, false);
    assert.equal(calls, 0);
    await button.handlers.click();
    assert.equal(calls, 1);
    assert.equal(fixture.elements['#share-status'].textContent, '');
    assert.equal(fixture.elements['[data-share-fallback]'].hidden, true);
    assert.equal(button.disabled, false);
  } finally { fixture.restore(); }
});

test('native rejection exposes manual link without secretly copying or claiming publication', async () => {
  let copies = 0;
  const fixture = domFixture({
    async share() { throw new Error('Not allowed'); },
    clipboard: { async writeText() { copies++; } },
  });
  try {
    initSharing('en');
    await fixture.elements['[data-share-native]'].handlers.click();
    assert.equal(copies, 0);
    assert.equal(fixture.elements['[data-share-fallback]'].hidden, false);
    assert.match(fixture.elements['#share-status'].textContent, /Sharing is unavailable/);
  } finally { fixture.restore(); }
});
