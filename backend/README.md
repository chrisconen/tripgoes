# TripGoes data API

This is the offer-data backend. It does not create user accounts, store personal trip plans, send email, scrape providers or make bookings. The public source registry starts empty. Homepage examples never enter this database.

## Components

- Cloudflare Worker: `worker.mjs`, `validation.mjs`, `repository.mjs`.
- D1 schema: `migrations/0001_initial.sql` (a new database only).
- `sqlite.mjs` and `local.mjs`: Node 24+ local development, never uploaded to Workers.
- `admin.mjs`: authenticated command-line ingestion, withdrawal and status.
- `../src/offers.mjs`: public HU/EN reader, with no privileged credentials.

The site stays on GitHub Pages. Only the offers page may connect to the API origin specified in `src/api-config.mjs`; other pages retain `connect-src 'none'`. Searches run on explicit interaction. The application does not retain searches or caller IPs in D1. Cloudflare handles technical request data and rate limiting.

## Run locally

```sh
npm run backend:test
npm run backend:dev
```

The API binds to `127.0.0.1:8787`. Its SQLite file is `.tmp/backend/local.sqlite`. This is a local development adapter, not a substitute for the production Workers/D1 smoke test.

Local configuration may be placed in the ignored `.tmp/backend/local-config.json`, using `INGEST_TOKEN`, `SOURCES_JSON` (a JSON-encoded string) and `ALLOWED_ORIGINS` fields. Without a secret of at least 32 characters, administration is unavailable. Do not use real provider secrets or real personal data in test fixtures. The public frontend accepts HTTPS API URLs; the HTTP loopback API can be exercised with the CLI or an HTTP client.

## Public contract

All JSON responses use `Cache-Control: no-store`. CORS allows only the configured exact site origins and never sends credential cookies. Failure responses use `{ "error": { "code": "...", "requestId": "..." } }`, without database errors or reflected bodies.

| Method and route | Result |
|---|---|
| `GET /v1/health` | Database health, API version, server timestamp and enabled-source count |
| `GET /v1/offers?origin=Budapest&destination=Tokyo&currency=EUR&limit=20` | `asOf`, `offers`, `hasMore`; newest observation first, not price ranking |
| `GET /v1/offers/{id}/history` | Up to 90 observations in the last 90 days for exactly the same comparison terms |

Origin and destination are optional Unicode substring filters. GeoNames-style `City, CC (Region)` selections search by city name; results may include identically named places, so read the complete route. Currency is optional on the API; the frontend chooses one. The first version supports EUR, HUF, USD, GBP and CHF, all using 100 minor units per major unit. No currency conversion is performed.

An offer includes `id`, `title`, `origin`, `destination`, `departureDate`, `returnDate`, `travelers`, `currency`, `totalPriceMinor`, `inclusions`, `bookingUrl`, `observedAt`, effective `expiresAt`, and `source: {id,name,kind}`. The amount is a **source-reported complete price per person** for the stated traveller count and inclusions; it is not independently verified. There is no automatic TripScore from this feed.

Only enabled sources, future departure dates and unexpired observations are returned. Effective expiry is the earliest of the supplied expiry, the current source freshness limit, and departure-day UTC midnight. Reads enforce these rules even if cron has not run. The browser uses response time plus monotonically elapsed time to remove expired cards, independent of the visitor's system clock. Withdrawal is effective on subsequent server reads; an already-open page learns of it on refresh, otherwise its existing expiry still applies.

## Source registry and protected writes

`SOURCES_JSON` is a server-side allowlist, changed by the operator through deployment configuration. There is no public source-registration endpoint. Each entry has this shape (illustration only, not an active partner):

```json
{"id":"editorial-example","name":"Example editorial desk","kind":"editorial","allowedHosts":["travel.example.com"],"maxAgeMinutes":120,"enabled":false}
```

There may be at most 20 sources and 10 exact booking hosts per source. `kind` is `editorial` or `provider`; a provider label must only be configured for an authorized source. Freshness is 1–1440 minutes. No wildcard hosts, arbitrary URL fetches, embedded credentials, custom ports or HTTP links are accepted. A provider may redirect its own HTTPS page: host validation is not a guarantee about that provider's later redirect destination or booking terms.

`INGEST_TOKEN` is a server secret with at least 32 characters. Use a cryptographically generated high-entropy value. It authenticates the importer, not the truth of its prices. Administration rejects every request carrying an `Origin` header, including the public website. Never place this token in HTML, frontend code, a URL or shell command arguments. The runtime never prints tokens or request bodies.

`POST /v1/admin/ingest` accepts `sourceId`, `batchId` and 1–20 `offers`. Each offer requires:

```json
{
  "externalId":"provider-stable-id",
  "title":"Source-provided route title",
  "origin":"Budapest, HU",
  "destination":"Tokyo, JP",
  "departureDate":"2027-01-10",
  "returnDate":"2027-01-17",
  "travelers":2,
  "currency":"EUR",
  "totalPriceMinor":65000,
  "inclusions":"Describe all included services and mandatory charges accurately.",
  "bookingUrl":"https://travel.example.com/offer/stable-id",
  "observedAt":"2026-10-20T12:00:00.000Z",
  "expiresAt":"2026-10-20T13:00:00.000Z"
}
```

These example dates are illustrative, not a valid current import. Observation times must not be in the future and new imports must fall within source freshness limits. Departure must be after the current UTC day. Maximum price is 100,000,000,000 minor units; maximum party size is 20. Bodies are limited to 64 KiB, read within five seconds. Unknown fields are rejected.

The batch ID is unique within a source. The same normalized payload returns `200` without writing again, including after expiry. A different payload with the same ID returns `409`. A new successful batch returns `201`. The receipt and all offer/history changes commit in one D1 batch. Conflicting prices at the same observation time roll back the entire batch. Changed route, dates, traveller count, currency or inclusions create a separate comparison identity; older observations cannot overwrite newer prices.

`POST /v1/admin/withdraw` accepts `{sourceId,batchId,externalIds:[...]}` (1–20 IDs). It records a persistent withdrawal timestamp and hides all matching comparison variants. Later imports observed before the withdrawal cannot revive them. A genuinely newer observation can reissue an offer. Withdrawal also uses an atomic receipt and supports replay. History is preserved.

`GET /v1/admin/status` reports row counts, enabled source IDs and the last completed expiry sweep. Set `TRIPGOES_API_URL` and `TRIPGOES_INGEST_TOKEN` through your process environment, then run:

```sh
node backend/admin.mjs ingest /path/to/import.json
node backend/admin.mjs withdraw /path/to/withdrawal.json
node backend/admin.mjs status
```

Do not put the secret in a checked-in `.env`, terminal command text or task log. Rotate it after suspected exposure; the first version has one operator/importer principal, not a multi-user authorization system.

## Deployment and operation

The checked-in `wrangler.jsonc` contains only non-secret configuration. Create the dedicated `tripgoes-data` database, set its actual ID, apply migrations, store `INGEST_TOKEN` as a Worker secret, then deploy `tripgoes-api`. Commands for an authenticated Wrangler environment:

```sh
wrangler d1 create tripgoes-data
wrangler d1 migrations apply DB --remote --config backend/wrangler.jsonc
wrangler secret put INGEST_TOKEN --config backend/wrangler.jsonc
wrangler deploy --config backend/wrangler.jsonc
```

The source registry must remain empty until approved source data is available. Never publish test fixtures as real offers. `RATE_LIMITER` is required in production and failing/missing bindings fail closed. Its namespace must be unique within the account; the configured rate is 60 requests per minute per IP and route class. Workers rate limiting is local and permissive, not a global spending cap. Monitor account usage and service errors before increasing traffic.

The 15-minute cron marks at most 1,000 expired records per run and records completion. It does not erase observations or import receipts. Review database growth and create a documented retention policy before sustained feed ingestion. Keep receipt/withdrawal retention aligned with replay and reissue guarantees.

Before release: run root tests/build checks; verify actual Worker health, CORS, missing/wrong-token rejection, empty inventory and D1 migrations. For runtime write tests, use a separate temporary database and token-protected test Worker. Do not test against customer data. The first successful deployment must record Worker version, DB identifier and smoke results.

Rollback: restore a reviewed previous Worker version. Do not blindly roll back or rerun destructive database migrations. Export/backup the database before subsequent schema changes and test restoration separately. No production restore drill is claimed by the initial release.

Official references: [D1 prepared statements and batch API](https://developers.cloudflare.com/d1/worker-api/d1-database/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [rate-limit bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [cron triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).
