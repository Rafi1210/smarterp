# SmartERP — record management, buyer quality, charts ও pastel UI

এই update আপনার `staging` commit `ceb38088e6de26814c00a1125e223950f43f9b8d`-এর পরের কাজ। নতুন dataset generation বা production-hardening package এতে নেই। একই dependency/lockfile ব্যবহার করে; নতুন plugin/package install লাগে না। Updater আপনার Windows project-এ source files বসায়; নিজে Git push, DB migration, seed, account reset বা deploy করে না।

## 1. Update apply

চলমান `npm run dev` বন্ধ করুন। TXT file `E:\smarterp`-এ রাখুন। Git Bash terminal-এ:

```bash
cd /e/smarterp
cp update-smarterp-usability.mjs.txt update-smarterp-usability.mjs
node update-smarterp-usability.mjs --check
node update-smarterp-usability.mjs
```

Node 24 ব্যবহার করুন। `--check` কিছু লেখে না। সব target file পরিচিত পুরোনো/নতুন version কি না যাচাই করেই apply হবে; অচেনা local edits বা symlink পেলে থামবে। আগের source files `.smarterp-backups`-এ রাখে; আবার চালালে no-op। Custom npm scripts রাখে। `.env*`, `.local-db`, Git metadata, source datasets, AI allowance এবং package-lock বদলায় না।

## 2. একবার explicit migration

আগে তৈরি করা staging profile ব্যবহার করুন:

```bash
npm run profile -- staging db:migrate
npm run profile -- staging deploy:check
```

নতুন migration `008_payment_reversals.cjs` শুধু correction-voucher table ও তার scoped constraints/indexes যোগ করে। Existing table/constraint drop, business-record reset, reseed বা password reset নেই। `pendingMigrations: 0` ও `ready: true` হলে GitHub-এ পাঠান। **Migration আগে করুন**: Netlify build নিজে migration চালায় না এবং pending schema থাকলে deployment আটকে দেবে।

Local DB-তেও এই source চালালে, `npm run db:local` আলাদা terminal-এ রেখে local profile-এ একবার `npm run db:migrate`, তারপর `npm run dev`। Local ও staging DB আলাদা; একটিতে migrate করলে অন্যটি migrate হয় না। Existing `.env.local` বদলাতে হবে না। Seed/auth setup পুনরায় চালাবেন না।

## 3. GitHub ও Netlify staging

```bash
git branch --show-current
git add .
npm run repo:check
git commit -m "Add safe record management, buyer checks and analytics"
git push origin staging
```

Branch output `staging` হওয়া প্রয়োজন। Check fail করলে commit/push না করে উল্লিখিত সমস্যা ঠিক করুন। GitHub CI এবং Netlify deploy দুটো সফল হলে `https://demo-smarterp.netlify.app`-এ নতুন commit পরীক্ষা করুন। এই updater তৈরি হওয়ার সময় নতুন changes hosted staging/main-এ deploy করা হয়নি; আগের live app এই update-এর acceptance evidence নয়।

## ব্যবহার

### Draft delete, archive ও restore

- Record খুলে **Summary → Manage this record**। Reason ও exact document code দিয়ে **Delete draft**, **Archive record** বা উপলব্ধ **Cancel document** করুন। Open linked documents, pending approval বা ledger postings থাকলে server থামাবে।
- Delete হল audit-preserving soft delete: number/ID, original content, links ও history থাকে; active list থেকে সরায়। Register-এর **Record visibility → Deleted drafts** থেকে খুলে **Restore draft**। Archived masters একইভাবে **Archived records → Restore record**। Restore-এ পুরোনো ID/code ফেরে; inactive source বা replacement milestone থাকলে আগে সমাধান করতে হবে।
- Buyer, supplier, item, employee ও BOM archive করা যায়। Nonzero physical/reserved/QC-held stock থাকা item archive হয় না। Existing document history থাকে; নতুন documents-এ inactive master নির্বাচন করা যায় না।
- **Work Order-এ Delete নয়, আগে থেকেই থাকা Cancel unissued work order / Cancel & release reservation ব্যবহার করুন।** শুধু Draft/Reserved অবস্থায় চলে; material issue-এর পরে নয়। Existing DB uniqueness এবং stock release একই transaction-এ থাকে।
- SO/PO/Merchandising/attendance/payroll-এর উপলব্ধ unposted state-এ cancel করা যায়। Pending review হলে আগে Inbox-এ return/cancel করতে হবে। Cancelled document সরাসরি reopen করা হয় না।
- Source action দিয়ে বানানো Draft delete করে একই Create action আবার চাপলে idempotency-র কারণে সেই মূল document খুলতে পারে। সেটির **Restore draft** ব্যবহার করুন; একই posting event দিয়ে নতুন number তৈরি হয় না।

### Payment correction

Admin/Finance: posted customer receipt, supplier payment বা salary payment খুলে **Manage this record → Reverse payment**। Original payment date-এর আগে বা ভবিষ্যতের তারিখে reversal হয় না। Reason/code confirmation লাগে। এটি bank transfer করে না; saved correction voucher তৈরি করে।

Original cash entry/allocation মুছে বা সম্পাদনা করে না। আলাদা `REV-YYYY-NNNNN` contra voucher, balanced journal ও activity লেখে; payable/receivable allocation ফেরত দেয়। Salary reversal হলে original payslip **Reversed**, payroll আবার **Approved**; সংশোধিত full payment-এ নতুন Paid payslip হয়। Repeated identical reversal no-op; দ্বিতীয় আলাদা reversal হয় না। আগের তারিখের report original payment দেখায়; reversal-date থেকে correction যোগ হয়।

**Posted invoice, supplier bill, GRN, stock issue/production/delivery reversal এই update-এ নেই।** তাদের মূল posting delete করা যায় না। Returned-goods accounting বা full credit-note flow-এর দাবি নেই।

### Buyer নির্বাচন

Buyer code খালি রাখলে server `CUS-YYYY-NNNNN` দেয়। Order form-এ saved buyer-কে name/code দিয়ে search করে result **select** করুন; শুধু text লিখলে reference save হয় না। Name/code/country/contact দেখা যায়; একই buyer-এর সব order সেই code-এ যুক্ত থাকে।

Normalized company name, email, phone বা registration reference মিললে possible-duplicate warning ও existing buyer খোলার option থাকে। আলাদা legal buyer হলে explicit confirmation/reason দিয়ে save করা যায়; matched codes audit-এ থাকে। CSV preview-তে DB ও file-এর ভিতরের possible duplicates warning হয়। এটি identity verification/automatic merge নয়; shared contact থাকতেই পারে। Exact source-ID retry ও changed-content safeguards বজায় থাকে।

### Dashboard, filters ও downloads

Operations Overview-তে saved data থেকে 7 panels; Finance/Admin আরও AR aging ও cash movement দেখে। Order-value trend, top buyers, sales stages, production, stock, Merchandising এবং T&A progress আছে। Empty data হলে empty state দেখায়, synthetic chart points যোগ করে না।

Period/from/to, buyer ও sales-stage filter; buyer/stage bars এবং cards থেকে matching records খোলা যায়। Child-module drill-down-এ order-date scope দেখায়। Filtered dashboard CSV-তে aggregates, scope, stock ও chart series থাকে। Monetary exports paisa-তে labelled exact amounts; stock kg/pieces-এ, একত্রে যোগ হয় না।

Order value confirmed/delivered orders-এর value; revenue/profit নয়। Pipeline/production/T&A দেখায় selected order cohort-এর **current status**, historical status reconstruction নয়। Stock warehouse-wide; শুধু To closing stock বদলায়, buyer filter দিয়ে fabric ভাগ করে না। AR as-of To, পুরোনো unpaid invoices-সহ; cash selected posting dates। Buyer/stage-scoped cash-এ linked customer/supplier payments, payroll শুধু All buyers/All stages-এ। Trend সর্বোচ্চ 24 occupied month; KPI total সম্পূর্ণ selected period-এর।

Theme-এ light mint/sky/lavender/peach background, pale cards/buttons ও semantic status colors। Existing three-role login ও AI behaviour অপরিবর্তিত। Dataset selector আগের namespace-গুলিই দেখায়।

## Evidence ও সীমা

এই delivery-এর actual local checks `docs/VERIFICATION.md`-এর প্রথম section-এ। Test DB disposable PostgreSQL-engine fixture; আপনার E: drive/Neon data-তে business actions চালানো হয়নি। Browser visual acceptance এখানে সম্পন্ন হয়নি: preview browser workspace server-এ পৌঁছাতে পারেনি। তাই apply/deploy-এর পরে desktop/mobile appearance ও filter interaction নিজে পরীক্ষা করুন।

বড় dataset pack, measured load/scaling result, multi-company/warehouse, multi-component BOM, partial stock operations, invoice/stock reversals বা production security release যোগ হয়নি। এক company/HQ warehouse ও আগের full-quantity garment scope বজায় আছে; production/enterprise certification দাবি নেই।
