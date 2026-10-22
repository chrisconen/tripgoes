// Filters the trip catalogue in place. Every card is already in the page, so
// this only hides what does not match — the page works without it.
const LABEL = {
  hu: (shown, total) => `${shown} / ${total} utazás`,
  en: (shown, total) => `${shown} of ${total} trips`,
};

export function initPackageFilter(lang) {
  const form = document.querySelector('.pkg-filters');
  const cards = [...document.querySelectorAll('.pkg-card')];
  if (!form || !cards.length) return;
  const output = form.querySelector('.pkg-count');
  const label = LABEL[lang] ?? LABEL.hu;
  const apply = () => {
    const values = new FormData(form);
    const budget = Number(values.get('budget')) || Infinity;
    const [low, high] = String(values.get('nights') || '0-60').split('-').map(Number);
    const food = values.get('food'), airport = values.get('airport');
    let shown = 0;
    for (const card of cards) {
      const nights = Number(card.dataset.nights);
      const matches = Number(card.dataset.price) < budget
        && nights >= low && nights <= high
        && (!food || card.dataset.food === food)
        && (!airport || card.dataset.airport === airport);
      card.hidden = !matches;
      if (matches) shown++;
    }
    if (output) output.textContent = label(shown, cards.length);
  };
  form.addEventListener('change', apply);
  // A reset fires before the controls are cleared, so read them after.
  form.addEventListener('reset', () => setTimeout(apply));
  apply();
}
