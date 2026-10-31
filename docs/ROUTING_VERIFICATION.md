# Routing verification

Base: `5b6bc38bddbe8c58d95533c1c1de7553a8d1d8f2` (public staging).

- 40 explicit App Router pages share one authenticated workspace layout.
- Routing descriptors are whitelisted; query parameters cannot switch a page to another resource, dataset, invoice kind or privileged report.
- Page authentication retains the complete deep link for login return; API role/origin/namespace guards remain in place.
- 16 unit tests, including six routing cases, and the existing 85 integration tests passed.
- Production build, HTTP workflow checks, release-tool tests, original source integrity and synthetic business-pack integrity checks passed.
- Existing package-lock.json unchanged. No database migration, reseed, credential reset or real database access was performed.

Browser acceptance is exercised against the production build with isolated synthetic PostgreSQL-compatible PGlite records. It covers shared-layout navigation, Back/Forward, reloads with filters and pagination, related-document permalinks, imports, calendar, reports, historical scope, private-route denial and Finance deep links. These local checks are not evidence of a Netlify deployment; follow the staging acceptance steps after applying the updater.

Final Chromium 153 browser run passed at desktop 1440×1000 and mobile 390×844:

- A signed-out filtered page returns to the exact path/query after a real login.
- Module transitions preserve a window witness, proving no full document reload; module Back/Forward restores the filtered list.
- Page 2 and status filters survive reload and history navigation.
- Open document identity survives reload and a copied link in a second tab. Related-document Back restores the source; close retains the list filters.
- Chart tab, report date/buyer scope, calendar month/order, Approval Inbox All states, and Order Control attention filters survive reload.
- Import destination survives reload; a real CSV preview/commit opens saved records on their canonical route.
- Historical namespace survives reload; legacy links redirect; Finance invoice deep links and Management Brief source links work.
- A typed private page does not expose Finance to Operations. Mobile navigation has no page horizontal overflow.
- No browser runtime or API server error; no stock or cash posting during the navigation exercise.

The standalone updater passed 11 packaging checks against a clean archive of the public staging base: dry run, all-file conflict refusal, verified writes, unchanged non-target bytes, repeat no-op, guarded exact source restore, Windows CRLF/BOM, lockfile mismatch, symbolic paths, damaged payload and invalid options. These installer checks use local file fixtures only; they do not access a deployed database.
