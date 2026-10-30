> Current update: **ACCESS_AI_UPDATE_BANGLA.md** অনুসরণ করো। নিচের guide আগের checkpoint-এর; login/roles/AI/docs এখন নতুন guide অনুযায়ী চলবে।

# SmartERP — UI + Finance + People update

এই update আগের সম্পন্ন order-to-delivery workflow-এর ওপর কাজ করবে। তোমার Windows project: `E:\smarterp`। ZIP লাগবে না।

## Update লাগানো

1. `npm run dev` terminal-এ Ctrl+C দিয়ে app বন্ধ করো। Local database terminal চালু থাকতে পারে।
2. `update-smarterp-m3.mjs` file-টি `E:\smarterp`-এ রাখো।
3. Project terminal-এ চালাও:

```bash
node update-smarterp-m3.mjs
```

Script শুধু নির্দিষ্ট source/config/test/docs files বদলাবে। আগে `E:\smarterp\.smarterp-backups\...`-এ পরিবর্তিত পুরোনো files ও manifest রাখবে। `.env.local`, `.local-db`, `node_modules`, `.git`, original source datasets ও lockfile বদলাবে না। Package scripts-এ শুধু `db:seed:people` যোগ হবে; নতুন dependency নেই। Apply ব্যর্থ হলে ইতিমধ্যে বদলানো files আগের অবস্থায় ফেরানোর চেষ্টা করবে। আবার চালালে একই update duplicate হবে না। Script কোনো database command নিজে চালায় না।

4. Database ready থাকলে চালাও:

```bash
npm run db:migrate
npm run db:seed:people
npm run dev
```

Migration `004_finance_people.cjs` নতুন finance tables যোগ করে; পুরোনো stock/order data reset করে না। People seed শুধু attendance/payroll Draft তৈরি করে। আগের sales/production seeds আবার চালাতে হবে না।

## UI / access

Gradient background, colorful KPI cards, new Finance/People submenu ও financial snapshot report যোগ হয়েছে। Demo/interview badges ও presenter lock/unlock controls সরেছে। এই local stage-এ unlock code লাগে না। পুরোনো `DEMO_WRITE_CODE`/`DEMO_SESSION_SECRET` values আর ব্যবহার হয় না; `.env.local` থেকে চাইলে পরে সরাতে পারো।

System Admin login শেষ milestone-এ হবে। এখন local development/test-এর mutations allowed; hosted staging/production mutations বন্ধ থাকবে যতক্ষণ individual authentication/authorization যোগ না হয়। APP_URL browser origin-এর সঙ্গে মিলতে হবে (যেমন http://localhost:3000)। অন্য origin-এর write requests reject হবে।

## ইতিমধ্যে delivered order থেকে Finance

1. Sales → Delivered order অথবা Dispatched delivery খুলে **Create customer invoice**।
2. Related invoice খুলে **Post customer invoice**: AR ৳45,00,000, cash এখনো 0।
3. ওই invoice-এ **Create receipt / payment** চাপো। Customer receipt amount **2000000** দাও। ID রাখতে পারো; চাইলে নিজের reference দাও। Confirm করলে শুধু payment Draft হবে।
4. Related payment খুলে **Post allocated payment**: AR ৳25,00,000, collection ৳20,00,000।
5. Purchases/Finance → আগের Matched supplier bill খুলে **Post supplier bill**: AP ৳4,00,000।
6. Bill → **Create receipt / payment**: amount **400000** → related payment → **Post allocated payment**: AP 0।

একই posting আবার submit হলে replay হবে; দ্বিতীয়বার cash বদলাবে না। Outstanding-এর বেশি payment reject হবে। একই payment type-এ একই nonempty bank/cash reference দুবার post হবে না। Customer/supplier partial payments একাধিক আলাদা Draft payment দিয়ে করা যায়; প্রতিটি payment একটি target-এ পুরো allocate হয়। এক payment থেকে একাধিক invoice allocation এই scope-এ নেই।

## People → Payroll → paid payslip

People seed-এর fixed components: Basic 25,000 + Allowance 4,000 + Extra 1,000 − Deduction 1,000 = Net 29,000।

1. People / Payroll → Attendance → ATT-DEMO-001 → **Review attendance**।
2. Payroll Runs → PAYROLL-DEMO-001 → **Review salary components**। Reviewed attendance link ATT-DEMO-001 থাকবে।
3. **Approve payroll**: salary payable ৳29,000; cash এখনো বদলায় না।
4. **Create salary payment** → amount 29000 → related payment → **Post allocated payment**।
5. Paid Payslips-এ paid record পাবে। **Print payslip** দিয়ে print বা Save as PDF করতে পারো।

নিজে নতুন attendance summary ও payroll Draft form/CSV দিয়েও তৈরি করতে পারবে। Present + paid leave scheduled days ছাড়াতে পারবে না। Payroll attendance days reviewed summary-র সঙ্গে মিলবে। একই employee/period-এ দ্বিতীয় payroll approve হবে না। Salary payment পূর্ণ approved net amount একবারে settle করে; partial salary এই scope-এ নেই। Tax, overtime formula, benefits বা statutory payroll calculator নেই—components নিজের review করা fixed inputs।

## হিসাব মিলাও

Overview ও Reports → Financial Snapshot-এ নিচের selected-event totals মিলবে:

| হিসাব | BDT |
| --- | ---: |
| Posted customer invoice | 4,500,000 |
| Customer collection | 2,000,000 |
| Supplier payment | 400,000 |
| Salary payment | 29,000 |
| Outstanding AR | 2,500,000 |
| Outstanding AP | 0 |
| Outstanding salary | 0 |
| Net cash movement | 1,571,000 |

Net cash movement = 2,000,000 − 400,000 − 29,000। এটি profit বা bank balance নয়। Selected-event ledger-এ প্রতিটি invoice/bill/payroll approval/payment-এর debit ও credit সমান থাকবে; পূর্ণ statutory accounting বা garments costing নয়।

Cashbook, Receipts & Payments, Attendance, Payroll Runs-এ saved list/detail/filters/charts/exports আছে। Payment/attendance/payroll CSV import Draft তৈরি করে, কখনো posting করে না। Cashbook/journal/payslip action-generated ledger, সরাসরি CSV upload হয় না। Reports-এর From তারিখ cash/issued-sales period filter করে; AR/AP/Salary balances To date অনুযায়ী as-of balances। Data source dates timezone shift ছাড়াই calendar date থাকে।

## পরের milestone

On-demand AI Management Brief, System Admin login/roles, remaining release checks এবং Netlify/Neon deployment বাকি। এই updater account তৈরি, live deploy বা paid AI call করে না।
