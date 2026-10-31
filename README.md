# SmartERP

A modular garment-operations application connecting a buyer order, Merchandising review, material planning, purchasing, inventory reservations, manufacturing/QC, delivery, Finance and payroll. Business documents remain linked; critical writes use transactions, source-event idempotency, status guards, scoped references and activity history.

Current update guide: [USABILITY_SETUP_BANGLA.md](USABILITY_SETUP_BANGLA.md). The prior application is on the public staging branch at `ceb38088e6de26814c00a1125e223950f43f9b8d`; the new record-management/analytics changes are prepared locally and have not been deployed or promoted. [RELEASE_SETUP_BANGLA.md](RELEASE_SETUP_BANGLA.md) remains the initial setup reference.

## Application

- Apps Home, Overview, scoped Global Search, saved workflow counts and document workspaces with Summary / Related documents / Activity history.
- Sales inquiry/quotation/order, approved Merchandising handover, BOM material checks and shortage purchases.
- PO approval, accepted GRN, supplier-bill matching, fabric reservations and issue, QC-held production, QC release and full delivery.
- Customer invoice and supplier-bill posting, allocated receipts/payments, AR/AP, selected-event journals and saved financial reports.
- Reviewed attendance/fixed payroll components, independent payroll approval, Finance salary settlement and paid payslips.
- Independent review inbox and T&A milestones with prerequisites, baseline dates, rescheduling and overdue views. Calendar completion does not post stock or money.
- CSV mapping, whole-file validation, preview, resumable bounded commits, document atomicity, filtering, related records and CSV/template/error downloads. Upload limit: 2 MB / 5,000 rows. Operational transaction imports create Draft records, never postings.
- Organised invoice/bill/delivery/payment/payslip views and browser Print / Save PDF.
- Safe Draft soft delete/restore, master archive/restore, guarded unposted cancellation and immutable customer/supplier/salary payment reversal vouchers. Work Orders use their existing reservation-aware cancellation; posted stock/invoice reversal remains outside scope.
- Buyer duplicate warnings with explicit reviewed override, searchable saved-reference selection, and a light pastel theme. Saved-data analytics add buyer/date/stage scopes, record drill-down, stock/production/T&A panels, role-protected AR aging/cash charts and aggregate CSV downloads.
- On-demand Bengali Management Brief from backend-computed aggregate facts and links. Native Responses API call, strict JSON, 15-second timeout, no automatic retry, no tools/SQL/mutation access and an honest rules-based fallback. Key remains server-side.

Three fixed functional accounts: System Admin, Operations and Finance. APIs enforce the same permissions as navigation. Submitters cannot approve their own submitted review requests. These are functional accounts, not individual enterprise identities.

## Stack

Node 24; Next.js App Router; authored JavaScript/JSX; React; Tailwind; shadcn/ui JavaScript components; Knex + pg; Neon PostgreSQL target; local persistent PGlite PostgreSQL engine; Papa Parse; Zod; Recharts; native fetch. Exact dependencies are committed in package-lock.json. Release preparation introduces no new package dependency.

## Local development

For an already running project, preserve .env.local and .local-db. Apply the current standalone updater and follow the delivery guide; do not reset/reseed a working DB.

For a fresh checkout only: run `npm ci`, copy .env.example to .env.local and set APP_ENV=development, APP_MODE=demo, APP_URL=http://localhost:3000. If using the bundled local engine, set both DATABASE_URL and DATABASE_DIRECT_URL to `postgresql://postgres:postgres@127.0.0.1:5439/postgres`.

Keep `npm run db:local` running in a separate terminal. Its persistent files live in .local-db; it is a PostgreSQL engine through a local pg socket, not a Neon deployment. Then explicitly run:

```bash
npm run db:migrate
npm run db:seed:demo
npm run auth:setup
npm run dev
```

Account setup prints each new password once. Store it privately; repeat setup preserves existing passwords. No ordinary startup/build/deployment creates accounts or seeds business records. Optional initial workflow and people seeds create Drafts only; posting actions require review in the app.

See [ACCESS_AI_UPDATE_BANGLA.md](ACCESS_AI_UPDATE_BANGLA.md) for fixed-account permissions, password reset, optional local AI and document usage.

## Repository and checks

Run `npm run repo:check` before adding/pushing code, then again after staging files. It scans current/index/reachable-history plaintext and reports paths/reasons without credential values. It is heuristic; no local Git hook is silently installed. Protected local DB/env/backups/reports and downloaded updater files are ignored.

```bash
npm run security:deps
npm run verify:quick
npm run test:release
npm run test:integration
npm run build
npm run test:http
```

The current integration command contains 67 cases, including nine new usability/correction cases. CI uses Node 24, `npm ci`, pinned official GitHub actions and disposable synthetic DB fixtures without cloud credentials. The new source still needs its own hosted CI/deploy run after push; the base branch's earlier green run does not validate this update.

[docs/VERIFICATION.md](docs/VERIFICATION.md) records what was actually run and its limits. [SECURITY.md](SECURITY.md) describes controls, heuristic scan boundaries and remaining real-data gates.

## Hosted staging and release

For the existing staging app, follow [USABILITY_SETUP_BANGLA.md](USABILITY_SETUP_BANGLA.md): apply sources, explicitly migrate the staging profile, pass preflight, then push staging. Do not reseed/reset accounts. [RELEASE_SETUP_BANGLA.md](RELEASE_SETUP_BANGLA.md) applies to first-time initialization. Local .env.local never becomes the cloud profile.

Netlify application variables must be set in its UI for runtime access. Verified builds bundle non-secret branch/environment/commit metadata; previews and unrelated branches stop before DB use. `build:deploy` validates readiness and builds code without migration, seed, password reset or AI allowance reset. Health and authenticated smoke evidence identify the actual deployed commit. Promote only a live-tested staging commit to main, then initialise a separate empty production DB/project explicitly.

First hosted AI remains disabled. Each isolated DB has its own allowance ledger; combined local/staging/production provider spend is not coordinated. Enable a new paid context only after a shared authority or partitioned remaining USD 1 allowance has been arranged.

## Data and scope

Operational synthetic, Northwind historical and UCI historical datasets use separate namespaces. Original source bytes, dates, units, attribution and warnings are preserved; all 17 source files have manifest SHA-256 verification. See [data/source/README_Bangla.md](data/source/README_Bangla.md).

The fixed synthetic scenario reconciles AR BDT 2,500,000, AP 0, salary payable 0 and selected-event net cash movement BDT 1,571,000. This is not profit, full garment costing, statutory accounting or an opening-balance-inclusive bank balance.

Posting scope remains one company/HQ/HQ-STORE, one finished style/fabric BOM and full receipt/production/QC release/delivery quantities. Multi-component BOM, variants, lots/rolls, partial/rejected quantities, returns, wastage, subcontracting and full costing remain future work. Individual identities, finer permissions/MFA, production DB privileges, security review, monitoring, recovery drills and broader acceptance remain real-data release gates. No enterprise certification is claimed.
