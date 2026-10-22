import test from 'node:test';
import assert from 'node:assert/strict';
import { clean, campaignFrom, visitCampaign, tagOffers, PARAM, KEY } from '../src/campaign.mjs';
import { AFFILIATE_ID, OFFER_HOST } from '../src/packages.mjs';

const fakeStorage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), data };
};

test('the label is reduced to something safe to put in a report', () => {
  assert.equal(clean('Egyiptom Október'), 'egyiptom-oktober', 'accents come off, letters stay');
  assert.equal(clean('Maldív-szigetek ŐSZ'), 'maldiv-szigetek-osz');
  assert.equal(clean('fb_lastminute-2'), 'fb_lastminute-2');
  assert.equal(clean(' --- '), '');
  assert.equal(clean(null), '');
  // A query string is attacker-controlled, so nothing can ride along.
  for (const attack of ['a&b=c', 'a#frag', 'a b', "a'b", 'a<b>', 'a%26b', 'a/../b']) {
    assert.match(clean(attack), /^[a-z0-9_-]*$/, attack);
  }
  const long = clean('x'.repeat(200));
  assert.equal(long.length, 40);
  assert.ok(!clean('a' + '-'.repeat(60)).endsWith('-'), 'truncation never leaves a trailing dash');
});

test('the campaign comes from whichever marker the advert used', () => {
  assert.equal(campaignFrom('?utm_campaign=Karib-Nov&utm_source=fb'), 'karib-nov');
  assert.equal(campaignFrom('?utm_source=facebook'), 'facebook');
  assert.equal(campaignFrom('?fbclid=AbC123'), 'facebook', 'a bare click id still names its network');
  assert.equal(campaignFrom('?city=BUD'), '', 'ordinary links are not campaigns');
  assert.equal(campaignFrom(''), '');
});

test('a label survives the walk from the landing page to the offer', () => {
  const storage = fakeStorage();
  assert.equal(visitCampaign('?utm_campaign=egyiptom', storage), 'egyiptom');
  assert.equal(storage.data.get(KEY), 'egyiptom');
  assert.equal(visitCampaign('', storage), 'egyiptom', 'remembered on the next page, which has no query');
  assert.equal(visitCampaign('?utm_campaign=maldiv', storage), 'maldiv', 'a newer arrival wins');
});

test('a stored label is cleaned on the way out as well as in', () => {
  const storage = fakeStorage();
  storage.data.set(KEY, 'tampered <b>value</b>');
  assert.match(visitCampaign('', storage), /^[a-z0-9_-]*$/);
});

test('storage that refuses to work costs the label, not the page', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(visitCampaign('?utm_campaign=egyiptom', broken), 'egyiptom');
  assert.equal(visitCampaign('', broken), '');
});

// A stand-in for the two things tagOffers touches: querySelectorAll, and href.
const fakeLink = href => ({ href, get searchParams() { return new URL(this.href).searchParams; } });
const fakeRoot = links => ({ querySelectorAll: () => links });

test('only the hand-off links are tagged, and the affiliate id is kept', () => {
  const offer = fakeLink(`https://${OFFER_HOST}/utazas/egyiptom/?aid=${AFFILIATE_ID}&id=7`);
  assert.equal(tagOffers('egyiptom-okt', fakeRoot([offer])), 1);
  const url = new URL(offer.href);
  assert.equal(url.searchParams.get(PARAM), 'egyiptom-okt');
  assert.equal(url.searchParams.get('aid'), AFFILIATE_ID, 'the commission must still be ours');
  assert.equal(url.searchParams.get('id'), '7', 'the offer is still the same offer');
  assert.equal(url.hostname, OFFER_HOST);
});

test('an existing label is replaced rather than doubled', () => {
  const offer = fakeLink(`https://${OFFER_HOST}/x/?aid=${AFFILIATE_ID}&${PARAM}=old`);
  tagOffers('new-one', fakeRoot([offer]));
  assert.deepEqual([...new URL(offer.href).searchParams.getAll(PARAM)], ['new-one']);
});

test('no campaign means no rewriting at all', () => {
  const href = `https://${OFFER_HOST}/x/?aid=${AFFILIATE_ID}`;
  const offer = fakeLink(href);
  assert.equal(tagOffers('', fakeRoot([offer])), 0);
  assert.equal(offer.href, href, 'an untagged visit leaves the links exactly as rendered');
});
