import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, AFFILIATE_ID, OFFER_HOST, IMAGE_HOST } from '../scripts/sync-packages.mjs';
import { validatePackages } from '../src/packages.mjs';

// The smallest record the parser will keep: a picture, a price, and dates
// that agree with the stated length.
const offerXml = ({ stars = '4', discount = '12', id = '137228' } = {}) => `
<offer>
 <url>https://${OFFER_HOST}/utazas/x/?aid=${AFFILIATE_ID}</url>
 <hotelinfo><id>${id}</id><stars>${stars}</stars></hotelinfo>
 <hotel>Teszt Hotel</hotel><country>Egyiptom</country><locality>Hurghada</locality>
 <from>2027-01-14</from><to>2027-01-21</to><length>8</length>
 <totalprice currency="HUF">420000</totalprice>
 <discount>${discount}</discount>
 <food>All inclusive</food><transportation>Repülővel</transportation>
 <photo>${IMAGE_HOST}/shared/img/affil-450x300/a.jpg</photo>
</offer>`;

const one = xml => parseFeed(xml, 'test')[0];

test('a hotel the feed does not rate ships without a rating, not without a deploy', () => {
  // The actual 2026-10-22 outage: one record carried a star rating outside
  // 1-5, validation threw, and nothing reached the live site for two pushes.
  for (const stars of ['0', '0.0', '6', '7.5', '', 'n/a']) {
    const offer = one(offerXml({ stars }));
    assert.ok(offer, `${stars} still produces an offer`);
    assert.equal(offer.stars, null, `${stars} is not a rating we can show`);
  }
  for (const [stars, expected] of [['1', 1], ['3.5', 3.5], ['5', 5], ['4', 4]]) {
    assert.equal(one(offerXml({ stars })).stars, expected, stars);
  }
});

test('a discount outside the range it promises falls back to none', () => {
  for (const discount of ['100', '-5', 'sok', '']) {
    assert.equal(one(offerXml({ discount })).discount, 0, discount);
  }
  assert.equal(one(offerXml({ discount: '49' })).discount, 49);
  assert.equal(one(offerXml({ discount: '0' })).discount, 0);
});

test('whatever the feed sends for those two fields, the catalogue still validates', () => {
  // The end the outage was about: the parser's output has to survive the
  // validator, because the validator is what the build runs.
  const offers = ['0', '6', '4.5', ''].map((stars, i) =>
    one(offerXml({ stars, id: 137228 + i })));
  assert.equal(offers.length, 4);
  assert.doesNotThrow(() => validatePackages({
    version: 1, generated: '2026-10-22', offers,
    countries: { Egyiptom: offers.length }, published: [], publishedBoards: [],
  }));
});
