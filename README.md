# TripGoes deployment

The website is built from `main` by `.github/workflows/pages.yml` and served through GitHub Pages at `https://tripgoes.com`.

Each push runs the deterministic cost-model tests, builds the HU/EN static output and checks custom-domain metadata before deployment. Actions are pinned to immutable revisions. Deployment uses GitHub's short-lived OIDC permission rather than a repository-stored deployment token.

## Local development

```sh
npm test
npm run build
node --test --test-isolation=none tests/build.test.mjs
npm run dev
```

Node.js 24+; no package installation required. Open `http://127.0.0.1:4173/hu/`.

`SITE_ORIGIN` defaults to `https://tripgoes.com`. The built artifact contains only browser code, images, fonts and generated pages. Internal planning, local deployment credentials and the previous private Sites identity are not part of the GitHub publication.

## DNS

Cloudflare remains the registrar and authoritative DNS provider. Configure the domain in GitHub Pages before pointing DNS there.

- Apex A: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
- `www` CNAME: `chrisconen.github.io`
- DNS-only records allow GitHub to validate the domain and provision HTTPS directly.
- Preserve unrelated mail and verification records.

GitHub automatically redirects `www` to the chosen apex domain. Enable enforced HTTPS after the certificate is issued.

## Content status

This is a publicly accessible demonstration of the TripGoes experience. Offers, scores, dates, price histories and exchange rates remain explicitly illustrative. `noindex` is intentional until verified provider data and operator details are available. Favorites and alert preferences stay in the browser; there is no email delivery, payment processing or live booking.

## Recovery

Revert an application commit and push to `main` to redeploy the previous version. Do not remove the Pages domain binding while DNS still points at GitHub. If hosting is retired, remove or repoint these web DNS records as part of the same change.
