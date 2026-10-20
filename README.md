# TripGoes

Live at **https://tripgoes.com**. An original bilingual travel journal and transparent, browser-based travel price checker.

## What works

- TripScore Lab in Hungarian and English: complete per-person costs, dated price history, median comparison, separate evidence coverage, up to three side-by-side analyses and JSON export.
- 100 original bilingual guides: 200 static article pages, ten topics, accent-insensitive search, progressive browsing, contents navigation and related reading.
- Responsive editorial interface, reduced-motion support, local fonts and licensed destination photography.
- Sample trip discovery, filters, saved trips and the original complete-cost calculator.
- Explicit direct provider links with no affiliate tracking or claimed commercial relationship.
- Canonical URLs, matching locale alternates, article Open Graph metadata and a sitemap.

## What the score means

The score is a disclosed heuristic against the median of **supplied** prices. It is not a live market rank, a prediction, an independent verification or a booking recommendation.

At least five distinct observation days spanning seven days are required. The newest observation must be no older than fourteen days; records outside ninety days are excluded. Route, departure date, nights, traveller count, currency and inclusions must match. Duplicate records cannot increase the number of observation days.

The median earns 50 points, with 1.5 points per percentage point below or above it, bounded at 0–100. Evidence coverage is a separate capped indicator. User inputs cannot self-certify as verified provider data.

## Content and commercial status

The guides are original AI-assisted editorial work, not first-hand travel reports or independently expert-reviewed publications. The international reading room contains short attributed summaries, not full translations of third-party articles.

Homepage trips, fares and histories remain labelled examples. There are no authenticated provider feeds, active affiliate IDs, email delivery, payments or booking services. Operator/contact details must be completed before a commercial launch. The new guides and checker are indexable; sample-led and pre-commercial information pages remain noindex.

## Run and verify

Node.js 24+, no npm dependencies:

```sh
npm test
npm run build
node --test --test-isolation=none tests/build.test.mjs
npm run dev
```

Open `http://127.0.0.1:4173/hu/`.

The build requires at least 100 complete bilingual source articles. `DRAFT_BUILD=1` is a local editorial preview option; it is not set in the deployment workflow.

## Deployment

Cloudflare manages the domain and DNS. GitHub Pages serves the site; a push to `main` runs the tests, builds the static files and publishes through the pinned GitHub Actions workflow. HTTPS is enforced.

Only application sources, assets, editorial JSON, tests and build configuration belong in this repository. Local CLI state, credentials, planning files and prior hosting configuration are excluded.

Revert a release commit and push to `main` to restore the prior version. Keep the GitHub domain binding while DNS points to GitHub Pages. If retiring hosting, remove or repoint those DNS records as part of the same change.
