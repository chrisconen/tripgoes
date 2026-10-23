# Visual asset provenance

Photography is used as editorial illustration, never as evidence of inventory.

| Local file | Source |
| --- | --- |
| hero.jpg | https://images.unsplash.com/photo-1516483638261-f4dbaf036963 — Manarola, Cinque Terre |
| amalfi.jpg | https://unsplash.com/photos/a-view-of-a-beach-with-boats-in-the-water-NTLB-2WhkYw — Positano / Amalfi Coast |
| barcelona.jpg | https://images.unsplash.com/photo-1583422409516-2895a77efded — Barcelona |
| cruise.jpg | https://images.unsplash.com/photo-1548574505-5e239809ee19 — generic cruise-port illustration; not the itinerary's actual port |
| madeira.jpg | https://unsplash.com/photos/brown-rocky-mountain-beside-blue-sea-under-blue-sky-during-daytime-Qs3z3A4HnxQ — Ponta de São Lourenço, Daniele Franchi |
| santorini.jpg | https://images.unsplash.com/photo-1613395877344-13d4a8e0d49e — Santorini |
| rome.jpg | https://images.unsplash.com/photo-1552832230-c0197dd311b5 — Rome |

Fonts: Manrope and DM Sans, distributed through Google Fonts. Font sources are fonts.gstatic.com. The upstream SIL Open Font Licenses are retained as `LICENSE-Manrope.txt` and `LICENSE-DMSans.txt`.

Brand mark and interface icons are original inline SVG geometry in this project.

`world.svg` is the land silhouette behind the experiences city picker. It is derived from Natural Earth 1:110m physical land (public domain, no attribution required), taken from the GeoJSON mirror at `https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/110m/physical/ne_110m_land.json` and projected equirectangularly onto a 1000-unit width, cropped to 78°N–58°S. The same three numbers live in `MAP` in `src/experiences.mjs`, which places the city dots; changing one without the other moves every dot off its country. City coordinates come from Wikidata by GeoNames id (`scripts/sync-experiences.mjs`), with OpenStreetMap Nominatim as the fallback for ids Wikidata does not carry.

The 20 destination photographs in `destinations/` are the link-preview image (`og:image`) of the matching `/utak/<country>/` page and its board pages; they are not displayed on the page itself. Every one is a **CC0** file from Wikimedia Commons, so no attribution is owed — the title, author, source page and licence are recorded anyway in [`content/destination-images.json`](../content/destination-images.json). Each file is a 1200×630 centre crop of the Commons 1600-pixel thumbnail, saved as progressive JPEG at quality 82; nothing was added, removed or retouched. A photograph illustrates the destination, it is not evidence of a particular hotel, price or bookable offer. A destination without a file of its own keeps the site's default hero image.

The 100 separate article photographs in `journal/` retain their individual Wikimedia Commons source licences. Full author, source, licence and file records: [journal/SOURCES.md](journal/SOURCES.md). The site displays image attribution on article pages and cards. These photographs are topic illustrations, not evidence of a bookable service.
