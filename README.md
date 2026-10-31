# SmartERP

### Connected garment operations, from buyer inquiry to payment.

[![Checks](https://github.com/Rafi1210/smarterp/actions/workflows/ci.yml/badge.svg)](https://github.com/Rafi1210/smarterp/actions/workflows/ci.yml)
![Node.js](https://img.shields.io/badge/Node.js-24-5fa04e?logo=nodedotjs&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-f7df1e?logo=javascript&logoColor=222222)

**[Live app](https://demo-smarterp.netlify.app/login)** · **[Workflow](#workflow)** · **[Architecture](#architecture)** · **[Setup](#run-locally)** · **[Scope](#current-scope)**

SmartERP is a modular Enterprise Resource Planning application connecting sales, merchandising, purchasing, inventory, manufacturing, finance and payroll through traceable documents.

**The case study:** replace disconnected registers with a workflow that answers *what is blocked, who acts next, and which document needs attention*. The hosted app uses synthetic data and requires an account; credentials are not published.

![SmartERP overview: saved order metrics, receivables and selected-event cash movement](docs/screenshots/overview.png)

## Business value

| Capability | Business question |
| --- | --- |
| **Order Control** | Which orders need attention, what is blocking them, and who acts next? |
| **Linked documents** | How does an order connect to its materials, delivery, invoice and payments? |
| **Sales & Buyer Health** | Which buyers dominate the order book, return, decline or stop ordering? |
| **Collection Priority** | Which posted balances need follow-up, using actual due dates? |
| **Import Center** | Can spreadsheets be validated and resumed without duplicate records or accidental postings? |

## Workflow

| Role | Responsibilities |
| --- | --- |
| **Operations** | Inquiry → quotation → sales order → merchandising → material check → purchase order → accepted goods receipt → matched supplier bill → reserved work order → material issue → production → Quality Control (QC) release → delivery. |
| **System Admin** | Independently reviews Bills of Material (BOM), merchandising, purchase orders and payroll. Submitters cannot approve their own requests. |
| **Finance** | Posts bills/invoices and allocates payments/receipts. Reviews attendance and fixed salary components, submits payroll for approval, then settles salary and generates paid payslips. |

Document workspaces include related records, guarded actions and activity history. Forty page routes preserve filters and document links across refresh and browser history. A Time and Action (T&A) calendar tracks milestones and dependencies; milestone completion does not post stock or money.

## Product views

<details>
<summary><strong>Order Control — blockers, responsible roles and next actions</strong></summary>

![Order Control with source-linked next actions and responsible roles](docs/screenshots/order-control.png)

</details>

<details>
<summary><strong>Business analysis — order patterns and buyer concentration</strong></summary>

![Saved-data order trends, buyer concentration and order-value distribution](docs/screenshots/sales-analysis.png)

Bar, line, donut, Pareto, histogram and receivables scatter views support scoped analysis, record drill-down and filtered exports. Confirmed order value is not recognized revenue.

</details>

<details>
<summary><strong>Import Center — whole-file validation before saving</strong></summary>

![Three-document CSV preview with zero blocking errors](docs/screenshots/import-preview.png)

Comma-Separated Values (CSV) uploads support mapping, preview and error downloads, capped at 2 MB / 5,000 rows. Resumable bounded commits preserve whole-document atomicity. Identical replays are skipped; operational transactions import as Drafts, never postings.

</details>

*Actual browser captures from isolated local synthetic data. [Capture evidence](docs/SCREENSHOTS.md).*

## Architecture

```mermaid
flowchart TD
    UI["Browser · role-aware workspace"] --> APP["Next.js pages and API routes"]
    APP --> SERVICES["Domain services · permissions and validation"]
    SERVICES --> DB[("PostgreSQL · documents, stock, finance and history")]
    SERVICES --> FACTS["Reports · computed facts and source links"]
    FACTS --> BRIEF["Management Brief · budget and cache"]
    BRIEF --> MODEL["OpenAI Responses API · Bengali explanation"]
```

**Stack:** Node.js 24 · Next.js App Router · JavaScript/JSX · React · Tailwind CSS · shadcn/ui · Knex + pg · Neon PostgreSQL · Papa Parse · Zod · Recharts · native fetch. [Exact lockfile](package-lock.json).

**Correctness:** database transactions, unique source events, status guards and scoped references protect critical writes. Relational records persist document lines/links, stock movements, reservations, obligations, payment allocations and activity history. Money uses integer minor units; quantities retain their units. Draft deletion, master archiving and payment reversal preserve traceability.

**Only AI feature:** an on-demand Bengali Management Brief explains backend-computed aggregates using `gpt-6-luna`, strict JSON, reasoning disabled and `store: false`. Controls include a USD 1 database-backed allowance, USD 0.01 reservation, 30-call daily cap, cooldown, snapshot-aware cache, 1,000-output-token cap, 15-second timeout and zero automatic retries. No raw personal/payroll/CSV data, tools, SQL or mutation access; an honest rules-based fallback remains available.

## Reproducible scenario

The [11-file / 66-row synthetic pack](data/business-pack/README.md) exercises imports and role handoffs. The focus order produces 10,000 T-shirts: 2,200 kg fabric required, 1,400 kg opening stock, and an 800 kg purchase.

| Focus-flow check | BDT (Bangladeshi taka) |
| --- | ---: |
| Customer invoice / receipt | 4,500,000 / 2,000,000 |
| Remaining Accounts Receivable (AR) | 2,500,000 |
| Remaining Accounts Payable (AP) / salary payable | 0 / 0 |
| Selected-event net cash movement | 1,571,000 |

Cash movement is **not profit**, full garment costing, statutory accounting or an opening-balance-inclusive bank balance. Synthetic operations, Northwind history and UCI history retain separate namespaces, original dates/units, attribution and manifest byte hashes. [Source notes](data/source/README_Bangla.md).

## Run locally

Requires **Node.js 24**. For a fresh checkout:

```bash
npm ci
cp .env.example .env.local
```

Set `APP_ENV=development`, `APP_MODE=demo`, `APP_URL=http://localhost:3000` and `AI_ENABLED=false`. For the bundled local engine, set both `DATABASE_URL` and `DATABASE_DIRECT_URL` to `postgresql://postgres:postgres@127.0.0.1:5439/postgres`.

Run `npm run db:local` in one terminal; in another:

```bash
npm run db:migrate
npm run db:seed:demo
npm run auth:setup
npm run dev
```

New account passwords print once; store them privately. Local development uses persistent PGlite with a pg socket; hosted environments use Neon. **Existing installations keep their environment, accounts and data.** Ordinary deployments do not seed or reset them.

## Verification and release

Local routing-release checks passed **16 unit tests, 85 integration tests, 14 release-tool tests, production build and HTTP workflow checks**, plus browser navigation/import/role checks. Integrity checks cover 17 original files and 11 training CSVs. [Routing evidence](docs/ROUTING_VERIFICATION.md).

```bash
npm run repo:check
npm run verify:quick
npm run test:integration
npm run test:release
npm run build
npm run test:http
```

GitHub Actions checks `staging` and `main`; Netlify builds without automatic migration or seeding. Live-test staging before promoting to main. Production requires an isolated database and explicit initialization. [Deployment setup](RELEASE_SETUP_BANGLA.md).

## Current scope

One company, one warehouse, one fabric component per order/BOM, full-quantity operational actions, and three fixed functional accounts.

Production work remains: variants/multi-component BOMs, partial operations, lots/rolls, returns/wastage, full costing, individual permissions/recovery, least-privilege database access, monitoring, measured load/security validation and backup-restore drills. AI allowances are not coordinated across databases. [Security scope](SECURITY.md).

**A working workflow application and portfolio case study; not an enterprise-certified ERP or real-data production release.**
