# Experience update verification

Base: public staging source `9b536a5dd76e1f2bef0d1e3d3f4698f3224fe16e`.
Runtime: Node 24.22.1; exact existing package-lock retained. No production database was accessed, reset or seeded.

Automated checks on the updated source:

- 10 unit tests.
- 85 integration tests, including 7 new Order Control/import checks.
- 14 release-tool tests.
- Production build, source byte-integrity checks, business-pack manifest checks and repository secret scan.
- HTTP checks: authentication, all three functional roles, independent reviews, payroll date protection, exact domain postings, reversal, read-only Order Control, role-safe exports, import history scope and invalid mapping/batch responses.

The new service tests exercise real relational records through quotation, confirmation, independent approval, material planning, purchase, accepted receipt, supplier-bill matching, reservation, material issue, production, quality release, dispatch, invoice, receipt, reversal and settlement. They verify no mutation from reads, exact material/receivable balances, private Finance omission, namespace isolation, pagination, whole-batch issue filtering and explicit cohort limits.

Browser verification uses an isolated local PostgreSQL-compatible PGlite fixture with synthetic data and the production build. It is not a concurrent PostgreSQL load benchmark or evidence of live Netlify acceptance. Verified in Chromium 153 at desktop 1440px and mobile 390px:

- Real Operations and Finance logins, next-document modal drilldown and safe modal close.
- Finance balances omitted for Operations and visible to Finance.
- File-type guard, column mapping samples, whole-file blocking errors, server-filtered issue view.
- Corrected file creates Drafts without stock posting; identical replay skips the two documents.
- A 300-row import pauses after the first 250-document chunk, survives a full reload, then resumes to 300 saved documents.
- Overview, Sales & Buyer Health and Collection Priority render their saved-data charts.
- Mobile navigation and upload view; no page horizontal overflow, browser runtime error or API server error in the exercised flow.

Follow the live acceptance steps in EXPERIENCE_UPDATE_BANGLA.md after applying the update.

The collection scatter point also opens the real source invoice in the document workspace. Chart bars render with bounded widths and without transitional animation; monetary labels use BDT and grouping suitable for Bangladesh.

The standalone updater was tested against a clean copy of the base source: dry-run has no writes; edited files stop the complete update before any replacement; Windows CRLF and a directory containing spaces work; environment files, exact lockfile and datasets remain byte-identical; rerunning is a no-op. Source restore rejects later edits and retains the additive migration so database migration history remains valid. These are local checks; no claim is made that the updater was executed on the user's Windows computer.
