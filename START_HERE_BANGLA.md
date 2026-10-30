> পরের delivery: `RELEASE_SETUP_BANGLA.md`। নতুন cumulative updater `update-smarterp-release-prep.mjs`; local env/DB অক্ষত। প্রথম কাজ Private GitHub repo।

> Current update: **ACCESS_AI_UPDATE_BANGLA.md** অনুসরণ করো। নিচের guide আগের checkpoint-এর; login/roles/AI/docs এখন নতুন guide অনুযায়ী চলবে।

> সর্বশেষ Apps Home/Search/Approvals/T&A update: WORKSPACE_UPDATE_BANGLA.md। Apply ও review workflow-এর জন্য এটিই আগে পড়বে।

> সর্বশেষ Merchandising/Inventory/UI workflow ও apply steps: FLOW_UI_UPDATE_BANGLA.md। নিচের পুরোনো instructions-এর ওপর এটিই প্রাধান্য পাবে।

> সর্বশেষ UI/Finance/People update-এর জন্য MILESTONE3_UPDATE_BANGLA.md পড়ো। এই file-এর order-to-delivery steps আগের workflow-এর জন্য প্রযোজ্য।

# SmartERP — Milestone 2 update লাগানোর নিয়ম

এতে আগের data tools-এর বাকি UI এবং connected order-to-delivery workflow আছে। Finance/payment/payroll actions ও AI পরের milestone। Ahsan Group-এর logo/নাম app-এ নেই।

## 1. পুরোনো local project update

1. `npm run dev` terminal-এ Ctrl+C দিয়ে app বন্ধ করো।
2. পুরোনো project folder-এর একটি backup copy রাখো।
3. এই ZIP extract করে `smarterp`-এর ভেতরের source/config files পুরোনো project-এ copy করে overwrite করো। পুরো পুরোনো folder delete করবে না।
4. তোমার `.env.local`, `.local-db`, Git history ও local changes রেখে দেবে। ZIP-এ তোমার data বা secrets নেই। নিজে code বদলে থাকলে overwrite-এর আগে সেই changes আলাদা রাখো।
5. VS Code terminal যেন package.json থাকা `smarterp` folder-এ থাকে।

```bash
npm ci
```

## 2. Database চালু রাখো, নতুন migration দাও

প্রথম terminal-এ আগে থেকেই `npm run db:local` চললে সেটাই চালু রাখো। বন্ধ থাকলে:

```bash
npm run db:local
```

Database ready হওয়ার পরে দ্বিতীয় terminal-এ:

```bash
npm run db:migrate
npm run db:seed:demo
npm run db:seed:workflow
```

`003_stock_ledger.cjs` নতুন table যোগ করবে। পুরোনো data reset হবে না। Scenario seed শুধু Draft BOM, Opening Stock document ও Sales inquiry যোগ করে। Stock তখনো post হবে না।

## 3. বড় dataset load করতে

App বন্ধ এবং database চালু থাকা অবস্থায় দ্বিতীয় terminal-এ:

```bash
npm run db:seed:history
```

এতে আলাদা namespace-এ Northwind-এর 830 orders/2,155 lines এবং UCI-এর 1,197 team-day records load হবে। কিছু সময় লাগবে। বারবার চালালে একই records duplicate হবে না; seed কখনো operational stock/payment post করে না। Source integrity mismatch হলে থামবে।

## 4. Local access

Presenter lock/unlock সরানো হয়েছে। System Admin login শেষ milestone-এ যোগ হবে। `.env.local`-এর APP_URL browser origin-এর সঙ্গে মিলিয়ে রাখো (http://localhost:3000)। আগের presenter secrets আর ব্যবহার হয় না।

## 5. App চালাও

```bash
npm run dev
```

Browser: http://localhost:3000 — local actions সরাসরি ব্যবহার করা যাবে।

## 6. Bulk Upload দেখো

Sales / CRM expand → Customers → Upload CSV।

ZIP-এর `data/examples/customers.csv` বেছে নাও → mapping দেখো → Validate entire file & preview → errors না থাকলে Confirm & import। Import Center-এ history/resume আছে। Preview pagination পুরো-file summary-এর সঙ্গে থাকে। Warnings থাকলে পড়বে; blocking errors থাকলে commit বন্ধ থাকবে।

একই file আবার import করলে একই content skip হবে। একই external ID-তে আলাদা content থাকলে overwrite হবে না—error দেখাবে। বড় file-এর মাঝে Pause দিলে current chunk শেষ হবে; history থেকে Resume করা যাবে।

Template button দিয়ে module অনুযায়ী header download করা যায়। Filtered CSV পুরো matching result দেয়, শুধু current page নয়। Charts-এর group dropdown থেকে matching list খুলতে পারবে। Ledger upload হয় না; Opening Stock/GRN/Work Order/Delivery-এর মতো source document post করলে ledger তৈরি হয়। Northwind মূল source adapter দিয়ে seed হয় এবং read-only থাকে। UCI CSV নিজস্ব historical dataset-এ import করা যায়।

## 7. Connected workflow চালাও

| ধাপ | কোথায় / কী করবে |
| --- | --- |
| 1 | Inventory → Opening Stock → OPEN-DEMO-001 → Post opening stock: 1,400 kg |
| 2 | Manufacturing / QC → Bills of Material → BOM-DEMO-001 → Approve BOM |
| 3 | Sales / CRM → Inquiries / Quotes / Orders → SO-DEMO-001 → Create quotation → Confirm Sales Order |
| 4 | Check BOM / materials: required 2,200 kg, available 1,400 kg, shortage 800 kg |
| 5 | Create shortage PO: supplier SUP-001, rate 500 BDT/kg |
| 6 | Related PO খুলে Approve purchase → Create Goods Receipt |
| 7 | Related GRN খুলে Accept full receipt: fabric 2,200 kg |
| 8 | PO-তে ফিরে Create supplier bill → related bill খুলে Match supplier bill |
| 9 | SO-তে ফিরে Create Work Order → related WO খুলে Issue materials: fabric 0 |
| 10 | Record full production: finished 10,000 pieces; সব QC hold-এ |
| 11 | QC hold চাইলে দাও; তারপর Release QC: 10,000 pieces available |
| 12 | Create delivery → related delivery খুলে Dispatch full delivery: finished stock 0 |

একই posting button আবার submit হলেও source-event guard stock দ্বিতীয়বার পরিবর্তন করতে দেবে না। অনুপযুক্ত status-এ action বা QC hold-এর goods dispatch বন্ধ থাকবে।

Supplier bill এখানে full PO amount/accepted GRN-এর সঙ্গে Matched হয়। Actual AP, payment, customer invoice/collection, payroll ও AI এখনো এই update-এর অংশ নয়। 45 লাখ Sales Order value-কে revenue/profit বলা যাবে না।

## 8. Reports ও checks

Top dataset selector থেকে Northwind historical / UCI garment historical বেছে নিয়ে saved lists/charts দেখো। Sources-এর dates/units operational BDT বা payroll-এর সঙ্গে mix হয় না।

App বন্ধ রেখে current local stock reconcile করতে:

```bash
npm run db:check
```

Build/API/domain verification-এর commands README.md এবং docs/VERIFICATION.md-তে আছে। Live Netlify/Neon deploy এই update-এ হয়নি।
