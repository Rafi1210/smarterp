# SmartERP module routes

Base: public staging source `5b6bc38`. আগের Experience update-এর ওপর এই routing update তৈরি।

## ব্যবহার

একই app-এ module অনুযায়ী 40টি explicit Next.js App Router page যোগ হয়েছে। Shared layout-এ sidebar, account ও workspace থাকে। উদাহরণ:

| কাজ | Route |
| --- | --- |
| Apps Home | `/apps` |
| Overview | `/overview` |
| Order Control | `/order-control` |
| Approval Inbox | `/approvals` |
| Customers | `/sales/customers` |
| Inquiries / Quotes / Orders | `/sales/orders` |
| Deliveries | `/sales/deliveries` |
| Merchandising | `/merchandising/order-sheets` |
| Purchase Orders | `/purchases/orders` |
| Goods Receipts | `/purchases/receipts` |
| Supplier Bills — Operations | `/purchases/bills` |
| Inventory | `/inventory/items` |
| Opening Stock | `/inventory/opening-stock` |
| Material Recipes | `/manufacturing/bom` |
| Work Orders / Quality Control | `/manufacturing/work-orders` |
| Time and Action Calendar | `/planning/calendar` |
| Customer Invoices — Finance | `/finance/invoices` |
| Receipts / Payments | `/finance/payments` |
| People / Payroll | `/people/employees`, `/people/payroll` |
| Sales & Buyer Health | `/reports/sales` |
| Collection Priority | `/reports/collections` |
| Financial Snapshot | `/reports/financial` |
| Inventory Availability | `/reports/inventory` |
| Import Center | `/imports?resource=sales` |
| Management Brief | `/management-brief` |
| Northwind history | `/history/northwind/sales` |
| Garment productivity history | `/history/garment-productivity` |

Sidebar-এর links নতুন tab-এ খোলা যায়। Filters, page number, chart/list view এবং selected document address bar-এ থাকে। URL (Uniform Resource Locator) copy/share করলে অন্য permitted account একই context খুলতে পারে; link নিজে access দেয় না।

- Search text address bar-এ replace হয়; প্রতিটি keystroke-এর জন্য Back চাপতে হয় না।
- Page, stage ও filter selection-এর history থাকে; Back/Forward-এ ফেরত যায়।
- Document workspace খুললে `record`, `record_resource`, `record_dataset` থাকে। Related document-এ গেলে linked identity বদলায়; মূল list-এর filters থাকে।
- Document workspace বন্ধ করলে selected-document parameters মুছে যায়। Reload করলে open document ফেরত আসে।
- Reports-এর dates, buyer, scope, histogram band ও pagination; calendar-এর month/order/day; Approval Inbox ও Order Control-এর filters URL-এ থাকে।
- First resolved report/calendar date scope link-এ রাখা হয়, যাতে bookmark-এর date scope অজান্তে না বদলায়।
- Operations / Northwind / garment history আলাদা routes ও namespaces-এ থাকে।
- Signed-out অবস্থায় link খুললে login-এর পরে সেখানেই ফিরবেন। Role permission server page ও backend API (Application Programming Interface)-তে যাচাই হয়। Restricted/unknown page পাওয়া যায় না।
- পুরোনো `/?workspace=...` ও `/?record=...&resource=...` links নতুন route-এ redirect হয়। Management Brief-এর source links-ও canonical pages খোলে।

## প্রয়োগ

চলমান local server বন্ধ করুন। Download-এর শেষের `.txt` বাদ দিয়ে `update-smarterp-routes.mjs` নাম দিন; `E:\smarterp`-এ রাখুন। ওই folder-এর terminal-এ:

```sh
node update-smarterp-routes.mjs --dry-run
node update-smarterp-routes.mjs
npm test
npm run build
npm run dev
```

Updater সব changed file আগে যাচাই করে; local edit conflict হলে overwrite করে না। Backup `.smarterp-backups/routes-*`-এ থাকে। একই updater আবার চালালে already-updated files skip হয়।

প্রয়োজনে updater-এর output-এ দেখানো `--restore routes-...` command দিয়ে source files আগের অবস্থায় নেওয়া যায়। Update-এর পরে নিজের edit থাকলে restore থেমে যাবে; overwrite করবে না। Windows-এর CRLF (Carriage Return + Line Feed) ও UTF-8 BOM (Byte Order Mark) source-ও যাচাই করা হয়েছে।

এই update-এর জন্য নতুন database migration, seed, account setup, environment value বা dependency installation প্রয়োজন নেই। Existing exact lockfile অক্ষত থাকে।

## Staging

Local checks সফল হলে existing staging profile দিয়ে readiness দেখুন:

```sh
npm run profile -- staging deploy:check
```

তারপর reviewed changes commit/push করুন:

```sh
git add package.json src scripts/verify-http.mjs tests/routing.test.cjs ROUTING_UPDATE_BANGLA.md docs/ROUTING_VERIFICATION.md
git commit -m "Add module routes and persistent workspace URLs"
git push origin staging
```

Netlify সফল হলে `/sales/orders`, `/order-control`, `/imports?resource=sales` ও `/reports/sales` সরাসরি খুলুন। Record খুলে refresh, filter রেখে Back/Forward ও তিন role-এর permitted pages মিলিয়ে নিন। Staging-এ tested হওয়ার পরে main-এ promote করুন।

## সীমা

এগুলো একই app-এর page routes; domain services ও transactions আগের modular implementation-এ থাকে। Unsaved form input এবং commit-এর আগের local file selection reload-এর পরে ফেরত আসে না। Preview তৈরি হয়ে গেলে saved batch থেকে আগের import-resume নিয়ম ব্যবহার করুন। No stock, money, account বা source data reset হয় না।
