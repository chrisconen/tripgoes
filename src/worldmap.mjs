// Pan and zoom for the experiences city picker. The map is the only way to
// reach a city page, so the dots have to be separable: at world scale Rome,
// Naples, Florence and Bologna land within a few pixels of each other.
//
// Everything moves the SVG viewBox. The dots keep their screen size as the map
// grows (their radius is divided back out), and their stroke is already
// non-scaling, so zooming separates cities instead of inflating blobs.
const DOT_RADIUS = 3;
const MAX_ZOOM = 48;
const DRAG_SLOP = 4;

const labels = {
  hu: { in: 'Nagyítás', out: 'Kicsinyítés', reset: 'Teljes térkép' },
  en: { in: 'Zoom in', out: 'Zoom out', reset: 'Whole map' },
};

export function initWorldMap(lang = 'hu') {
  const svg = document.querySelector('.city-map svg');
  if (!svg || !svg.viewBox?.baseVal?.width) return null;
  const text = labels[lang === 'en' ? 'en' : 'hu'];
  const { x, y, width, height } = svg.viewBox.baseVal;
  const base = { x, y, width, height };
  const dots = [...svg.querySelectorAll('circle')];
  const view = { ...base };

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  function apply() {
    // Never zoom out past the whole map, and never pan the edge inside the frame.
    view.width = clamp(view.width, base.width / MAX_ZOOM, base.width);
    view.height = view.width * base.height / base.width;
    view.x = clamp(view.x, base.x, base.x + base.width - view.width);
    view.y = clamp(view.y, base.y, base.y + base.height - view.height);
    svg.setAttribute('viewBox', `${view.x.toFixed(2)} ${view.y.toFixed(2)} ${view.width.toFixed(2)} ${view.height.toFixed(2)}`);
    // Both the visible dot and the invisible hit disc keep their screen size.
    // Zooming pushes neighbours apart, so a capped hit disc may grow back to
    // its full screen size once there is room for it.
    const ratio = view.width / base.width;
    for (const dot of dots) {
      const wanted = (Number(dot.dataset.r) || DOT_RADIUS) * ratio;
      const cap = Number(dot.dataset.max);
      dot.setAttribute('r', (cap > 0 ? Math.min(wanted, cap) : wanted).toFixed(3));
    }
    svg.dataset.zoomed = String(view.width < base.width - 0.5);
  }

  // Client pixels to map units, so the point under the cursor stays put. On a
  // phone the frame is taller than the map's aspect ratio, so xMidYMid meet
  // letterboxes it; without taking that band off first every grab is offset.
  function at(event) {
    const box = svg.getBoundingClientRect();
    const scale = Math.min(box.width / view.width, box.height / view.height);
    return {
      x: view.x + (event.clientX - box.left - (box.width - view.width * scale) / 2) / scale,
      y: view.y + (event.clientY - box.top - (box.height - view.height * scale) / 2) / scale,
    };
  }
  function zoom(factor, focus) {
    const next = clamp(view.width / factor, base.width / MAX_ZOOM, base.width);
    const ratio = next / view.width;
    view.x = focus.x - (focus.x - view.x) * ratio;
    view.y = focus.y - (focus.y - view.y) * ratio;
    view.width = next;
    apply();
  }
  const centre = () => ({ x: view.x + view.width / 2, y: view.y + view.height / 2 });

  svg.addEventListener('wheel', event => {
    event.preventDefault();
    zoom(Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.002)), at(event));
  }, { passive: false });

  // Pointer events cover mouse, touch and pen; two of them is a pinch.
  const active = new Map();
  // Capturing the pointer on every press would retarget the following click to
  // the <svg>, so a dot could never be opened. Capture only once a drag starts.
  let origin = null, travelled = 0, captured = 0, draggedAt = -1;
  const spread = () => {
    const [a, b] = [...active.values()];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };
  svg.addEventListener('pointerdown', event => {
    active.set(event.pointerId, event);
    travelled = 0;
    if (active.size === 1) {
      origin = { point: at(event) };
    } else if (active.size === 2) origin = { distance: spread(), width: view.width, focus: at(event) };
  });
  svg.addEventListener('pointermove', event => {
    if (!active.has(event.pointerId)) return;
    const previous = active.get(event.pointerId);
    travelled += Math.hypot(event.clientX - previous.clientX, event.clientY - previous.clientY);
    active.set(event.pointerId, event);
    if (travelled > DRAG_SLOP && !captured) {
      captured = event.pointerId;
      draggedAt = event.timeStamp;
      try { svg.setPointerCapture(event.pointerId); } catch { captured = 0; }
    }
    if (active.size === 2 && origin?.distance) {
      const distance = spread();
      if (distance > 0) {
        view.width = origin.width;
        zoom(distance / origin.distance, origin.focus);
      }
      return;
    }
    if (active.size !== 1 || !origin?.point) return;
    // Keep the map point that was grabbed under the pointer.
    const point = at(event);
    view.x += origin.point.x - point.x;
    view.y += origin.point.y - point.y;
    apply();
  });
  const release = event => {
    active.delete(event.pointerId);
    if (captured === event.pointerId) { draggedAt = event.timeStamp; captured = 0; }
    if (active.size === 0) origin = null;
    else if (active.size === 1) origin = { point: at([...active.values()][0]) };
  };
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) svg.addEventListener(type, release);
  // A drag that ends on a dot must not open that city.
  // Only the click that ends a drag is swallowed; a keyboard Enter never is.
  svg.addEventListener('click', event => {
    if (draggedAt >= 0 && event.timeStamp - draggedAt < 400) { event.preventDefault(); event.stopPropagation(); }
  }, true);

  // Keyboard users tab through the dots; bring the focused one into view.
  svg.addEventListener('focusin', event => {
    const dot = event.target.querySelector?.('circle');
    if (!dot || view.width >= base.width) return;
    view.x = dot.cx.baseVal.value - view.width / 2;
    view.y = dot.cy.baseVal.value - view.height / 2;
    apply();
  });

  const controls = document.createElement('div');
  controls.className = 'city-map-controls';
  const actions = { in: () => zoom(1.6, centre()), out: () => zoom(1 / 1.6, centre()), reset: () => { Object.assign(view, base); apply(); } };
  for (const [name, glyph] of [['in', '+'], ['out', '−'], ['reset', '⤢']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = glyph;
    button.title = text[name];
    button.setAttribute('aria-label', text[name]);
    button.addEventListener('click', actions[name]);
    controls.append(button);
  }
  svg.parentElement.append(controls);
  apply();
  return { view, apply };
}
