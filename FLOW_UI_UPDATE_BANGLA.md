> Current update: **ACCESS_AI_UPDATE_BANGLA.md** অনুসরণ করো। নিচের guide আগের checkpoint-এর; login/roles/AI/docs এখন নতুন guide অনুযায়ী চলবে।

> Apps Home/Search/Approval Inbox/T&A-এর নতুন update: WORKSPACE_UPDATE_BANGLA.md। নতুন UI-তে approval-এর জন্য Request review → Inbox ব্যবহার করবে।

# SmartERP — Merchandising, Inventory ও UI update

এটি বর্তমান local project-এর পরের workflow update। আগের Finance/People/UI update-ও এই updater-এ আছে; আলাদা M3 updater পরে চালাবে না। System Admin login ও AI Management Brief এখনো পরের final release-এর কাজ।

## Apply করার নিয়ম

1. Next app-এর terminal-এ Ctrl+C দাও। Database terminal চালু রাখো (`npm run db:local`)।
2. `update-smarterp-flow-ui.mjs` file-টি `E:\smarterp`-এ রাখো। TXT copy নামালে শেষে `.txt` সরাবে; দুটো copy একই code।
3. Project terminal-এ চালাও:

```bash
node update-smarterp-flow-ui.mjs
npm run db:migrate
npm run db:check
npm run dev
```

Node 24 লাগবে। নতুন dependency নেই, তাই সাধারণভাবে npm install বা npm ci লাগবে না। Preview চাইলে প্রথমে `node update-smarterp-flow-ui.mjs --check` চালাতে পারো। অন্য folder হলে `--project "E:\smarterp"` দাও।

Updater শুধু নির্দিষ্ট source/config files বদলাবে। পুরোনো files-এর backup `.smarterp-backups` folder-এ রাখবে। `.env.local`, `.local-db`, datasets, node_modules, Git ও exact package-lock বদলাবে না। একই updater আবার চালালে একই source-এর ওপর no-op। এটি নিজে database command চালায় না। Migration 005 additive; পুরোনো posted records, stock ও activity reset হয় না।

যদি আগের M3 People seed এখনো না চালিয়ে থাকো, app বন্ধ রেখে `npm run db:seed:people` একবার চালাতে পারো। এটি explicit, idempotent attendance/payroll Draft seed; সাধারণ startup/deployment-এ seed চলে না।

## কী বদলেছে

- SO-এর পরে Merchandising order sheet: style code/name, fabric specification, buyer reference, target delivery date, approved BOM ও production notes। তিনটি review checkbox confirm করার পর Approved handover হয়।
- Material check refresh করা যায়। Physical, QC held, reserved, own reservation, approved inbound, issued material ও remaining shortage আলাদা বিবেচিত হয়।
- Work Order তৈরি ও fabric reservation একই DB transaction-এ হয়। Imported/manual Draft Work Order-এ আগে Reserve fabric চালাতে হয়। অন্য order reserved fabric নিতে পারে না।
- Unissued Draft/Reserved Work Order cancel করলে reservation release হয়। এরপর SO থেকে replacement Work Order করা যায়। Materials issue হওয়ার পরে cancellation/return এই scope-এ নেই।
- Accepted GRN physical stock বাড়ায়; PO approval বা bill matching stock বাড়ায় না। Material issue reserved ও physical stock একসঙ্গে কমায়। Production QC-held finished stock আনে; QC release available করে; dispatch একবার stock কমায়।
- Current item ledger-এর আগের business date-এ নতুন stock posting block হয়। ফলে নতুন backdated receipt দিয়ে আগের দিনের stock বদলে দেওয়া যাবে না। Original source date/record মুছে বা বদলে দেওয়া হয় না।
- Practical server-generated numbers, searchable record pickers, order journey, action-এর পর নতুন document সরাসরি খোলা, পরের কাজের queue।
- Solid pastel KPI cards, হালকা gradient, পরিষ্কার report panels, নতুন buttons। Draft/Confirmed/Approved/Reserved/QC hold/Part paid/Paid ইত্যাদির একেকটি consistent color আছে। List, chart, detail, report ও import status একই color system ব্যবহার করে।
- Reports → Inventory Availability: as-of Physical / QC held / Reserved / Available, item search, pagination ও filtered CSV। kg ও pieces কখনো যোগ করে একটি stock total বানানো হয় না।

## Naming convention

| Record | নতুন number-এর উদাহরণ |
| --- | --- |
| Sales order | SO-2026-00001 |
| Merchandising sheet | MER-2026-00001 |
| Purchase order / accepted receipt | PO-2026-00001 / GRN-2026-00001 |
| Work order / delivery note | WO-2026-00001 / DN-2026-00001 |
| Customer invoice / supplier bill | INV-2026-00001 / BILL-2026-00001 |
| Customer receipt / supplier voucher / salary payment | RCV-2026-00001 / SPV-2026-00001 / SAL-2026-00001 |
| Stock entry / cash entry / journal / payslip | STK-2026-00001 / CSH-2026-00001 / JRN-2026-00001 / PSL-2026-00001 |

Company + dataset + series + year অনুযায়ী sequence চলে। Internal UUID আলাদা। নতুন form-এ Document no. blank রাখলে server number দেয়; retry একই request-এর দ্বিতীয় document বানায় না। চাইলে নিজের external code দিতে পারো। CSV-তে stable external_id বাধ্যতামূলক, যাতে import/resume idempotent থাকে। পুরোনো SO-DEMO-001/OPEN-DEMO-001 ইত্যাদি পুনরায় number দেওয়া হয় না—references ও history অক্ষত থাকে।

## নতুন order-এর smooth flow

1. Items/customer/supplier saved থাকতে হবে; finished item-এর একটি approved one-level fabric BOM লাগবে। Existing fabric থাকলে Opening Stock একবার post করবে।
2. Sales → inquiry Draft → Create quotation → Confirm sales order।
3. SO → Prepare merchandising sheet। Style ও fabric specification লিখে target delivery date দাও। নতুন sheet সরাসরি খুলবে।
4. Sheet → Approve production handover → তিনটি check review করে confirm। SO আবার খুলবে।
5. SO → Recheck BOM & stock। Shortage থাকলে Create shortage purchase order; supplier code/name search করে price দাও। নতুন PO সরাসরি খুলবে।
6. PO approve → Create goods receipt → Accept full goods receipt। Receipt-এর Continue to supplier bill button দিয়ে PO-তে ফিরে supplier bill তৈরি ও match করবে। Bill posting Finance-এ আলাদা action।
7. Order journey থেকে SO খোলো → Recheck BOM & stock → Create & reserve work order। Reserved stock অন্য order-এর available stock থেকে বাদ পড়ে।
8. WO → Issue reserved fabric → Record full production → Pass QC & release stock। QC hold থাকলে release-এর আগে delivery হবে না।
9. Create delivery note → Dispatch full delivery → Open/create customer invoice → Post invoice।
10. Create receipt/payment → সঠিক actual amount দিয়ে save → নতুন payment draft খুলবে → Post allocated payment। Partial customer/supplier payments আলাদা payment documents-এ করা যায়।

Order journey-এর saved step-এ click করে SO, Merchandising, PO, production, delivery ও invoice-এ যাও। Related documents-এ supplier bill/receipt/masters থাকবে। একই delivered order থেকে SO বা delivery দিয়ে invoice খোলার চেষ্টা করলে existing invoice ফেরত আসে।

## তোমার আগের completed order

তুমি delivery dispatch পর্যন্ত করেছ—সেই কাজ আবার করবে না। এই update পুরোনো Delivered order-এ কৃত্রিম Merchandising approval যোগ করে না। Order journey-তে পুরোনো order-এর sheet না থাকলে সেটি স্পষ্ট দেখাবে। Delivered order থেকে invoice → receipt ও Finance/People flow চালিয়ে যাবে। Confirmed/in-progress order-এর এখনও material planning/reservation/issue বাকি থাকলে আগে Merchandising sheet review করো। পুরোনো Draft WO হলে Reserve fabric দিয়ে এগোবে। Already-issued/produced/QC/delivered records বর্তমান valid status থেকে চলবে।

People-এর আগের flow বহাল: attendance review → fixed salary components review → payroll approval → Finance salary payment → paid payslip। Login/presenter unlock এই local update-এ নেই; hosted writes Admin auth না হওয়া পর্যন্ত বন্ধ।

## নির্দিষ্ট সংখ্যাগুলো

10,000 × 0.22 = 2,200 kg fabric। Opening 1,400 + accepted purchase 800 − material issue 2,200 = 0 kg। Production 10,000 pieces প্রথমে QC hold-এ থাকে; full dispatch-এর পর finished stock 0 pieces। Reservation physical receipt/consumption নয়, তাই physical total দ্বিগুণ হয় না।

Invoice BDT 4,500,000; receipt 2,000,000; supplier payment 400,000; salary 29,000 হলে final AR 2,500,000, AP 0, salary payable 0, selected-event net cash movement 1,571,000। এটি profit, bank balance, full garment costing বা statutory accounting নয়।

## Scope / limitations

এক company, এক warehouse, এক finished style ও এক fabric component-এর BOM; full GRN, production, QC release ও delivery। Accessories, color/size matrix, batch/lot/bin, fabric wastage, rejected/partial quantities, subcontracting, T&A calendar, revisions, returns ও full costing এখনো নেই। Merchandising review এই সীমার মধ্যে বাস্তব persistent handover; পূর্ণ merchandising suite নয়। CSV বহু-line Draft রাখতে পারে; এই posting flow বহু-line document post করে না। Inventory report closing quantities as-of To; item-master names/reorder levels current values।

AI brief, System Admin authentication, real-data release controls ও actual Neon/Netlify staging/main deployment বাকি। কোনো live deployment বা enterprise certification দাবি করা হয়নি। Actual checks ও limits: docs/VERIFICATION.md।
