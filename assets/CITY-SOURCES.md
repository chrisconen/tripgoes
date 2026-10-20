# Offline city suggestion data

Attribution: [GeoNames](https://www.geonames.org/). Licensed under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). TripGoes adapted the source data into a compact offline JavaScript module; GeoNames does not endorse TripGoes.

## Source and scope

Downloaded 2026-10-20 from the official [GeoNames download directory](https://download.geonames.org/export/dump/). The [source README](https://download.geonames.org/export/dump/readme.txt) identifies the CC BY 4.0 license. Its cities15000 selection targets places with populations above 15,000 or capitals. The downloaded snapshot contains other feature types, including urban sections and historical or abandoned places; source records are preserved, not silently filtered.

`src/cities-index.mjs` contains all **34,173 source records**, spanning **244 country/territory codes**. It is **2,977,651 bytes without compression**. This is not a list of every existing settlement. Population, naming, boundaries and administrative classification may be incomplete or outdated. A suggestion is not proof of an address, destination suitability, safety, transport service or bookability. The UI must continue to accept places absent from the list.

## Data contract

- `cityRows`: `[name, ascii, countryCode, admin1Code, geonameId, aliases, population]` tuples.
- `name` and `ascii` preserve the corresponding source fields. `geonameId` is the source numeric ID, not an array index.
- `population` (index 6) preserves the numeric source population, including zero or potentially outdated estimates. Use it as a suggestion-order tie-breaker, not a current demographic claim.
- `aliases` contains up to three distinct strings actually present in that record's source alternate-name field. It is not a complete alias list or a set of certified local-language translations.
- `admin1Names`: dictionary keyed by country code plus a dot plus the source administrative code, e.g. `US.CA`. Missing keys must fall back to the raw administrative code; those codes are not uniformly ISO subdivisions.
- `countryNames`: English source country-name fallback. The UI may obtain localized display labels from its runtime `Intl.DisplayNames`; those labels are not included or claimed as GeoNames translations here.
- `cityDataMeta`: version, snapshot date, source, license, attribution, tuple contract, counts and source archive hash.

Rows are ordered by source population descending, then GeoNames ID ascending. This supports predictable suggestions; it is not a popularity, quality or travel recommendation ranking. No city was dropped or deduplicated by name: identically named places retain distinct IDs. The source's country/territory assignment is reproduced without making a political determination.

## Adaptation and verification

The complete source rows were parsed as UTF-8 tab-separated data. Only the fields above were retained; 72,868 source aliases were selected. Alias selection prioritizes the requested Vienna/Wien/Bécs, Munich/München and Tokyo/東京 examples, then a country-script candidate when configured, a non-ASCII candidate and an ASCII candidate, with remaining source order as fallback. It is a bounded matching aid, not a linguistic completeness claim. Short ASCII codes, control characters, angle-bracket strings and aliases longer than 80 characters were excluded from aliases only.

All source IDs occur exactly once in the output. All selected aliases were checked against their source record. Country-code coverage is complete against countryInfo.txt. 2,764 administrative-name keys are supplied; 25 used source keys lack an admin1 label and require the fallback described above. The main source names were not changed. The module passes the 3 MB uncompressed budget.

Names and aliases are data, not HTML. Render them with text-safe APIs. Lazy loading requires no API account, cookies or query transmission to GeoNames. Attribution should remain accessible from the city input or the site's credits when this derivative is published.

Module SHA-256: `477e6bb6f7208f548ac57e07eb1e3506fa40eaae6a1641cf4bca68ee27d40967`.

## Download provenance

| Official source | Download bytes | HTTP Last-Modified | SHA-256 |
|---|---:|---|---|
| [cities15000.zip](https://download.geonames.org/export/dump/cities15000.zip) | 3362238 | Tue, 20 Oct 2026 01:55:50 GMT | `a839fd6af3d55e5d41d2e281d481b7c0887cc9f2bc536723708843ef01e70ea8` |
| [countryInfo.txt](https://download.geonames.org/export/dump/countryInfo.txt) | 31690 | Tue, 20 Oct 2026 02:01:30 GMT | `c55f638cfaafb4fe45a9aa15120a0f1f78e8a34a8e1847d7b9320cf740fbc9ab` |
| [admin1CodesASCII.txt](https://download.geonames.org/export/dump/admin1CodesASCII.txt) | 151583 | Tue, 20 Oct 2026 01:55:50 GMT | `b577baa3476bbe94f0454545e517e1835401d79c5b1105c8e02cf1d4a505e8ec` |
| [readme.txt](https://download.geonames.org/export/dump/readme.txt) | 8843 | Tue, 20 Oct 2026 01:46:02 GMT | `b1957379b6c1242c700c98ac9a8aa0a09f56c3c0a50ee72175527005f48ef2c5` |
