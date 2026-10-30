# SmartERP - Private GitHub, CI, isolated staging and release preparation

এটি code/config preparation delivery। এই chat থেকে তোমার Windows E:\smarterp, GitHub account, Neon account বা Netlify project-এ connection করা হয়নি। Actual hosted URL/remote commit এখনো নেই। নিচের প্রথম কাজ GitHub; তারপর প্রথম real staging deployment। কোনো ChatGPT plugin বা নতুন npm dependency লাগানো হয়নি।

## 1. এখন শুধু update apply করো

Next.js terminal-এ Ctrl+C; local database terminal চালু থাকতে পারে। নতুন MJS-টি E:\smarterp-এ রাখো:

```bash
node update-smarterp-release-prep.mjs
```

Dry run চাইলে command-এর শেষে `--check`; অন্য folder হলে `--project "E:\smarterp"`। TXT copy নিলে শুধু শেষের .txt সরাও। এটি cumulative source update: backup রাখে, .env.local/.local-db/source data/lockfile/node_modules/Git বদলায় না। নতুন dependency নেই, database command স্বয়ংক্রিয়ভাবে চলে না। এই release-prep-এ নতুন database migration নেই; আগের login update-এর migration 007 পর্যন্ত আগে থেকেই applied থাকলে আবার migrate/setup/seed করতে হবে না। পুরোনো updater নতুনটির পরে চালাবে না।

## 2. GitHub-এ blank repository

1. https://github.com/new খোলো। নিজের account বেছে নাম দাও `smarterp`।
2. Visibility নিজের পছন্দে Private অথবা Public। README / .gitignore / license দিয়ে initialize করবে না; existing source আছে। Public হলে Netlify-তে Deploy Previews বন্ধ রাখবে এবং untrusted PR/fork builds-এ cloud secrets দেবে না।
3. Create repository চাপো। HTTPS repository URL কপি রাখো। URL-এ token/password বসাবে না।
4. Repo URL chat-এ দেওয়া যায়; password, token, database URL বা .env content দেওয়া যাবে না।

E:\smarterp terminal-এ Git আগে initialize করা না থাকলে:

```bash
git init -b staging
```

আগে থেকে Git থাকলে `git branch --show-current` দেখো। staging হলে সেখানেই থাকো। অন্য branch হলে existing কাজ/commit অক্ষত রেখে নতুন staging branch নাও: `git switch -c staging`। staging আগেই থাকলে `git switch staging`। Branch rename/reset/force push লাগবে না। Parent directory-এর Git repository হলে আগে project root-এ সঠিক repository তৈরি করতে হবে; check সেই ভুল আটকাবে।

তারপর:

```bash
npm run repo:check
git add .
npm run repo:check
git diff --cached --stat
git commit -m "Prepare SmartERP staging checks"
```

`passed: true` হতে হবে। Git identity চাইলে নিজের নাম/email এই repository-তে configure করবে। `.env.local`, `.env.staging.local`, `.local-db`, backups, deployment reports ও standalone updater commit হবে না। `.gitignore` আগের committed secret মুছে দেয় না: check working tree, index এবং reachable history পরীক্ষা করে। একটি staged file পরে safe করে লিখলেও staged secret ধরা হয়।

Finding হলে push বন্ধ রাখবে। Output কেবল path/reason/source দেখায়, secret value নয়। Real leaked credential থাকলে আগে revoke/rotate করতে হবে; history cleanup আলাদা review করে হবে। Scanner plaintext heuristics; সব ধরনের secret detection বা penetration test নয়।

নিজের **আসল URL** দিয়ে OWNER অংশ বদলানোর পরে:

```bash
git remote add origin https://github.com/OWNER/smarterp.git
git push -u origin staging
```

origin আগে থাকলে `git remote -v` দিয়ে মিলিয়ে দেখো; অজানা remote overwrite করবে না। GitHub login চাইলে নিজের browser/device sign-in flow ব্যবহার করো। Token chat বা URL-এ দেবে না। প্রথমে কেবল staging push; main promotion নিচের live acceptance-এর পরে।

## 3. GitHub Actions-এ কী চলবে

Repository → Actions → **SmartERP checks**। Workflow staging/main push ও pull request-এ চলে, `contents: read` permission ব্যবহার করে, production/Neon/API credentials চায় না। Official checkout/setup-node action observed v7 commit SHA-তে pin করা; Node 24 এবং exact package-lock দিয়ে `npm ci` হবে।

Checks: repository/history scan → production dependency audit → unit/source hashes → release-tool tests → isolated integration tests → Next build → built-app HTTP checks। Test fixtures isolated PGlite PostgreSQL-engine databases; ordinary local/cloud business database নয়। CI app seed বা migration শুধু disposable test fixtures-এ চালায়।

Actions green হওয়া পর্যন্ত পরের release decision নিও না। Netlify builds এবং Actions আলাদা; Actions automatic deployment approval gate বলে দাবি করা হচ্ছে না। GitHub account/plan-এ required checks/protected-branch rules পাওয়া গেলে configure করা যাবে; private Free repo-তে সব paid policy আছে ধরে নেবে না।

## 4. প্রথম cloud target: dedicated staging project

Git branch ও company branch আলাদা বিষয়। App scope এখনো এক company/HQ/HQ-STORE। প্রথমে GitHub `staging` branch থেকে একটি **dedicated Netlify staging project** হবে; প্রথম main release-এর জন্য আলাদা production project পরে হবে। এতে untested app commit আগে main-এ push করতে হয় না। একই application/source, দুই deployment context।

Staging Netlify project-এর primary Git branch `staging`; Netlify এটিকে `production` deploy context বলতে পারে, কিন্তু application `APP_ENV=staging` থাকবে। Code এই নির্দিষ্ট combination এবং single-project-এর `staging` branch-deploy দুটোই যাচাই করে। অন্য branch/Deploy Preview database access-এর আগে build বন্ধ হয়।

এখনও কোনো account/site তোমার হয়ে create করা হয়নি। Free plan-এই শুরু করবে; plan-এর usage/credits UI দেখে নিও, paid feature enable করবে না।

## 5. Neon-এ নতুন empty staging database

Neon Console-এ PostgreSQL project এবং **empty `smarterp_staging` database** তৈরি করো। Existing local PGlite folder upload/rename করে Neon database হয় না। Local business postings স্বয়ংক্রিয়ভাবে copy হবে না।

Neon Connect dialog-এ একই endpoint/database-এর দুটো connection নাও:

- Pooled: DATABASE_URL; hostname-এ `-pooler` থাকে।
- Direct: DATABASE_DIRECT_URL; migrations ও explicit account setup-এর জন্য।

SSL query রাখবে (`sslmode=require` বা `verify-full`); Neon-এর `channel_binding=require` থাকলে রাখবে। Runner duplicate/unsupported connection options, pool/direct swap এবং আলাদা endpoint/database pair আটকায়।

Local machine-এ:

```bash
npm run profile -- staging init
```

এতে `.env.staging.local` তৈরি হয়; existing file overwrite হয় না। VS Code-এ নিজের Neon values ও Netlify staging project-এর actual canonical HTTPS URL বসাও। `.env.local` বদলাবে না। Template URL/connection placeholders রেখে command চালানো যাবে না।

```bash
npm run profile -- staging check
npm run profile -- staging db:migrate
npm run profile -- staging db:seed:demo
npm run profile -- staging auth:setup
npm run profile -- staging db:check
npm run profile -- staging deploy:check
```

প্রথম `check` শুধু configuration validate করে, DB connect করে না। `db:migrate` selected context-এ additive migration চালায় এবং wrong context adopt করে না। Explicit seed synthetic foundation master records ও datasets রাখে; কোনো invoice/cash/stock posting করে না। `auth:setup` নতুন account-এর generated password একবার নিজের terminal-এ দেখায়; password manager-এ রাখবে। Repeat setup password বদলায় না।

`deploy:check` read-only: app_context, migration metadata, tables, এক real saved customer এবং তিনটি active account যাচাই করে। Missing migration table create করে না, seed/approval/payment/AI call করে না। First setup আর ordinary deploy আলাদা।

Profile runner local DB/key/Node override/build-context values inherit করে না; selected profile-ই ব্যবহার করে। Command allowlist আছে। এটি কোনো production superuser permission model নয়; per-person identities ও least-privilege database roles real-data release-এর আলাদা কাজ।

## 6. Netlify manual setup - কোনো ChatGPT integration লাগবে না

Netlify Dashboard → Git provider থেকে existing repository import → ওই private SmartERP repo নির্বাচন → staging project name দাও → deploy branch `staging`। Name unique হবে, যেমন `smarterp-staging-<তোমার-unique-name>`।

Build command `npm run build:deploy`; publish `.next`; Node 24 `netlify.toml`/package engines-এ আছে। Netlify নিজস্ব Next.js adapter ব্যবহার করে; application package-এ adapter/plugin dependency যোগ করা হয়নি। Static export বা SPA catch-all redirect যোগ করবে না।

Netlify UI → Environment variables-এ staging project-এর জন্য **all scopes**-এ দাও:

| Key | Value |
|---|---|
| APP_ENV | staging |
| APP_MODE | demo |
| APP_URL | staging project-এর actual canonical https://...netlify.app URL |
| DATABASE_URL | ওই staging DB-এর pooled connection |
| AI_ENABLED | false |
| AWS_LAMBDA_JS_RUNTIME | nodejs24.x |

প্রথম deploy-এ DATABASE_DIRECT_URL বা account passwords platform-এ দরকার নেই; সেগুলো local ignored profile-এ থাকে। Free plan-এ all scopes ব্যবহার করো; toml-এর environment values Functions-এ পৌঁছায় না। Runtime application values UI-তে থাকতেই হবে। URL-এর সঙ্গে browser origin ঠিক মেলাবে। Values বদলালে নতুন deploy লাগবে।

Site create-এর সময় আগে build শুরু হয়ে configuration/DB readiness না পেয়ে fail হলে ওই failed build কোনো seed/posting করেনি। Actual assigned site URL profile এবং Netlify UI-তে মিলিয়ে bootstrap complete করে retry করবে। No automatic reset/reseed বা account setup build command-এ নেই।

Build verified branch/context/commit-এর **non-secret stamp** bundle করে। Netlify Functions-এ build-only CONTEXT/BRANCH না থাকলেও runtime APP_ENV ও DB context মেলানো হয়। `/api/health` deployed commit/branch/context দেখায়; DB unavailable হলে 503 এবং generic response। Build compiler cache corruption হলে শুধু generated `.next` clear করা যায়; `.local-db` কখনো নয়।

## 7. Actual live acceptance ও evidence

Deploy সবুজ হলে নিজের staging URL browser-এ খোলো, generated staging account দিয়ে login করে saved customer list দেখো। Local machine-এর account/password staging DB-তে নিজে copy হয় না।

`.env.staging.local`-এ শুধু locally যোগ করো:

```dotenv
SMARTERP_SMOKE_EMAIL=finance@smarterp.local
SMARTERP_SMOKE_PASSWORD=YOUR_STAGING_ACCOUNT_PASSWORD
SMOKE_EXPECT_COMMIT=YOUR_FULL_40_CHARACTER_DEPLOYED_COMMIT
```

`git rev-parse HEAD`/Netlify deploy details থেকে actual commit নেবে। Placeholder বসিয়ে run করবে না।

```bash
npm run profile -- staging smoke:live
```

এটি readiness/context/commit, anonymous 401, wrong-origin 403, browser headers, login cookie, authenticated persistent customer list এবং logout revocation পরীক্ষা করে। Hosted acceptance-এ credentials না দিলে pass হয় না। 15s request timeout, redirect follow হয় না, automatic retry/AI/business posting নেই। Login/logout session ও sign-in audit record তৈরি করে।

Evidence `.deployment-reports/staging-smoke.json`-এ থাকে; secret, cookie, raw customer/payroll data থাকে না। নতুন failure হলে report `passed:false` হয়। এটি test report; edit-proof external attestation নয়। Actual URL/commit/results না থাকলে deployment complete বলা যাবে না।

পরের manual acceptance: নতুন synthetic order → অন্য account-এর BOM/Merch/PO approvals → accepted GRN/bill match → reservation/issue → production/QC/delivery → invoice/partial receipt → supplier settlement → payroll approval/payment। Optional Draft setup selected staging profile-এ explicit:

```bash
npm run profile -- staging db:seed:workflow
npm run profile -- staging db:seed:people
```

Seed শুধু initial Draft বানায়; posting actions UI-তে review করে করবে। Already-posted flow আবার চালাবে না। Optional historical seed `npm run profile -- staging db:seed:history`; original dates/units/warnings আলাদা namespaces-এ থাকে।

## 8. Tested commit main-এ নেওয়া - actual staging acceptance-এর পরে

Staging CI এবং live acceptance একই commit-এ pass হওয়ার পরে, working tree clean রেখে:

```bash
git switch -c main
git push -u origin main
git switch staging
```

main আগে থাকলে `git switch main` → `git merge --ff-only staging` → `git push origin main`। Merge fast-forward না হলে stop করে review করবে; force push নয়। কোনো নতুন source change হলে সেটি staging-এ আবার test করতে হবে।

Production-এর জন্য নতুন empty `smarterp_production` database এবং আলাদা Netlify production project, Git branch `main`, APP_ENV `demo-production`, নিজের APP_URL ও pooled DB URL। Production profile `npm run profile -- production init` দিয়ে শুরু; আগের মতো explicit migrations/seed/account setup/readiness। Populated staging branch clone করলে app_context-ও copy হতে পারে; environment row edit করে production হিসেবে adopt করবে না। Fresh DB ব্যবহার করো।

এটি synthetic hosted release। Real business release-এর আগে individual accounts, finer permissions/MFA, production DB privileges, security review, monitoring, backup/restore drill, mobile/accessibility ও measured multi-user checks বাকি।

## 9. AI allowance - local key অক্ষত

এই updater তোমার working local AI configuration বদলায় না। প্রথম hosted staging/production `AI_ENABLED=false`: honest rules-based brief চলবে, provider call নয়। `.env.local` পুরোটা Netlify-এ import করবে না।

একটি local DB-র খরচের পরে আরেকটি fresh DB-তে আবার $1 allowance দিলে combined spend $1 ছাড়াতে পারে। তাই hosted AI enable করার আগে existing local spend মিলিয়ে একটি budget authority অথবা অবশিষ্ট allowance ভাগ করার ব্যবস্থা দরকার। বর্তমান allowance প্রতিটি isolated DB-তে enforce হয়; cross-DB combined allowance implement হয়নি। আলাদা deploy-এ নতুন key দিয়ে গোপনে cap বাড়ানো বা allowance reset করবে না। API key chat-এ বা NEXT_PUBLIC_ variable-এ যাবে না।

## 10. এই delivery-র বাস্তব checks ও সীমা

Recorded local checks: release-tool fixtures, existing business integration suite, read-only deployment preflight fixture, built-app HTTP acceptance, source byte hashes, build ও production dependency audit। Updated exact counts/result `docs/VERIFICATION.md`-এর latest release-prep section-এ দেখো। Exact package-lock ও original source bytes অপরিবর্তিত।

No GitHub remote push, hosted CI execution, Neon connection, Netlify build/URL, main promotion, backup/restore drill, full security audit বা paid AI call এই delivery-তে করা হয়নি। User-owned accounts/repository URL এবং platform setup ছাড়া সেগুলো claim করা যাবে না।

Official references verified 30 October 2026:

- https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/
- https://docs.netlify.com/build/functions/environment-variables/
- https://docs.netlify.com/build/functions/configuration/
- https://docs.netlify.com/build/environment-variables/overview/
- https://neon.com/docs/connect/connection-pooling
- https://docs.github.com/en/repositories/creating-and-managing-repositories/about-repositories
- https://github.com/actions/checkout
- https://github.com/actions/setup-node

Build hotfix: এই একই নামে নতুন MJS-টি আবার download/apply করবে। Netlify-এর test environment ও hosted stamp আলাদা করা হয়েছে; Windows source-path validation-ও ঠিক করা হয়েছে। Public repo-তে শুধু trusted staging branch deploy করবে; Netlify Deploy Previews বন্ধ রাখবে।
