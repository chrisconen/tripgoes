import { mkdir, cp, writeFile, readFile } from 'node:fs/promises';
import { copy } from '../src/locales.mjs';
const origin = (process.env.SITE_ORIGIN || 'https://tripgoes.com').replace(/\/$/, '');
if (new URL(origin).protocol !== 'https:') throw new Error('SITE_ORIGIN must use HTTPS.');
await mkdir('dist', {recursive:true});
await cp('src', 'dist/src', {recursive:true});
await cp('assets', 'dist/assets', {recursive:true});
const shell = (await readFile('index.html','utf8')).replaceAll('{{origin}}',origin);
const routes = ['', 'about', 'contact', 'imprint', 'privacy', 'cookies', 'affiliate', 'guides'];
for (const lang of ['hu','en']) {
  for (const route of routes) {
    const dir = `dist/${lang}/${route}`;
    await mkdir(dir,{recursive:true});
    const title=route ? `${copy[lang][route==='guides'?'guideTitle':route]} — TripGoes` : copy[lang].metaTitle;
    await writeFile(`${dir}/index.html`, shell.replaceAll('{{route}}',route ? route+'/' : '').replaceAll('{{lang}}',lang).replaceAll('{{title}}',title).replaceAll('{{description}}',copy[lang].metaDescription).replaceAll('{{canonical}}',`${origin}/${lang}/${route ? route+'/' : ''}`));
  }
}
await writeFile('dist/index.html',shell.replaceAll('{{route}}','').replaceAll('{{lang}}','hu').replaceAll('{{title}}',copy.hu.metaTitle).replaceAll('{{description}}',copy.hu.metaDescription).replaceAll('{{canonical}}',`${origin}/hu/`));
await writeFile('dist/404.html',shell.replaceAll('{{route}}','').replaceAll('{{lang}}','hu').replaceAll('{{title}}',copy.hu.metaTitle).replaceAll('{{description}}',copy.hu.metaDescription).replaceAll('{{canonical}}',`${origin}/hu/`));
await writeFile('dist/robots.txt','User-agent: *\nDisallow: /\n');
await writeFile('dist/CNAME',new URL(origin).hostname+'\n');
await writeFile('dist/.nojekyll','');
console.log('Built HU/EN pages in dist (demo: search indexing disabled).');
