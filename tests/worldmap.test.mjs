import test from 'node:test';
import assert from 'node:assert/strict';
import { initWorldMap } from '../src/worldmap.mjs';

const WIDTH = 1000, HEIGHT = 377.8;

function mapFixture({ dots = 3, box = { left: 0, top: 0, width: WIDTH, height: HEIGHT } } = {}) {
  const handlers = {}, captured = [];
  const circles = Array.from({ length: dots }, (unused, index) => {
    const cx = 100 * (index + 1), cy = 40 * (index + 1);
    return {
      attrs: { cx, cy, r: '3' },
      cx: { baseVal: { value: cx } }, cy: { baseVal: { value: cy } },
      setAttribute(name, value) { this.attrs[name] = value; },
      getAttribute(name) { return this.attrs[name]; },
    };
  });
  const svg = {
    viewBox: { baseVal: { x: 0, y: 0, width: WIDTH, height: HEIGHT } },
    dataset: {}, attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttribute(name) { return this.attributes[name]; },
    querySelectorAll: () => circles,
    addEventListener(type, handler) { (handlers[type] ??= []).push(handler); },
    getBoundingClientRect: () => box,
    setPointerCapture(id) { captured.push(id); },
    parentElement: { append() {} },
  };
  const element = () => ({ addEventListener() {}, setAttribute() {}, append() {}, classList: { add() {} }, style: {} });
  const previous = globalThis.document;
  globalThis.document = { querySelector: selector => selector === '.city-map svg' ? svg : null, createElement: element };
  const fire = (type, event) => { for (const handler of handlers[type] ?? []) handler(event); };
  return { svg, circles, captured, fire, restore() { globalThis.document = previous; } };
}
const wheel = (clientX, clientY, deltaY) => ({ clientX, clientY, deltaY, deltaMode: 0, preventDefault() {} });
const pointer = (clientX, clientY, timeStamp = 0, pointerId = 1) => ({ clientX, clientY, timeStamp, pointerId });

test('zooming keeps the point under the cursor still and the dots the same size on screen', () => {
  const fixture = mapFixture();
  try {
    const map = initWorldMap('hu');
    const focus = { x: 400, y: 150 };
    fixture.fire('wheel', wheel(focus.x, focus.y, -200));
    assert.ok(map.view.width < WIDTH, `width stayed ${map.view.width}`);
    // The map coordinate under that client point is unchanged by the zoom.
    assert.ok(Math.abs(map.view.x + focus.x / WIDTH * map.view.width - focus.x) < 0.01);
    assert.ok(Math.abs(map.view.y + focus.y / HEIGHT * map.view.height - focus.y) < 0.01);
    // Radius is divided back out, so a zoomed map separates cities instead of
    // growing blobs.
    assert.equal(fixture.circles[0].attrs.r, (3 * map.view.width / WIDTH).toFixed(3));
    assert.equal(fixture.svg.dataset.zoomed, 'true');
    assert.ok(Math.abs(map.view.width / map.view.height - WIDTH / HEIGHT) < 1e-9);
  } finally { fixture.restore(); }
});

test('the view never leaves the map, however hard it is zoomed or dragged', () => {
  const fixture = mapFixture();
  try {
    const map = initWorldMap('en');
    fixture.fire('wheel', wheel(500, 189, 4000));
    assert.equal(map.view.width, WIDTH);
    assert.equal(map.view.x, 0);
    assert.equal(map.view.y, 0);
    assert.equal(fixture.svg.dataset.zoomed, 'false');
    fixture.fire('wheel', wheel(500, 189, -100000));
    assert.ok(map.view.width >= WIDTH / 48 - 1e-9, `zoomed past the limit: ${map.view.width}`);
    const inBounds = () => map.view.x >= -1e-9 && map.view.x <= WIDTH - map.view.width + 1e-9
      && map.view.y >= -1e-9 && map.view.y <= HEIGHT - map.view.height + 1e-9;
    // Drag towards the top-left corner until it stops; the frame never leaves the map.
    for (let step = 0; step < 20; step++) {
      fixture.fire('pointerdown', pointer(100, 40, step * 100));
      fixture.fire('pointermove', pointer(5000, 4000, step * 100 + 20));
      fixture.fire('pointerup', pointer(5000, 4000, step * 100 + 30));
      assert.ok(inBounds(), `out of bounds at step ${step}: ${map.view.x},${map.view.y}`);
    }
    assert.equal(map.view.x, 0);
    assert.equal(map.view.y, 0);
    for (let step = 0; step < 60; step++) {
      fixture.fire('pointerdown', pointer(900, 340, 10000 + step * 100));
      fixture.fire('pointermove', pointer(-5000, -4000, 10000 + step * 100 + 20));
      fixture.fire('pointerup', pointer(-5000, -4000, 10000 + step * 100 + 30));
      assert.ok(inBounds(), `out of bounds at step ${step}: ${map.view.x},${map.view.y}`);
    }
    assert.ok(Math.abs(map.view.x - (WIDTH - map.view.width)) < 1e-6, `x=${map.view.x}`);
    assert.ok(Math.abs(map.view.y - (HEIGHT - map.view.height)) < 1e-6, `y=${map.view.y}`);
  } finally { fixture.restore(); }
});

test('a drag swallows only the click that ends it; a plain click opens the city', () => {
  const fixture = mapFixture();
  try {
    initWorldMap('hu');
    let prevented = 0;
    const click = timeStamp => ({ timeStamp, preventDefault() { prevented++; }, stopPropagation() {} });
    // A press with no travel is a click on a dot, and must go through.
    fixture.fire('pointerdown', pointer(300, 100, 0));
    fixture.fire('pointermove', pointer(301, 100, 5));
    fixture.fire('pointerup', pointer(301, 100, 10));
    fixture.fire('click', click(11));
    assert.equal(prevented, 0);
    assert.deepEqual(fixture.captured, []);
    // A real drag captures the pointer and swallows its trailing click.
    fixture.fire('pointerdown', pointer(300, 100, 100));
    fixture.fire('pointermove', pointer(360, 140, 120));
    fixture.fire('pointerup', pointer(360, 140, 130));
    fixture.fire('click', click(131));
    assert.equal(prevented, 1);
    assert.deepEqual(fixture.captured, [1]);
    // Later activation — a keyboard Enter, say — is never swallowed.
    fixture.fire('click', click(2000));
    assert.equal(prevented, 1);
  } finally { fixture.restore(); }
});

test('a letterboxed phone frame still zooms on the point under the finger', () => {
  // Taller than the map's own ratio, so xMidYMid meet leaves a band top and bottom.
  const box = { left: 0, top: 0, width: 390, height: 420 };
  const fixture = mapFixture({ box });
  try {
    const map = initWorldMap('hu');
    const scale = Math.min(box.width / WIDTH, box.height / HEIGHT);
    const bandY = (box.height - HEIGHT * scale) / 2;
    const client = { x: 120, y: bandY + 60 * scale };
    const before = { x: client.x / scale, y: 60 };
    fixture.fire('wheel', wheel(client.x, client.y, -200));
    const after = {
      x: map.view.x + (client.x - (box.width - map.view.width * scale2(map, box)) / 2) / scale2(map, box),
      y: map.view.y + (client.y - bandY2(map, box)) / scale2(map, box),
    };
    assert.ok(Math.abs(after.x - before.x) < 0.02, `${after.x} vs ${before.x}`);
    assert.ok(Math.abs(after.y - before.y) < 0.02, `${after.y} vs ${before.y}`);
  } finally { fixture.restore(); }
});
const scale2 = (map, box) => Math.min(box.width / map.view.width, box.height / map.view.height);
const bandY2 = (map, box) => box.top + (box.height - map.view.height * scale2(map, box)) / 2;

test('a page without the map is left alone', () => {
  const previous = globalThis.document;
  globalThis.document = { querySelector: () => null, createElement: () => ({}) };
  try { assert.equal(initWorldMap('hu'), null); } finally { globalThis.document = previous; }
});
