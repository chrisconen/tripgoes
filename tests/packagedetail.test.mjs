import test from 'node:test';
import assert from 'node:assert/strict';
import { detailMarkup } from '../src/packagedetail.mjs';

const offer = (changes = {}) => ({
  hotel: 'Apollonion Asterias Resort & Spa', where: 'Görögország · Kefalonia',
  depart: 'Budapestről indul', stars: 5, nights: 14, discount: 35,
  food: 'Félpanzió', type: 'Üdülés', from: '2027-06-30', to: '2027-07-14',
  price: 'Már 696 420 Ft<small>/fő</small><em>Megnézem ↗</em>',
  unit: '49 744 Ft/éj', note: 'Az árak a 2026-10-23-i állapot szerintiek.',
  href: 'https://www.invia.hu/hotel/x/utazas/?aid=9426177',
  hotelUrl: 'https://www.invia.hu/hotel/x/?aid=9426177',
  coords: '38.1649007787,20.4178118706',
  photos: ['https://dcontent.inviacdn.net/a.jpg', 'https://dcontent.inviacdn.net/b.jpg'],
  ...changes,
});

test('the panel states every fact the card leaves out', () => {
  const html = detailMarkup(offer(), 'hu');
  for (const expected of ['Időpont', 'Hossz', 'Ellátás', 'Utazás', 'Típus', 'Kedvezmény',
    '14 éjszaka', 'Félpanzió', 'Üdülés', '−35%', 'Budapestről indul', 'Kefalonia']) {
    assert.ok(html.includes(expected), `the panel never says ${expected}`);
  }
  // Both ends of the stay, with the year the card has no room for.
  assert.match(html, /2027\.[\s\S]*–[\s\S]*2027\./);
  assert.ok(html.includes('★★★★★'));
});

test('the booking link is the card\'s own, and still declares itself', () => {
  const html = detailMarkup(offer(), 'hu');
  assert.ok(html.includes('href="https://www.invia.hu/hotel/x/utazas/?aid=9426177"'));
  assert.ok(html.includes('rel="sponsored noopener"'));
  assert.ok(html.includes('target="_blank"'));
  // The price arrives as the card's own markup; only its "open ↗" cue goes,
  // because the panel has a real button for that.
  assert.ok(html.includes('696 420 Ft<small>/fő</small>'));
  assert.ok(!html.includes('Megnézem'));
});

test('a coordinate pair becomes a map link, an impossible one becomes nothing', () => {
  // The ampersand is escaped, because the link is written into markup.
  assert.ok(detailMarkup(offer(), 'hu').includes('openstreetmap.org/?mlat=38.1649007787&amp;mlon=20.4178118706'));
  for (const coords of ['', '91,20', '38,999', 'x,y', '38']) {
    assert.ok(!detailMarkup(offer({ coords }), 'hu').includes('openstreetmap'), `${coords} produced a map link`);
  }
});

test('what the feed did not send is simply not shown', () => {
  const bare = detailMarkup(offer({ type: '', discount: 4, hotelUrl: '', coords: '', unit: '', note: '', photos: ['https://dcontent.inviacdn.net/a.jpg'] }), 'hu');
  assert.ok(!bare.includes('Típus'), 'an empty tour type still printed a row');
  assert.ok(!bare.includes('Kedvezmény'), 'a 4% discount is noise, not news');
  assert.ok(!bare.includes('pkg-detail-links'), 'an empty link row was printed');
  assert.ok(!bare.includes('pkg-detail-thumbs'), 'one photograph does not need a filmstrip');
  assert.ok(!bare.includes('pkg-detail-unit'));
  assert.ok(bare.includes('pkg-detail-photo'), 'the one photograph is still shown');
});

test('the second language is the whole panel, not half of it', () => {
  const html = detailMarkup(offer(), 'en');
  for (const expected of ['Dates', 'Length', 'Board', 'Travel', 'Type', 'Discount',
    '14 nights', 'Open the offer', 'Other dates at this property', 'Where is it? Map']) {
    assert.ok(html.includes(expected), `the English panel never says ${expected}`);
  }
  assert.ok(!html.includes('Időpont'));
});

test('a hotel name is text, never markup', () => {
  const html = detailMarkup(offer({ hotel: '<img src=x onerror="alert(1)">', where: '"onmouseover="x' }), 'hu');
  assert.ok(!html.includes('<img src=x'), 'a hotel name was rendered as markup');
  assert.ok(html.includes('&lt;img src=x'));
  assert.ok(!html.includes('"onmouseover="x'));
});

test('the gallery offers every photograph and marks the one on show', () => {
  const html = detailMarkup(offer({ photos: ['https://dcontent.inviacdn.net/a.jpg', 'https://dcontent.inviacdn.net/b.jpg', 'https://dcontent.inviacdn.net/c.jpg'] }), 'hu');
  assert.equal([...html.matchAll(/data-photo="/g)].length, 3);
  assert.equal([...html.matchAll(/pkg-detail-thumb on/g)].length, 1);
  assert.ok(html.includes('class="pkg-detail-photo" src="https://dcontent.inviacdn.net/a.jpg"'));
  assert.ok(html.includes('aria-label="3. kép"'));
});
