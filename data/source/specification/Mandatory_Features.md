# SmartERP mandatory data and presentation features

Updated: 29 October 2026. This feature contract supersedes the earlier optional treatment of CSV import and charts in the learning guide. The application is not implemented by this data pack.

## Required experience

Every relevant workspace has a consistent toolbar: Add, Upload CSV, Download Template, Export Filtered CSV, List/Charts. Selecting a row opens a detail page or drawer with related documents and activity.

Required journey: select module/company/source → upload → map columns → preview → server validation → confirm import → import summary → list/detail → charts → download.

CSV is the required initial upload/download format. XLSX and PDF exports are later enhancements, not prerequisites for these features.

## Module contract

| Workspace | Bulk input | Required display and useful chart |
| --- | --- | --- |
| Customers / Suppliers | Master-record CSV | Searchable paginated list, detail, record counts by country/type |
| Products / Inventory | Item master; controlled opening-stock import | Item detail, stock movement list, low-stock list; stock chart split by compatible UOM |
| Sales / CRM | Inquiry/order CSV, grouped by external document ID | List/detail; order value trend and order-status counts |
| Purchases | Draft PO/receipt/bill CSV | Supplier/source detail; purchase amounts and pending-receipt counts |
| Manufacturing | BOM components and planned WO CSV | BOM/WO detail; planned vs good completed pieces, QC status counts |
| People / Payroll | Employee master, attendance summary, draft payroll inputs | Employee/payslip detail; HC by department, gross/net payroll amounts |
| Finance | Draft invoice/import and unposted payment inputs | Invoice/payment detail, AR/AP lists; invoiced vs collected amounts and aging |
| Productivity report | Original UCI CSV through its source-specific mapping | Historical team-day list/detail, filters and target/actual trend |

## Preview and validation

- Show filename, selected source/module, parsed row count, header mapping, first page of rows and a paginated full-file preview.
- Summarize valid rows, warning rows, invalid rows and duplicates across the whole file. A warning does not automatically mean a rejected row.
- Validate required fields, numeric values, dates, UOM, identifiers and foreign-key references server-side. The browser preview is not authoritative.
- Use create-only with explicit duplicate handling as the first import mode; do not silently overwrite posted documents.
- Keep company context on the server. Namespaced source external IDs provide repeat-import protection.
- Validate all lines belonging to a document together. One invalid line blocks that document's import; do not create an order header without its required lines.
- Import transaction documents as Draft, or into a clearly separate historical reporting dataset. Import itself does not receive goods, dispatch stock, issue an invoice or move cash.
- Use a 5 MB / 5,000-row prototype limit per upload. The selected source tables fit this limit. Large-scale asynchronous import can follow later.
- Return an import batch ID and counts, plus downloadable error rows with row number, field and reason. Repeat confirmation of the same batch is idempotent.
- Revalidate dependencies at commit and perform atomic writes per document/batch policy. Cancel or validation-only preview must not write business records.

## List, detail, export and charts

- Lists support search, status/date/source filters, sort, pagination and clear empty/error states.
- Detail includes line items, source references and related documents. Display raw source labels when normalized labels are also shown.
- Export must use the same company/source/filter scope as the list and chart, across all matching records rather than only the visible page. Label export scope.
- Export a separate, explicit selected-row download when selection is supported; it must not be confused with all filtered records.
- Charts use aggregates from saved records. Clicking a series/bar should open the corresponding filtered list where practical.
- Do not mix source monetary units with BDT, kilograms with pieces, archived reporting with current stock, or cash movement with profit.
- Invalidate/refetch lists, details, summary counts and chart queries after import or a business action.

## Source-specific handling

Northwind: preserve 1996–1998 dates and original values. The selected raw tables do not declare a currency field; label historical monetary aggregates as source price units until a justified currency policy exists. Northwind products are trading/food sample products; do not rename them as fabric while claiming original data. UnitsInStock is a source snapshot: replaying historical orders against it would double-count/incorrectly reconstruct inventory. Raw orders do not establish that invoices or customer payments exist.

UCI: preserve the 2015 dates and use a historical report period. Blank WIP remains null, not 0. Preserve raw department; a previewed normalization may trim whitespace and map the source typo sweing to sewing. quarter means a portion of a month in the source description, not a calendar quarter. The source file contains 37 actual_productivity values above 1 despite the published 0–1 description: flag for review and retain source values; do not clamp. The 140 fractional no_of_workers values must not be rounded or converted to employee headcount without clarification. Do not infer payroll, wages or individual employee IDs from team-day observations.

Use UCI and Northwind in separate dataset namespaces. They do not share real keys. The synthetic SmartERP scenario is a third dataset with its own BDT values and IDs.

## Simple implementation

Next.js + JavaScript, PostgreSQL/Prisma, native fetch and shared business services remain the stack. Papa Parse can handle CSV parse/unparse; Zod handles server validation; Recharts supplies the required charts. Prefer a reusable ImportWizard, DataTable, DetailDrawer, ExportButton and chart wrapper. A small module registry owns columns, validation, external ID rules and allowed draft fields.

Suggested endpoints: POST /api/imports/preview, POST /api/imports/{batchId}/commit, GET /api/imports/{batchId}/errors, GET /api/{module}, GET /api/{module}/{id}, GET /api/{module}/export, GET /api/reports/{report}.

## Revised two-day delivery order

Day 1: schema/seed and shared table/detail/import/export shell first; then Sales → procurement → inventory → simple production. Reuse those components for each module.
Day 2: finance and basic payroll; then saved-data charts, filters/drill-down, import exceptions and end-to-end rehearsal.

Keep one company/warehouse, BDT for the synthetic demo, simple BOM and full-batch production/delivery. Time for upload/preview/charts comes from reducing specialist manufacturing/accounting depth, not from dropping the required data features.

## Acceptance examples

1. UCI upload previews 1,197 rows before any write. Its known quality issues appear as warnings or nulls according to the mapping.
2. A fresh historical import yields 1,197 report records; importing the same external keys again does not double the count.
3. A missing required customer/item reference is shown before an order can be committed.
4. A malformed line prevents its whole document from being partially created.
5. Preview/cancel produces no stock or finance postings. Explicit business posting still enforces stock, QC and payment controls.
6. List, chart and export agree on record population after filters. Historical dates produce useful results under a suitable default report range.
7. Export includes all filtered records and the expected columns, IDs and units; re-import does not silently duplicate records.
