# TripGoes

Live at **https://tripgoes.com**. An original bilingual travel journal and transparent, browser-based travel price checker.

## What works

- TripScore Lab in Hungarian and English: complete per-person costs, dated price history, median comparison, separate evidence coverage, up to three side-by-side analyses and JSON export.
- Optional local score drafts preserve partial inputs across visits. Loading never restores a score or the comparison confirmation; sample data remains labelled.
- A bilingual trip planner compares up to three user-entered offers: per-person and group totals, extras, cost per usable hour/night and group-budget differences. Currencies remain separate; local saving is explicit and deletable.
- 100 original bilingual guides: 200 static article pages, ten topics, accent-insensitive search, progressive browsing, contents navigation and related reading.
- 100 distinct locally hosted article photographs, with bilingual descriptions, author/source links and individual reuse licences. The same article uses the same photograph in both languages.
- Cards use 100 smaller official Wikimedia thumbnails, totalling 5.43 MB versus 28.85 MB for the cover set. Covers retain their larger files. Individual thumbnail sources are recorded in `assets/journal/CARD-SOURCES.md`.
- Every page includes 12 recommended articles, manual carousel controls, keyboard navigation, touch scrolling and a gallery view.
- Facebook, X, WhatsApp, Telegram, LinkedIn and Pinterest sharing, copy-link fallback and optional native sharing. No social SDK is loaded, and shared links exclude queries, fragments and form entries.
- Responsive editorial interface, reduced-motion support, local fonts and licensed destination photography.
- Sample trip discovery, filters, saved trips and the original complete-cost calculator.
- Worldwide free-text city entry in discovery, the calculator, preferences and the trip planner; 34,173 optional GeoNames suggestions with country/region context and Unicode aliases. The catalogue loads only when needed. Smaller places can be entered without a catalogue match.
- A separate Workers/D1 offer-data API: source allowlists, transactional imports, immutable price observations, idempotent receipts, withdrawal and expiry handling, protected CLI administration and production rate limiting. Details: `backend/README.md`.
- HU/EN offer search with source and timestamp disclosure, explicit request controls, price-history tables and expiry checks independent of the visitor's system clock. It shows an honest empty inventory until an approved data source is connected.
- Budapest remains the Hungarian homepage default. Unknown departure costs never fall back to Budapest: incomplete sample totals are labelled and excluded by finite budget filters. The calculator accepts an explicit return ground-transport cost, including a known zero.
- Explicit direct provider links with no affiliate tracking or claimed commercial relationship.
- Canonical URLs, matching locale alternates, article Open Graph metadata and a sitemap.
- Complete static page content, navigation and footer; browser code preserves the existing document and loads score, planner and journal interactions only on their relevant routes.

## What the score means

The score is a disclosed heuristic against the median of **supplied** prices. It is not a live market rank, a prediction, an independent verification or a booking recommendation.

At least five distinct observation days spanning seven days are required. The newest observation must be no older than fourteen days; records outside ninety days are excluded. Route, departure date, nights, traveller count, currency and inclusions must match. Duplicate records cannot increase the number of observation days.

The median earns 50 points, with 1.5 points per percentage point below or above it, bounded at 0–100. Evidence coverage is a separate capped indicator. User inputs cannot self-certify as verified provider data.

## Content and commercial status

The guides are original AI-assisted editorial work, not first-hand travel reports or independently expert-reviewed publications. The international reading room contains short attributed summaries, not full translations of third-party articles.

Homepage trips, fares and histories remain labelled examples. There are no authenticated provider feeds, active affiliate IDs, user accounts, email delivery, payments or booking services. The backend source registry starts empty and does not ingest those homepage examples. Operator/contact details must be completed before a commercial launch. The guides, checker and planner are indexable; sample-led and pre-commercial information pages remain noindex.

City suggestions are adapted from GeoNames under CC BY 4.0; sources and scope are documented in `assets/CITY-SOURCES.md`. Suggestions are not a complete list of every settlement. City entry does not retrieve new flights or change the fixed departure airports of illustrative homepage routes. Planner city labels do not determine costs.

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

The data API is a separate Cloudflare Worker with a dedicated D1 database. Backend code is tested in GitHub CI, but backend deployment is a separate operator action; no Cloudflare account token is stored in the public repository or frontend. Only the offer-search route allows connections to its exact public API origin. All other pages retain their no-network application policy.

Only application sources, assets, editorial JSON, tests and build configuration belong in this repository. Local CLI state, credentials, planning files and prior hosting configuration are excluded.

Revert a release commit and push to `main` to restore the prior version. Keep the GitHub domain binding while DNS points to GitHub Pages. If retiring hosting, remove or repoint those DNS records as part of the same change.
