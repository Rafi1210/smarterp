# SmartERP — Login, roles, Management Brief ও পরিষ্কার workflow/documents

এটি আগের workspace update-এর পরের cumulative update। Apps Home, search, Approval Inbox ও T&A বহাল আছে। নতুন login ছাড়া business records/API খোলে না। Business scope এখনো একটি company, HQ location ও HQ-STORE warehouse; multi-branch stock/accounting এখনো নেই।

## Apply: E:\smarterp

Next.js terminal-এ Ctrl+C দাও; database terminal চালু রাখো। নতুন MJS file project folder-এ রেখে চালাও:

```bash
node update-smarterp-access-ai-documents.mjs
npm run db:migrate
npm run auth:setup
npm run db:check
npm run dev
```

নতুন dependency বা npm install লাগবে না। Node 24 ব্যবহার করো। Updater source backup রাখে; .env.local, .local-db, datasets, node_modules, .git ও exact package-lock.json বদলায় না। প্রথমে শুধু পরিবর্তনের তালিকা দেখতে MJS command-এর শেষে --check দেওয়া যায়; অন্য folder হলে --project "E:\smarterp"। TXT copy নিলে শেষের .txt সরিয়ে .mjs করবে।

Migration 007 additive। পুরোনো order/dispatch/invoice/payment আবার চালাবে না। Database reset বা ordinary reseed করবে না। Updater migration/setup নিজে চালায় না। আগের updater নতুনটির পরে চালাবে না।

## তিনটি fixed account

প্রথম auth:setup তিনটি account বানাবে এবং **নতুন account-এর password একবার terminal-এ দেখাবে**:

| Role | Default fixed email | কাজ |
|---|---|---|
| System Admin | admin@smarterp.local | সব module, operational approvals, explicit fixture setup, AI brief |
| Operations | operations@smarterp.local | Buyers, suppliers, orders, Merchandising, PO/GRN, store, production/QC, delivery ও T&A; supplier bill draft/matching |
| Finance | finance@smarterp.local | Invoices, supplier bills, receipts/payments, financial reports, employees/attendance/payroll; PO/payroll approvals; AI brief |

Generated password নিজের password manager-এ রাখবে। একই email/password দিয়ে পরেও login হবে; restart/deploy-এ password বদলায় না। Signup নেই। Setup আবার চালালে existing passwords অক্ষত থাকে, আর দেখায় না। UI-তে role বদলানোর dropdown দিয়ে identity বদলানো যায় না।

নিজের fixed email/password চাইলে **প্রথম setup-এর আগে** .env.local-এ SMARTERP_ADMIN_EMAIL / SMARTERP_ADMIN_PASSWORD, SMARTERP_OPERATIONS_EMAIL / SMARTERP_OPERATIONS_PASSWORD, SMARTERP_FINANCE_EMAIL / SMARTERP_FINANCE_PASSWORD দিতে পারো। Password অন্তত ১২ character ও সর্বোচ্চ ২৫৬ UTF-8 bytes; Bangla password-এর ক্ষেত্রে byte limit মানতে হবে। Custom email প্রতিটি role-এর জন্য আলাদা রাখবে। Password source/frontend-এ যাবে না; DB-তে salt সহ scrypt hash থাকে।

Password হারালে একই email রেখে .env.local-এ ওই role-এর নতুন password দাও এবং explicit command চালাও:

```bash
npm run auth:setup -- --reset admin
```

operations বা finance-এর জন্য role নাম বদলাবে। ঐ account-এর পুরোনো sessions revoke হবে; অন্য accounts/data বদলাবে না। Email migration/role-management UI এই release-এ নেই।

APP_URL browser origin-এর সঙ্গে মিলতে হবে: যেমন http://localhost:3000। localhost আর 127.0.0.1 মিশিয়ে ব্যবহার করবে না। Hosted origin হলে HTTPS লাগবে। Session cookie HttpOnly/SameSite=Lax, HTTPS-এ Secure; DB-backed session সর্বোচ্চ ৮ ঘণ্টা। Expiry/logout/reset-এর পরে আবার login লাগবে। পুরোনো DEMO_SESSION_SECRET / DEMO_WRITE_CODE login-এ ব্যবহার হয় না; নতুন session secret বানাতে হবে না।

## Permissions ও approval flow

UI navigation role অনুযায়ী বদলায়, তবে API-তেও checks চলে। Operations employee/payroll/payslip/payment/customer invoice/financial report দেখতে পারে না। Supplier bills দেখা, Draft তৈরি ও matching করতে পারে; Finance posting/payment করতে পারে না। Finance operational documents দেখতে পারে, কিন্তু stock/production mutate বা buyer/item/PO তৈরি করতে পারে না।

Operations → Draft BOM/Merchandising/PO → Request review। Admin → BOM/Merchandising approval; Finance অথবা Admin → PO approval। Finance → reviewed payroll → Request review; **অন্য account** → approval। তারপর Finance → salary payment → paid payslip।

নিজের submitted request নিজের account approve করতে পারে না—Admin-ও নয়। Return-এর কারণ লাগে; submitter বা Admin request cancel করতে পারে। Direct approve API commands এখন blocked: Approval Inbox ব্যবহার করবে। পুরোনো submitted_by ছাড়া legacy pending requests permitted reviewer পর্যালোচনা করতে পারবে। নতুন activity-তে account email/role ও submitter/reviewer ID থাকে; পুরোনো activity rewrite করা হয়নি।

এটি তিনটি fixed functional account-এর access control। ব্যক্তিপ্রতি identity, granular permission editor, MFA, password recovery email, delegated/amount-based hierarchy, full maker/checker coverage ও enterprise certification নয়। একই account একাধিক মানুষ ভাগ করে ব্যবহার করলে কে ব্যক্তি action করেছে তা আলাদা বোঝা যাবে না।

## Workflow/UI-তে কী বদলেছে

- Module অনুযায়ী Workflow Desk: Sales pipeline, purchase control, goods receiving, production/QC, invoice/bill desk, attendance/payroll ইত্যাদির আলাদা purpose, saved stage counts ও next-flow guide।
- রঙিন stage card-এ click করলে matching status-এর list আসে। Date/search/type scope একই থাকে। Historical namespaces, source dates/units/warnings আলাদা বহাল।
- List-এর Continue button-এ next step লেখা থাকে। Detail-এ Summary & next step / Related documents / Activity history আলাদা tab। Technical/saved extra fields More document details-এর ভিতরে।
- Green: completion/acceptance/payment actions; amber: review submission; violet: production/planning/AI; blue: সাধারণ document actions। Status badge আগের নির্দিষ্ট state colors ব্যবহার করে।
- Operations home/report navigation-এ payroll/Finance data আসে না। Read-only module-এ mutation controls disabled থাকে; role-denied API calls business data বদলায় না।

## Invoice, bill, voucher ও payslip

Customer Invoice, Supplier Bill, Purchase Order, Delivery Note, payment/receipt ও Paid Payslip-এর নিজস্ব document layout আছে: company, party, document/date/status, references, lines, BDT totals, saved allocations/outstanding ও signature spaces।

Document detail → **Open document · Print / PDF**। আলাদা authenticated page খোলে; **Print / Save PDF** browser print dialog খোলে। A4 print styles, repeated table headings ও row break protection আছে। এটি browser PDF, server PDF generation নয়। Signature spaces কোনো electronic approval/signature প্রমাণ নয়।

Draft/Matched invoice/bill-এ awaiting posting লেখা থাকে। No invented VAT/tax/discount added। Saved allocated/outstanding চলতি record balance; historical as-of balance Financial Snapshot-এ দেখবে। Party name/contact company master-এর current data থেকে আসে; legal immutable issued-invoice snapshot বা statutory tax invoice নয়। Payslip fixed salary components ও posted payment-এর saved snapshot ব্যবহার করে।

## AI Management Brief: optional setup

Login/roles/docs চালাতে AI key লাগে না। Brief page-এ facts ও honest Rules-based brief থাকবে। AI চালাতে নিজের .env.local-এ server-side values দাও:

```dotenv
AI_ENABLED=true
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
OPENAI_MODEL=gpt-6-luna
AI_BUDGET_MICRO_USD=1000000
AI_RESERVATION_MICRO_USD=10000
AI_DAILY_LIMIT=30
AI_COOLDOWN_SECONDS=30
AI_MAX_OUTPUT_TOKENS=1000
```

আগের 250000 budget value থাকলে সেটি 1000000 করবে; 1000000 micro-USD = USD 1। Key chat-এ পাঠাবে না; NEXT_PUBLIC_ prefix দেবে না। Env বদলালে Next.js restart করো। Admin/Finance → Management Brief → **Generate AI brief**। Page open/refresh নিজে paid call করে না।

Backend facts/links গণনা করে; provider-এ শুধু synthetic namespace-এর aggregate totals/counts যায়। Raw names, email, personal/payroll rows, CSV content, source notes, user prompt, SQL বা tools যায় না। Model শুধু Bengali explanation ফেরায়; quantities backend fact cards-এ থাকে। নতুন URL বা business mutation model করতে পারে না।

Fixed limits: gpt-6-luna Responses API, reasoning none, store false, strict JSON, max_output_tokens 1000, ১৫-second provider deadline, **zero automatic retries**। App DB-তে মোট USD 1 allowance, প্রতি new call-এ USD 0.01 reservation; app-wide সর্বোচ্চ ৩০/day (Asia/Dhaka), ৩০-second cooldown। Budget/daily env lower করে tighter রাখা যায়; hard limits env দিয়ে বাড়ানো যায় না। Model/reservation/output settings-এর supplied compatibility values উপরেই রাখা উচিত।

একই saved-data snapshot-এর সফল AI brief ৫ মিনিট cache হয়। Snapshot/date/activity বদলালে বা cache expiry হলে পুরোনো brief current হিসেবে দেখায় না। Concurrent clicks budget row lock দিয়ে serialize হয়। Cache hits/new fallback without provider খরচ করে না। Invalid JSON/refusal/incomplete/provider error/timeout-এ rules-based fallback স্পষ্টভাবে লেখা থাকে।

Known usage পেলে verified Standard token rates দিয়ে allowance settle হয়। Usage অনিশ্চিত হলে পুরো USD 0.01 reservation conservative charge হয়; এটি provider invoice-এর actual billed cost দাবি নয়। Worker crash হলে Reserved টাকা স্বয়ংক্রিয়ভাবে release হয় না। Ordinary migrations, restart, seeds বা deployment allowance reset করে না। আলাদা DB contexts একে অন্যের budget ভাগ করে না; multiple deployments-এর combined provider spend control পরের deployment setup-এ নির্ধারণ করতে হবে।

এই delivery-তে বাস্তব API key/paid provider call পরীক্ষা করা হয়নি। Provider contract, sanitised payload, cache, caps, timeout/error/fallback automated fixtures দিয়ে পরীক্ষা করা হয়েছে। Model access ও account credits তোমার OpenAI account-এর উপর নির্ভর করবে।

## বর্তমান সীমা ও evidence

Business scope এক company/HQ/warehouse; one finished style ও one fabric, full-quantity operational postings। Multi-component BOM, color/size matrix, partial operations, lot/roll tracking, branch transfers, statutory accounting/tax এবং capacity optimization এখনো বাকি। Net cash movement-কে profit বা full garment costing বলা হয় না।

Actual verification ও local commit: docs/VERIFICATION.md। Netlify/Neon-এ এই session থেকে actual deploy/promotion হয়নি। পুরোনো deployment status বা public URL বানিয়ে বলা হয়নি।
