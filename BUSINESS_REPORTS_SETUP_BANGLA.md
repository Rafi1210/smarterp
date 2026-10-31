# SmartERP — Business Analysis Reports ও upload-to-payment training pack

এই update public staging source `2dcec05fe6ef5935943b8cc9705cbc6232843f2f`-এর পরের কাজ। Existing usability/identity/AI update আগে থেকে আছে। নতুন reports হলো read-only Sales & Buyer Health এবং Collection Priority। নতুন package, env variable, migration, DB reset, account reset বা paid AI call নেই। Existing migration 008 প্রয়োজন; আগের usability update-এর staging preflight সফল হয়ে থাকলে সেটি ইতিমধ্যে আছে।

## Apply ও staging push

চলমান dev server বন্ধ করুন। TXT file E:\smarterp-এ রেখে Git Bash-এ:

```bash
cd /e/smarterp
cp update-smarterp-business-reports.mjs.txt update-smarterp-business-reports.mjs
node update-smarterp-business-reports.mjs --check
node update-smarterp-business-reports.mjs
npm run verify:quick
```

Updater source ও CSV files বসায়; DB/Git/network/install/deploy command চালায় না। Source backup রাখে; unknown custom edit/symlink পেলে পুরো preflight থামে। Repeat apply no-op। Package scripts merge করে custom scripts রাখে; exact dependency lockfile অক্ষত। Existing `.gitattributes` lines রেখে শুধু `/data/business-pack/** -text` যোগ করে, যাতে Windows/Linux-এ source byte hashes মেলে। Original `/data/source/** -text` ও 17-file manifest অক্ষত।

Local app দেখলে `npm run dev`। নতুন DB schema দরকার নেই; ordinary startup-এ seed/migration/auth setup চালাবেন না। Staging-এ:

```bash
npm run profile -- staging deploy:check
git branch --show-current
git add .
npm run repo:check
git commit -m "Add business analysis reports and verified CSV workflow pack"
git push origin staging
```

Branch `staging`, preflight/check pass হওয়া প্রয়োজন। GitHub CI/Netlify সফল হওয়ার পরে live app-এ নতুন commit যাচাই করুন। এই delivery প্রস্তুতের সময় নতুন report/data pack hosted staging/main-এ deploy করা হয়নি। Existing Netlify `SECRETS_SCAN_OMIT_KEYS`-এ public config keys `APP_ENV`, `APP_MODE` এবং `APP_URL` থাকার আগের fix বহাল রাখুন; DB/API credentials তার মধ্যে যোগ করবেন না।

## কোথায় কী দেখবেন

- **Reports → Sales & Buyer Health**: Operations, Finance ও Admin। Confirmed/delivered order value, equal-length previous-period change, buyer dependency, repeat/retained/new/inactive buyers, average/median/P90, Pareto, buyer share, histogram, monthly buyer heatmap ও paginated follow-up/source-order register।
- **Reports → Collection Priority**: Finance/Admin। Posted AR balance, overdue/next-seven-days amounts, aging, balance-versus-days-overdue scatter, buyer outstanding comparison ও paginated invoice follow-up queue। Operations API/CSV থেকেও এই private data পায় না।
- Buyer/date filters; register search/state বা collection segment; filtered aggregate CSV; source document links। Search/state শুধু Sales buyer register/export narrow করে; headline/charts date/buyer scope রাখে। Collection search/segment সব displayed totals/charts/queue narrow করে। Histogram selection শুধু source-order table narrow করে।
- Order value order book, revenue/profit নয়। Zero previous value হলে percentage change unavailable। Repeat buyer মানে period-এর মধ্যে অন্তত দুইটি confirmed/delivered order। Date filters order cohort দেখায়, historical approval-status reconstruction নয়। Collection To-তে net allocations/reversal দিয়ে as-of balance হয়; due date cash forecast নয়। Findings গণনাভিত্তিক, AI নয়; buyer-কে contact বা records mutate করে না।

## Dataset: 11 CSV, 66 rows

Folder: **E:\smarterp\data\business-pack**। Namespace dropdown-এ **Operations**। সব names/contacts synthetic; Northwind/UCI আলাদা। `manifest.json`-এ original date/unit/source attribution/warnings ও প্রতি CSV-এর byte/SHA-256 আছে। `npm run data:verify:business` শুধু verify করে; import/post করে না।

প্রতিটি upload: সঠিক module → Upload CSV → file select → mapping → whole-file preview → errors 0 হলে commit/import। Header keys registry-র সঙ্গে মেলে; default mapping ব্যবহার করা যায়। সব transaction প্রথমে **Draft**। Review ও posting আলাদা। `manifest.json`/README import করবেন না। Files 2 MB/5,000-row cap-এর অনেক নিচে।

| CSV | Module / register | Upload role |
|---|---|---|
| 01-buyers.csv | Sales / CRM → Customers | Operations |
| 02-suppliers.csv | Purchases → Suppliers | Operations |
| 03-items.csv | Inventory → Items & Stock | Operations |
| 04-employees.csv | People / Payroll → Employees | Finance |
| 05-bom.csv | Manufacturing / QC → Bills of Material | Operations |
| 06-opening-stock.csv | Inventory → Opening Stock | Operations |
| 07-focus-sales.csv | Sales / CRM → Inquiries / Quotes / Orders | Operations |
| 08-merchandising.csv | Merchandising → Order Sheets & Handover | Operations, focus SO confirmed এবং BOM approved হওয়ার পরে |
| 09-attendance.csv | People / Payroll → Attendance | Finance |
| 10-payroll.csv | People / Payroll → Payroll Runs | Finance, attendance import-এর পরে |
| 11-sales-pattern-inquiries.csv | Sales / CRM → Inquiries / Quotes / Orders | Operations, optional |

## Role handoff: একটি complete business flow

একই browser-এ Sign out/Sign in করে role বদলাবেন। Accounts আগের `operations@smarterp.local`, `admin@smarterp.local`, `finance@smarterp.local`; নিজের existing private passwords ব্যবহার করুন। কোনো password reset দরকার নেই।

### A. Operations: references, BOM request ও order

1. 01, 02, 03, 05, 06, 07 ক্রমে upload করুন। নতুন CUS/SUP/RM/FG/BOM code-এ আগের completed demo stock মিশবে না।
2. Manufacturing / QC → Bills of Material → **BOM-BA26-TEE-001 → Request review**।
3. Admin-এ login → Approval Inbox → একই BOM request → source যাচাই → **Approved**। নিজের submitted request নিজে approve হয় না।
4. Operations-এ ফিরুন। Inventory → Opening Stock → **OPEN-BA26-001 → Post opening stock**। Fabric physical **1,400 kg** হবে।
5. Sales → **SO-BA26-0001 → Create quotation → Confirm sales order**। Order **10,000 pieces × BDT 450 = BDT 4,500,000**।
6. এবার 08-merchandising.csv upload করুন। **MER-BA26-001 → Request review**। নতুন sheet হাতে/Prepare merchandising দিয়ে আবার বানাবেন না, কারণ CSV-তেই আছে।
7. Admin → Approval Inbox → Merchandising request → style/specification, BOM এবং target-date—তিনটি mandatory check যাচাই করে **Approved**।

### B. Operations ও Admin: shortage purchase

8. Operations → SO-BA26-0001 → **Recheck BOM & stock**। Required **2,200 kg**, opening **1,400 kg**, uncovered shortage **800 kg**।
9. **Create shortage purchase order** → saved supplier **SUP-BA26-001** result select করুন → rate **500**। নতুন generated PO number লিখে রাখুন বা related link অনুসরণ করুন।
10. PO → **Request review**। Admin → Approval Inbox → সেই PO → **Approved**। এখনো physical stock বাড়েনি।
11. Operations → approved PO → **Create goods receipt** → generated GRN খুলুন → **Accept full goods receipt**। Fabric physical **2,200 kg**।
12. Received PO → **Create supplier bill** → generated bill → **Match PO & goods receipt**। Match stock বা cash বদলায় না।

### C. Finance: supplier obligation ও payment

13. Finance → Supplier Bills → একই linked bill → **Post supplier bill**। AP **400,000** হবে।
14. Bill → **Create receipt / payment** → amount **400000**, reference **BA26-SUPPLIER-PAYMENT-001** → **Save payment draft**। নতুন payment খুলে **Post allocated payment**। Bill Paid, এই bill-এর AP **0**; cash out **400,000**।

### D. Operations: production, QC ও dispatch

15. Operations → SO-BA26-0001 → **Recheck BOM & stock** → **Create & reserve work order**। Physical fabric **2,200 kg**, reserved **2,200 kg**, available **0**।
16. Generated WO → **Issue reserved fabric**। Fabric physical/reserved দুটোই **0**। তারপর **Record full production**। Finished physical **10,000 pieces**, QC held **10,000**।
17. **Pass QC & release stock**। QC held **0**, available **10,000 pieces**।
18. **Create delivery note** → generated delivery → **Dispatch full delivery**। Finished physical **0**, SO/WO Delivered।
19. Optional T&A: production শুরুর আগে SO থেকে Create T&A plan করা যায়। Milestone completion stock/payment post করে না; focused financial flow শেষ করতে calendar completion বাধ্যতামূলক নয়।

### E. Finance: customer invoice ও partial receipt

20. Finance → focus SO বা related delivery → **Open / create customer invoice** → generated INV → **Post customer invoice**। Principal **4,500,000**।
21. Invoice → **Create receipt / payment** → amount **2000000**, reference **BA26-CUSTOMER-RECEIPT-001** → Save payment draft → payment → **Post allocated payment**। Invoice PartPaid, remaining **2,500,000**।
22. Reports → Collection Priority → buyer **CUS-BA26-001** select করুন। এই pack-এর AR **2,500,000** দেখাবে। Invoice default due date issue date +30 days; প্রথম দিন overdue **0** হওয়া সঠিক। Queue/point খুলে source invoice, paid allocation ও related receipt দেখুন।

### F. Finance, Admin, Finance: payroll থেকে paid payslip

23. Finance → 04-employees.csv upload, তারপর 09-attendance.csv ও 10-payroll.csv। **ATT-BA26-001 → Review attendance**। Present 25 + paid leave 1 = 26 reviewed paid days।
24. **PAY-BA26-001 → Review salary components**। Saved attendance ATT-BA26-001 select করুন। Basic 25,000 + allowance 4,000 + extra 1,000 − deduction 1,000 = net **29,000**। CSV-তে payroll আছে, তাই attendance থেকে Create payroll draft আবার নয়।
25. Payroll Reviewed → **Request review**। Admin → Approval Inbox → payroll → **Approved**। এই employee/period-এর salary payable **29,000**।
26. Finance → payroll Approved → **Create salary payment** → amount **29000**, reference **BA26-SALARY-PAYMENT-001** → Save → payment → **Post allocated payment**। Payroll Paid, salary payable **0**, linked **Paid payslip**।

Payment/delivery/invoice UI form বর্তমান business date ব্যবহার করে; pack-এর পুরোনো inquiry date payment form-এ বসাবেন না। Generated document codes environment-এর sequence অনুযায়ী আলাদা হবে; fixed focus SO এবং Related documents দিয়ে সঠিক chain ধরুন।

## Optional: buyer pattern exercise

Operations → 11-sales-pattern-inquiries.csv upload। সব 48 records Draft। শুধু upload করলে confirmed charts-এ 48 orders বা revenue দেখাবে না; report unconfirmed demand আলাদা জানায়।

সংক্ষিপ্ত comparison-এর জন্য **SO-BA26-P041 থেকে P048**—আটটি record-এর প্রতিটিতে Create quotation, তারপর Confirm sales order করুন। এই context orders-এর manufacturing/payment এই exercise-এর অংশ নয়। Main focus order confirmed/delivered থাকতে হবে।

Sales & Buyer Health: **From 2026-10-01, To 2026-10-31**, All buyers। Expected current: **5 orders, BDT 7,642,500**। Previous equal-length period **2026-08-31–2026-09-30**: **4 orders, BDT 3,920,000**। Repeat buyer **1 of 3**, two previous buyers inactive, Brookline has lower value। Median **570,000**, P90 **4,500,000**। Histogram bar → source orders; buyer follow-up → linked orders; heatmap cell → buyer/month scope।

এগুলো ছোট synthetic sample-এর হিসাব। Pattern chart recurring seasonality বা default risk প্রমাণ করে না। Paid receipt ছাড়া collection invent হয় না; missing actual supplier/delivery/cost data থেকে lead-time, margin বা defect report বানানো হয়নি। Delivery-risk/costing/multi-component/partial/lot/security-hardening release এতে নেই।

## Expected focused result ও preservation

| Metric | Focused flow |
|---|---:|
| Customer invoice | BDT 4,500,000 |
| Allocated customer receipt | BDT 2,000,000 |
| Remaining buyer AR | BDT 2,500,000 |
| Supplier bill / payment | BDT 400,000 / 400,000 |
| This supplier bill's AP | 0 |
| Net salary payment / remaining payable | BDT 29,000 / 0 |
| New fabric / finished physical stock | 0 kg / 0 pieces |
| Selected-event net cash movement | BDT 1,571,000 |

আগের posted demo/customer/payroll থাকলে overall company totals আলাদা হবে। Buyer/source/employee/code filter বা আগে-পরে delta দিয়ে এই flow মেলান। আগের balances reset করবেন না। Net cash movement profit, full costing, opening-bank balance বা statutory accounting নয়। Same source IDs replay skip হয়; অন্য content দিয়ে same ID import হয় না।

এই update-এর test evidence docs/VERIFICATION.md-এ। Domain/import/API correctness আলাদা disposable DB-তে পরীক্ষা হয়েছে; user-এর E: drive বা Neon-এ posting করা হয়নি। নতুন browser appearance/interactions ও hosted acceptance এখনো যাচাই হয়নি।
