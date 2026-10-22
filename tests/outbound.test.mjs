import test from 'node:test';
import assert from 'node:assert/strict';
import { initPixel, OUTBOUND_EVENT } from '../src/marketing.mjs';

// The smallest document initPixel touches: listener registration, a head to
// append the script to, and a cookie-less global for the fbq shim.
function fakeWorld(link) {
  const listeners = {};
  const doc = {
    addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
    createElement: () => ({ setAttribute() {}, style: {} }),
    head: { append() {} },
  };
  const sent = [];
  const fbq = (...args) => sent.push(args);
  fbq.queue = [];
  const previous = { document: globalThis.document, fbq: globalThis.fbq, _fbq: globalThis._fbq };
  globalThis.document = doc;
  globalThis.fbq = fbq;
  initPixel('1628810374927155');
  const fire = (type, button = 0) => {
    for (const fn of listeners[type] ?? []) fn({ button, target: { closest: sel => sel.includes('sponsored') ? link : null } });
  };
  const restore = () => Object.assign(globalThis, previous);
  return { fire, restore, outbound: () => sent.filter(([verb, name]) => verb === 'trackCustom' && name === OUTBOUND_EVENT) };
}

const offerLink = () => ({ closest: sel => sel === '[data-country]' ? { dataset: { country: 'egyiptom' } } : sel === '[data-price]' ? { dataset: { price: '420000' } } : null });

test('the hand-off is reported on the press, before the page can navigate away', () => {
  const link = offerLink();
  const world = fakeWorld(link);
  try {
    world.fire('pointerdown');
    assert.equal(world.outbound().length, 1, 'pressing an offer reports it');
    const [, , payload] = world.outbound()[0];
    assert.equal(payload.destination, 'egyiptom');
    assert.equal(payload.value, 420000);
    assert.equal(payload.currency, 'HUF');
  } finally { world.restore(); }
});

test('the click that follows the press is not a second hand-off', () => {
  const world = fakeWorld(offerLink());
  try {
    world.fire('pointerdown');
    world.fire('click');
    assert.equal(world.outbound().length, 1, 'press then click is one event, not two');
  } finally { world.restore(); }
});

test('a keyboard activation still counts, since it produces no press', () => {
  const world = fakeWorld(offerLink());
  try {
    world.fire('click');
    assert.equal(world.outbound().length, 1);
  } finally { world.restore(); }
});

test('a right-click decides nothing and reports nothing', () => {
  const world = fakeWorld(offerLink());
  try {
    world.fire('pointerdown', 2);
    assert.equal(world.outbound().length, 0, 'opening a context menu is not a hand-off');
    world.fire('pointerdown', 1);
    assert.equal(world.outbound().length, 1, 'a middle click opens the link, so it is');
  } finally { world.restore(); }
});
