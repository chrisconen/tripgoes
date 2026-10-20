import {mkdir,cp,writeFile,readFile} from 'node:fs/promises';
import {copy} from '../src/locales.mjs';
import {loadArticles,journalIndex,journalArticle,articleImage,escapeHTML} from './journal.mjs';
import {checkerPage} from '../src/checker.mjs';
import {renderRecommendations} from './recommendations.mjs';
import {renderSharing} from '../src/sharing.mjs';

const origin=(process.env.SITE_ORIGIN||'https://tripgoes.com').replace(/\/$/,'');
if(new URL(origin).protocol!=='https:')throw Error('SITE_ORIGIN must use HTTPS.');
const draft=process.env.DRAFT_BUILD==='1';
const articles=await loadArticles({draft});
await mkdir('dist',{recursive:true});
await cp('src','dist/src',{recursive:true});
await cp('assets','dist/assets',{recursive:true});
const shell=(await readFile('index.html','utf8')).replaceAll('{{origin}}',origin);
const routes=['','about','contact','imprint','privacy','cookies','affiliate','guides','score'];
function render({lang,route='',title,description=copy[lang].metaDescription,content='',indexable=false,image='/assets/hero.jpg',imageAlt='',ogType='website'}){
 const path=route?`${route}/`:'';
 const canonical=`${origin}/${lang}/${path}`;
 const extras=renderSharing({url:canonical,title,image:new URL(image,origin).href,lang})+renderRecommendations(articles,lang,{slug:route.startsWith('blog/')?route.slice(5):'',seed:route});
 const values={route:path,lang,title:escapeHTML(title),description:escapeHTML(description),canonical,robots:indexable?'index,follow':'noindex,follow',content:content+extras,image,imageAlt:escapeHTML(imageAlt||(lang==='hu'?'TripGoes utazási inspiráció':'TripGoes travel inspiration')),ogType,preload:!route||ogType==='article'?`<link rel="preload" href="${image}" as="image">`:''};
 return shell.replace(/\{\{(\w+)\}\}/g,(match,key)=>values[key]??match);
}
const sitemap=[];
for(const lang of ['hu','en']){
 for(const route of routes){
  const dir=`dist/${lang}/${route}`;await mkdir(dir,{recursive:true});
  const title=route==='score'?(lang==='hu'?'TripScore — átlátható utazási ajánlatellenőrző':'TripScore — a transparent travel deal checker'):route?`${copy[lang][route==='guides'?'guideTitle':route]} — TripGoes`:copy[lang].metaTitle;
  await writeFile(`${dir}/index.html`,render({lang,route,title,content:route==='score'?checkerPage(lang):route==='guides'?journalIndex(articles,lang):'',indexable:route==='score'}));
  if(route==='score')sitemap.push(`${origin}/${lang}/score/`);
 }
 await mkdir(`dist/${lang}/blog`,{recursive:true});
 await writeFile(`dist/${lang}/blog/index.html`,render({lang,route:'blog',title:lang==='hu'?'Útinapló — 100 eredeti utazási útmutató | TripGoes':'Travel Journal — 100 original travel guides | TripGoes',description:lang==='hu'?'Utazástervezés, repülés, hajóutak és átlátható költségek. Száz eredeti magyar–angol útmutató a tudatosabb döntéshez.':'Planning, flights, cruises and transparent travel costs. One hundred original Hungarian and English guides for more thoughtful decisions.',content:journalIndex(articles,lang),indexable:!draft}));
 sitemap.push(`${origin}/${lang}/blog/`);
 for(const article of articles){
  const route=`blog/${article.slug}`,dir=`dist/${lang}/${route}`;await mkdir(dir,{recursive:true});
  await writeFile(`${dir}/index.html`,render({lang,route,title:`${article[lang].title} — TripGoes`,description:article[lang].excerpt,content:journalArticle(article,articles,lang),indexable:!draft,image:articleImage(article),imageAlt:article.artwork?.alt?.[lang],ogType:'article'}));
  sitemap.push(`${origin}/${lang}/${route}/`);
 }
}
await writeFile('dist/index.html',render({lang:'hu',title:copy.hu.metaTitle}));
await writeFile('dist/404.html',render({lang:'hu',title:'404 — TripGoes'}));
await writeFile('dist/robots.txt',`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
await writeFile('dist/sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemap.map(url=>`<url><loc>${url}</loc></url>`).join('')}</urlset>\n`);
await writeFile('dist/CNAME',new URL(origin).hostname+'\n');
await writeFile('dist/.nojekyll','');
console.log(`Built HU/EN platform + ${articles.length} original bilingual articles (${articles.length*2} article pages)${draft?' [DRAFT]':''}.`);
