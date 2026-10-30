> Current update: **ACCESS_AI_UPDATE_BANGLA.md** অনুসরণ করো। নিচের guide আগের checkpoint-এর; login/roles/AI/docs এখন নতুন guide অনুযায়ী চলবে।

# SmartERP — Apps Home, Search, Approval Inbox ও T&A Calendar

এই update-এ প্রথম extension-এর চারটি feature এসেছে। আগের Merchandising/Inventory/Finance/People পরিবর্তনও cumulative updater-এ আছে। এটি নিজস্ব SmartERP functionality; Odoo বা Microsoft service-এর connection/subscription যোগ করে না।

## Apply

Next app-এর terminal-এ Ctrl+C দাও। Database terminal চালু রাখো। `update-smarterp-workspace.mjs` file-টি `E:\smarterp`-এ রেখে চালাও:

```bash
node update-smarterp-workspace.mjs
npm run db:migrate
npm run db:check
npm run dev
```

Node 24 লাগবে। নতুন package/dependency নেই। `.env.local` বদলাতে বা API key দিতে হবে না; AI_ENABLED=false থাকুক। Database reset/ordinary seed চালাবে না। এই feature-গুলোর জন্য কোনো paid AI call হয় না।

প্রথমে শুধু পরিবর্তনের তালিকা দেখতে `node update-smarterp-workspace.mjs --check` চালানো যায়। অন্য project folder হলে `--project "E:\smarterp"` দাও। TXT copy নিলে শেষের `.txt` সরিয়ে `.mjs` করবে।

Updater `.smarterp-backups`-এ বদলানো source-এর backup রাখে। `.env.local`, `.local-db`, original source datasets, node_modules, .git ও exact package-lock.json অক্ষত থাকে। Package scripts-এ শুধু integration test command ও আগের people seed command merge হয়। Updater নিজে install/migration/seed চালায় না। পুনরায় চালালে একই source-এ no-op। Migration 006 additive: review requests/decisions ও planning prerequisite links যোগ করে, পুরোনো records বা ledger বদলায় না। নতুন updater-এর পরে পুরোনো M3/flow updater চালাবে না।

## Apps Home ও search

App খুললে Apps Home দেখাবে। ১২টি tile existing workspace-এ নিয়ে যায়: Sales, Customers, Merchandising, Purchases, Inventory, Manufacturing, Finance, People, T&A, Approvals, Reports ও Imports। Tile counts, pending review এবং overdue milestones saved data থেকে আসে। Star দিয়ে pin করলে এই browser-এ preference থাকে; এটি business record বা user identity নয়। Overview আগের মতো sidebar-এ আছে।

Header search বা Ctrl+K দিয়ে Global Search খোলো। কমপক্ষে দুই character দিয়ে document code, name, style code, buyer reference বা linked SO number খুঁজতে পারবে। Result থেকে detail সরাসরি খোলে। Type filter ও ২৫-row pagination আছে। Search বর্তমান dataset-এর মধ্যে থাকে। Northwind/UCI কখনো operational results-এর সঙ্গে মেশে না। Stock/cash/journal ledger default search-এ বাদ থাকে; specific type filter দিয়ে সেগুলো খোঁজা যায়। Approval request no. APR-… খুঁজতে Inbox-এর নিজস্ব search ব্যবহার করবে। এটি uploaded CSV contents-এর full-text search নয়।

## Approval Inbox

BOM Draft, Merchandising Draft, PO Draft এবং reviewed payroll review-এর জন্য ready হয়। Payroll-এর attendance ও fixed components আগে review করতে হবে।

1. Source document খুলে Request review চাপো। Note দিয়ে confirm করলে Inbox খুলবে। অথবা Inbox → Request a review থেকে ready document বেছে submit করো।
2. Request number APR-2026-00001-এর মতো হবে। Pending request-এর source, amount, submission note ও source-detail link থাকে।
3. Review & approve-এ source দেখে approve করো। Merchandising-এর তিনটি specification/BOM/date checkbox অবশ্যই confirm করতে হয়। বিদ্যমান domain checks একই transaction-এ চলবে।
4. Return দিলে কারণ বাধ্যতামূলক। এটি clarification-এর জন্য request ফেরত দেয়; source Draft/Reviewed থাকে এবং stock/cash posting হয় না। Clarification note দিয়ে fresh request submit করা যায়। Source-field revision editor এই release-এ নেই।
5. একই request-এর duplicate decision দ্বিতীয় approval/posting তৈরি করে না। Source বদলে গেলে stale approval block হয়; request return/cancel করে নতুন review করতে হয়।
6. Pending request থাকলে direct approval command bypass করতে পারে না। কোনো request pending না থাকলে legacy direct commands/scripts compatibility-এর জন্য বহাল আছে। UI review-গুলো Inbox দিয়ে চলে।
7. History-তে Approved/Returned/Cancelled records থাকবে। Search, document type, status/date filters, pagination, saved request-state chart এবং filtered CSV আছে। Source detail-এ review history-ও দেখা যায়।

এটি **local review workspace**। Individual authenticated reviewer, roles, amount-based approval hierarchy, delegation ও maker/checker separation এখনো নেই। UI-তেও এই সীমা লেখা আছে। নতুন identity/authorization না আসা পর্যন্ত hosted writes বন্ধই থাকে। Request/decision একটি generated workflow ledger, সরাসরি CSV upload নয়; business source documents বিদ্যমান CSV tools দিয়ে Draft হিসেবে import হয়।

## T&A plan ও calendar

Planning → T&A Calendar → Plan an order চাপো। Confirmed, undelivered SO এবং approved Merchandising sheet লাগবে। Source SO-এর আগের তারিখে plan শুরু করা যাবে না। Plan start ও target shipment-readiness date review করে confirm করলে আটটি Draft milestone তৈরি হবে:

1. Sample approval
2. Fabric booking
3. Fabric arrival
4. Cutting
5. Sewing
6. Finishing
7. Quality inspection
8. Shipment readiness

এগুলো date range-এর মধ্যে ভাগ করা initial plan; capacity/lead-time optimizer নয়। একবার template তৈরি হয়। পরে নতুন template duplicate করার বদলে individual milestone reschedule করবে। SO detail থেকেও Create T&A plan এবং Open order calendar আছে।

Calendar প্রথম milestone-এর month-এ যাবে। Month navigation, SO/status/title filters, due-day selection ও paginated agenda আছে। Overdue mode সব আগের month-এর open overdue tasks-ও দেখায়। একটি scope-এ সর্বোচ্চ ৫০০ milestone calendar-এ দেখানো হয়; বেশি হলে order/search দিয়ে narrow করবে বা Milestone Register ব্যবহার করবে।

Milestone খুলে Start / Complete / Reschedule / Cancel করা যায়। Prerequisite complete হওয়ার আগে পরের milestone start/complete হবে না। Reschedule-এ reason লাগে; original baseline dates অক্ষত থাকে, version বাড়ে, activity-তে আগের/নতুন dates ও কারণ থাকে। অন্য view-এর stale version দিয়ে overwrite করা যায় না। একই dates দিয়ে no-op reschedule reject হয়। Dependent task-এর dates overlap করলে আগে সেই task adjust করতে হবে। Cancel করার আগে dependent tasks cancel করতে হবে। Done/Cancelled task পুনরায় খোলা এই scope-এ নেই।

Completion planned milestone progress; এর মাধ্যমে material issue, QC, delivery, invoice বা cash post হয় না। Actual operational documents আগের workflow দিয়ে আলাদা action-এ post হবে। Responsible team একটি planning label; verified user assignment নয়। Overdue হিসাব Asia/Dhaka calendar date অনুযায়ী হয়।

## T&A CSV ও register

Add milestone form অথবা UTF-8 CSV ব্যবহার করা যায়। Template, whole-file validation, preview, bounded resumable/idempotent import, error download, list/detail, chart ও filtered export বিদ্যমান data tools-এর সঙ্গে যুক্ত। ২ MB / ৫,০০০-row cap বহাল। Imports সবসময় Draft তৈরি করে।

Milestone codes: SAMPLE, FABRIC_BOOKING, FABRIC_ARRIVAL, CUTTING, SEWING, FINISHING, QC, SHIPMENT। Priority: Low / Normal / High। Prerequisite optional; একই SO-এর একটি saved task হতে হবে। Prerequisite আগে import/save করবে—একই file-এর এখনও unsaved row-এর reference preview-তে resolve হয় না। Template-generated plan এই prerequisite chain এক transaction-এ তৈরি করে।

Filtered CSV-তে current planned dates-এর পাশাপাশি baseline start/due, actual start/completion ও version থাকে। Calendar-এ একটি due-day select করলে export-ও সেই দিনের scope নেয়।

## তোমার existing delivered order

পুরোনো dispatch/invoice/payment আবার করবে না। নতুন review/calendar data না থাকলে pending/task count ০ দেখানো সঠিক। এই update fake pending items বা milestones seed করে না।

Feature দেখতে চাইলে একটি **নতুন** SO Draft বানাও: saved buyer, finished item, quantity ও rate বেছে save → quotation → confirm। Existing approved BOM ব্যবহার করে নতুন Merchandising sheet বানাও → Request review → Inbox থেকে তিনটি check দিয়ে approve। এরপর নতুন SO-টির T&A plan করতে পারবে। উদাহরণস্বরূপ ৩০ অক্টোবর ২০২৬ শুরু ও ৩০ নভেম্বর target দিলে November calendar-এ milestones আসবে। শুধু plan/review করার কারণে পুরোনো scenario-এর AR/AP/cash figures বদলাবে না।

## Validation ও বাকি scope

Actual checks: docs/VERIFICATION.md। Unit, isolated PostgreSQL-engine integration, build, HTTP এবং নির্দিষ্ট desktop browser interactions পরীক্ষা করা হয়েছে। User-এর Windows DB-তে এই session থেকে connection করা হয়নি।

Multi-component BOM, color/size matrix, partial operations, lot/roll tracking, critical-path scheduling, notifications/email, multi-user approvals, AI brief, System Admin login ও actual Neon/Netlify deployment এখনো পরের scope। Posting-এর আগের one-company/warehouse, one finished style/one fabric, full quantities সীমা বহাল। Selected-event cash movement profit/full garment costing/statutory accounting নয়।
