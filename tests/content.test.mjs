import test from 'node:test';
import assert from 'node:assert/strict';
import {loadArticles,wordCount,articleText} from '../scripts/journal.mjs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

test('100 distinct original bilingual articles have substantial complete bodies',async()=>{
 const articles=await loadArticles();
 assert.ok(articles.length>=100);
 const titles={hu:new Set(),en:new Set()},paragraphs={hu:new Map(),en:new Map()};
 for(const a of articles){
  assert.equal(a.kind,'original',a.slug);
  for(const lang of ['hu','en']){
   assert.ok(!titles[lang].has(a[lang].title),`Duplicate title ${a.slug}`);titles[lang].add(a[lang].title);
   const body=a[lang].sections.flatMap(s=>s.paragraphs);
   assert.ok(wordCount(body.join(' '))>=250,`Short body ${a.slug}/${lang}`);
   assert.ok(articleText(a,lang).length>1000);
   assert.ok(!/\b(?:TODO|Lorem ipsum|TBD)\b/i.test(body.join(' ')),`Placeholder ${a.slug}`);
   for(const paragraph of body){
    const normalized=paragraph.toLowerCase().replace(/\s+/g,' ').trim();
    if(normalized.length<160)continue;
    assert.ok(!paragraphs[lang].has(normalized),`Repeated paragraph ${a.slug} and ${paragraphs[lang].get(normalized)}`);
    paragraphs[lang].set(normalized,a.slug);
   }
  }
 }
});

test('all 100 articles have distinct local photographs and complete reusable-image credits',async()=>{
 const articles=await loadArticles(),paths=new Set(),hashes=new Set(),sources=new Set();
 for(const a of articles){
  const art=a.artwork;
  assert.ok(art,`Missing image: ${a.slug}`);
  assert.match(art.src,new RegExp(`^/assets/journal/${a.slug}\\.(?:jpg|webp)$`));
  assert.ok(!paths.has(art.src),`Reused file: ${a.slug}`);paths.add(art.src);
  const bytes=await readFile(art.src.slice(1));
  assert.ok(bytes.length>5000,`Empty/invalid image: ${a.slug}`);
  assert.ok(bytes.length<2500000,`Oversized image: ${a.slug}`);
  const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const webp=bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
  assert.ok(jpeg||webp,`Expected a raster image: ${a.slug}`);
  const hash=createHash('sha256').update(bytes).digest('hex');
  assert.ok(!hashes.has(hash),`Duplicate image bytes: ${a.slug}`);hashes.add(hash);
  for(const lang of ['hu','en'])assert.ok(art.alt[lang].length>=8,`Missing localized alt: ${a.slug}`);
  for(const key of ['author','title','license'])assert.ok(art.credit[key]?.trim(),`Missing ${key}: ${a.slug}`);
  for(const key of ['url','licenseUrl'])assert.equal(new URL(art.credit[key]).protocol,'https:');
  assert.ok(!sources.has(art.credit.url),`Reused source photo: ${a.slug}`);sources.add(art.credit.url);
 }
 assert.equal(hashes.size,100);
});

test('card photographs preserve distinct identities and materially reduce payload',async()=>{
 const articles=await loadArticles(),hashes=new Set();let total=0;
 for(const a of articles){
  const image=a.cardArtwork,bytes=await readFile(image.src.slice(1));
  assert.equal(bytes.length,image.bytes,a.slug);
  assert.equal(bytes[0],255);assert.equal(bytes[1],216);
  assert.ok(image.width>=300&&image.width<=800,a.slug);
  assert.ok(bytes.length<(await readFile(a.artwork.src.slice(1))).length,a.slug);
  hashes.add(createHash('sha256').update(bytes).digest('hex'));
  total+=bytes.length;
 }
 assert.equal(hashes.size,100);
 assert.ok(total<8_000_000,`Card payload budget: ${total}`);
});
