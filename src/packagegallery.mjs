// Cycles a card's remaining photos while the pointer is over it.
//
// The feed ships five pictures per offer and the grid showed one. The extra
// URLs travel in a data attribute rather than as hidden <img> elements, so
// nothing is fetched until someone actually looks at a card.
//
// No buttons: the whole card is a link, and interactive controls inside a
// link are invalid markup and a keyboard trap. Hover is an enhancement, and
// the card is complete without it.
const INTERVAL = 1100;

export function initPackageGallery() {
  // Auto-advancing imagery is exactly what this setting asks us not to do.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const card of document.querySelectorAll('.pkg-card[data-photos]')) {
    const image = card.querySelector('img');
    if (!image) continue;
    const photos = [image.getAttribute('src'), ...card.dataset.photos.split('|')].filter(Boolean);
    if (photos.length < 2) continue;
    const dots = [...card.querySelectorAll('.pkg-dots i')];
    let at = 0, timer = null;
    const show = index => {
      at = (index + photos.length) % photos.length;
      image.src = photos[at];
      dots.forEach((dot, position) => dot.classList.toggle('on', position === at));
    };
    card.addEventListener('pointerenter', () => {
      clearInterval(timer);
      timer = setInterval(() => show(at + 1), INTERVAL);
    });
    card.addEventListener('pointerleave', () => {
      clearInterval(timer);
      show(0);
    });
  }
}
