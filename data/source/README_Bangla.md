# SmartERP Online Dataset Starter

প্রস্তুত: ২৯ অক্টোবর ২০২৬। Stack: Next.js + JavaScript।

এই pack-এ দুইটি online source-এর যাচাই করা sample data, তাদের attribution, data profile এবং SmartERP-এর নতুন mandatory feature contract আছে। কোনো data Ahsan Group-এর actual records হিসেবে দেখানো যাবে না।

## Recommended use

**Northwind দিয়ে relational foundation; UCI দিয়ে garments analytics; আলাদা synthetic scenario দিয়ে BOM, production, invoices/payments এবং payroll workflow।** একটিমাত্র dataset সব module পূরণ করছে—এমন ধরে নেওয়া যাবে না।

## 1. Northwind

Source: https://github.com/jpwhite3/northwind-SQLite3
Microsoft context: https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/northwind-install
Selected SQLite port licence: MIT; full notice licenses/Northwind_MIT.txt-এ আছে।

ডাউনলোড করা src/create.sql থেকে clean in-memory SQLite database তৈরি করে data গোনা ও foreign keys check করা হয়েছে। Random populate script চালানো হয়নি।

| Table | Verified records |
| --- | ---: |
| Customers | 93 |
| Suppliers | 29 |
| Products | 77 |
| Categories | 8 |
| Employees | 9 |
| Orders | 830 |
| Order Details | 2,155 |
| Shippers | 3 |

Selected tables-এর JSON আছে northwind/json/-এ। এগুলো Next.js/Prisma seed বা mapping script-এর input। Binary category pictures ও employee photos JSON থেকে বাদ; raw SQL source অক্ষত আছে। অন্য field values বা dates পরিবর্তন করা হয়নি।

Import/seed order: categories + suppliers + customers + employees + shippers → products → orders → order_details। Original IDs source external IDs হিসেবে preserve করবে। Source/company namespace যোগ করে app IDs map করবে।

Northwind fictional trading-business sample; garments-specific নয়। এই selected raw tables-এ manufacturing BOM, supplier purchase documents, customer payment allocation বা actual payroll নেই। Historical orders মূলত 1996–1998; current-year filter দিলে charts ফাঁকা হবে।

## 2. Garment productivity

Source: https://archive.ics.uci.edu/dataset/597/productivity+prediction+of+garment+employees
DOI: https://doi.org/10.24432/C51S6D
Licence: CC BY 4.0; attribution এবং licence link licenses/UCI_CC_BY_4_Attribution.txt-এ আছে।

garment_productivity/garments_worker_productivity.csv হলো original, unchanged CSV: **1,197 rows, 15 columns**, 2015-01-01 থেকে 2015-03-11। UCI-র 14 features-এর সঙ্গে actual_productivity column আছে।

Useful fields: date, department, team, targeted_productivity, actual_productivity, over_time, incentive, wip, no_of_workers। এটি team-day observations; employee-level HR/payroll নয়।

Data দেখে পাওয়া বিষয়গুলো:

- WIP missing: **506 rows**। Missing-কে 0 করা হবে না।
- Department raw labels: finishing, finishing-with-trailing-space এবং sweing। Raw value preserve করে proposed normalization preview করো।
- Actual productivity > 1: **37 rows**। Published description-এর range-এর সঙ্গে disagreement flag করবে; source value clamp করবে না।
- Fractional worker values: **140 rows**। এগুলো থেকে individual HC বানানো বা round করা যাবে না।
- date + trimmed department + team key-এর duplicate: **0**।

এই data দিয়ে productivity trend, target/actual comparison, department-wise overtime এবং searchable historical list করা যাবে। Northwind বা Ahsan employee records-এর সঙ্গে বানানো IDs দিয়ে join করা হবে না।

## 3. Synthetic workflow complement

demo/synthetic_smarterp_scenario.json আগের learning guide-এর 10,000 T-shirt scenario। এটি নতুন generated learning example; downloaded online business evidence নয়। এতে BOM input, source purchase, invoice/payment এবং one-employee payroll arithmetic আছে। এটি complete posted-ledger database dump নয়।

Expected checkpoints: material shortage 800 kg; sales invoice BDT 4,500,000; buyer receipt BDT 2,000,000; remaining AR BDT 2,500,000; supplier full payment-এর পরে AP 0; one salary payment BDT 29,000; selected-event net cash movement BDT 1,571,000।

## Required SmartERP experience

**Bulk upload → column mapping → preview → validation → confirmed import → paginated list → detail view → saved-data charts → filtered download।**

এখন এগুলো mandatory। আগের guide-এ CSV/charts optional বলা থাকলে specification/Mandatory_Features.md-এর নতুন requirement অনুসরণ করবে। Source JSON initial seed-এর জন্য; user-facing CSV upload/download-এর জন্য shared wizard ও exporter বানাবে।

একই framework Customers, Suppliers, Products, Orders, BOM/WO, Employees/Payroll এবং Finance inputs-এ reuse করবে। Transaction data import প্রথমে Draft বা separate historical reporting records হবে; imported rows নিজে থেকে stock/finance posting করবে না।

Chart calculations ও important labels specification/Chart_Definitions.json-এ। UI implemented না হওয়া পর্যন্ত এটিকে working app বলা হবে না।

## Implementation references

- CSV parse/unparse: https://www.papaparse.com/docs
- Charts: https://recharts.github.io/en-US/
- Next.js Route Handlers: https://nextjs.org/docs/app/getting-started/route-handlers

ডাউনলোড করা source bytes-এর hashes এবং profile data_profile.json ও manifest.json-এ আছে। Pack-এর files যাচাই করে নেওয়া হয়েছে; Excel workbook বা actual deployed ERP এই deliverable নয়।
