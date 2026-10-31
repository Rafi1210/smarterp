# SmartERP: clearer charts, Import Studio and Order Control

এই update বর্তমান public staging source `9b536a5`-এর ওপর তৈরি। Existing records, passwords, environment files বা source datasets বদলায় না। নতুন dependency নেই; `package-lock.json` অপরিবর্তিত।

## কী বদলেছে

- Overview, business reports, Finance এবং register charts-এ consistent tooltip, readable axis, অর্থের unit, shorter date labels এবং softer palette। Filter বদলালে animation-এর মাঝখানে ভুল আকার দেখানোর পরিবর্তে সম্পূর্ণ chart সরাসরি আঁকে। Data source ও হিসাব আগের saved records-ই।
- KPI (Key Performance Indicator) cards-এ আলাদা faded gradients, বড় values, পরিষ্কার labels। Status badges-এর semantic colours আগের মতো একই থাকে।
- Import Studio: Upload → Mapping → Review → Import। Drag/drop বা file picker, source sample, required mapping count, optional fields, whole-file error/warning review, progress, saved batches এবং saved-record link।
- Excel workbook সরাসরি নয়: Save As → CSV UTF-8 (.csv)। CSV (Comma-Separated Values)-এর আগের 2 MB / 5,000-row cap ও whole-document atomicity অক্ষত।
- Errors/Warnings tab পুরো saved batch থেকে server-side filter করে; শুধু প্রথম preview page নয়। Saved history-ও নির্বাচিত register ও namespace-এর।
- একই source content আবার দিলে skip; changed content দিয়ে পুরোনো code overwrite নয়। Warnings থাকলে UI-তে review acknowledgement লাগে। Pause-এর পরে reload করে saved batch থেকে resume করা যায়।
- Mobile-এ collapsible navigation; current document/modal-এর flow বজায় থাকে।

## নতুন business feature: Order Control

Sidebar বা Apps Home → Order Control; Overview থেকেও সরাসরি খোলা যায়।

এক order-এর source chain মিলিয়ে দেখায়:

1. কোন current stage-এ আছে এবং কোন saved document খুলতে হবে।
2. পরের responsible role: Operations, System Admin অথবা Finance। Purchase review-তে Admin / Finance দুজনের permission বিবেচনা করে।
3. Pending review, missing merchandising, fabric shortage, incoming goods, unmatched supplier bill, quality hold ও late delivery target-এর আলাদা কারণ।
4. Current fabric requirement, shared availability, নিজের reservation, approved incoming এবং uncovered shortage। এটি নতুন reservation নয়।
5. Operations-এ delivered order-এর Finance handoff; customer invoice/receipt balance লুকানো থাকে। Finance/Admin আসল posted obligation ও net allocations দেখে; reversal-এর পরে outstanding পুনরায় দেখা যায়।
6. Buyer, order dates, search, stage, role ও attention filter; paginated queue; role-safe filtered CSV export।

Cohort cards/stage counts শুধু buyer/date/search-এর matching orders বোঝায়। Attention/role/stage queue-কে narrow করে। Date filter source order-এর; current states ও stock দেখানো হয়, historical replay নয়। Delivery target না থাকলে “Not set”; healthy বা on-time ধরে নেয় না।

Supplier bill **matching** material issue-এর gate; supplier payment production-এর gate নয়। Payroll আলাদা Finance flow। Order value profit বা collected cash নয়।

## Production-এর জন্য এই release-এ করা কাজ

- এক read-only, repeatable-read database snapshot-এ related facts; report নিজে কোনো posting করে না।
- Set-based linked lookups; additive migration `009_order_lookup_indexes.cjs`। কোনো reset/reseed নয়।
- প্রতি request-এ সর্বোচ্চ 1,000 matching orders এবং bounded linked records। বেশি হলে পরিষ্কার error দিয়ে buyer/date/search narrow করতে বলে; silently বাদ দেয় না।
- Server-side role/namespace checks এবং spreadsheet formula-safe export।
- Invalid import mapping, malformed form এবং invalid batch identifier-এর জন্য readable 400 response; generic database error নয়।
- Tests-এ source-event replay, immutable payment reversal ও ledger integrity-এর existing checks বজায় আছে।

## Windows-এ প্রয়োগ

চলমান `npm run dev` বন্ধ করুন। Updater file `E:\smarterp`-এ রাখুন। Download-এর নামের শেষে `.txt` থাকলে শুধু শেষের `.txt` বাদ দিন, যাতে নাম হয় `update-smarterp-experience.mjs`।

Git Bash / terminal, `E:\smarterp`-এর ভেতর:

```sh
node update-smarterp-experience.mjs --dry-run
node update-smarterp-experience.mjs
```

Updater আগে সব file-এর expected content মিলিয়ে দেখে। Conflict হলে কোনো file বদলাবে না; locally edited file overwrite করার force option নেই। Changed source-এর backup `.smarterp-backups/experience-*`-এ থাকে। একই updater আবার চালালে already-updated files skip হয়।

Local database ব্যবহার করলে:

```sh
npm run db:migrate
npm run dev
```

Migration চলার সময় যে environment ব্যবহার করছেন, তার database URL-ই ব্যবহার হবে। আগের local setup পরিবর্তন করবেন না।

## Staging-এ পাঠানো

নিজের existing `.env.staging.local` ব্যবহার করুন; কোনো password বা connection string chat/repo-তে দেবেন না। Staging branch-এ:

```sh
npm test
npm run test:integration
npm run build
npm run profile -- staging db:migrate
npm run profile -- staging deploy:check
```

সব সফল হলে নিজের reviewed changes commit/push করুন:

```sh
git add package.json src scripts/verify-http.mjs tests/order-control.test.mjs db/migrations/009_order_lookup_indexes.cjs EXPERIENCE_UPDATE_BANGLA.md docs/EXPERIENCE_VERIFICATION.md
git commit -m "Improve analytics and imports; add Order Control"
git push origin staging
```

আগের data seed/reset, `auth:setup` বা AI key পরিবর্তন লাগবে না। GitHub CI (Continuous Integration) ও Netlify সফল হওয়ার পরে নিচের live check করুন।

## Live acceptance: তিন role

- Operations: Order Control → নিজের focus order → blocker/next document; customer invoice balance দেখা যাবে না।
- Operations: ছোট valid CSV → mapping → errors 0 → commit। Saved record Draft থাকবে। একই file আবার preview দিলে existing-source warnings; acknowledge করলে skipped হবে।
- Operations: saved partially imported batch খুলে resume; নতুন duplicate document নয়।
- Admin: pending-review card থেকে source/Approval Inbox খুলে নিজের submitted request নিজে approve না হওয়ার rule মিলিয়ে দেখুন।
- Finance: delivered focus order-এর customer invoice balance ও source link মিলান; Collection Priority-র balance-এর সঙ্গে তুলনা করুন।
- Overview/Reports: tooltip, date/buyer scope, export ও mobile navigation যাচাই করুন। Company totals পুরোনো records-ও ধরবে।

## সীমা

এই update-এ individual enterprise identity, multi-warehouse, partial operations, lot tracking, full costing, invoice/stock reversal বা backup recovery drill যোগ হয়নি। End-to-end production certification, measured concurrent load test বা independent penetration test-এর দাবি করা হচ্ছে না। Live release acceptance আপনার staging deployment-এর পরে করতে হবে।

Source restore দরকার হলে updater-এর output-এ দেওয়া backup folder name ব্যবহার করুন:

```sh
node update-smarterp-experience.mjs --restore experience-YOUR-BACKUP-ID
```

এটি source files ফেরায়। Database records undo করে না এবং additive migration file রেখে দেয়, যাতে applied migration history ভেঙে না যায়। Update-এর পরে কোনো source নিজে edit করলে restore সেটি overwrite না করে থামবে।
