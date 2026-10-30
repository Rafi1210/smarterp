# Security scope and reporting

SmartERP is a synthetic-data application with three fixed functional accounts. It is not certified for enterprise, statutory accounting, or personal/payroll production data.

Current controls include salted scrypt password hashes, opaque DB-backed sessions, HttpOnly/SameSite cookies, Secure cookies on HTTPS, request-origin checks, server-side permissions, login throttling, scoped references, transactional/idempotent critical writes, independent review decisions, protected CSV imports and a server-only bounded Management Brief.

Before pushing, run `npm run repo:check`. It inspects the current index, working files and reachable Git history, and reports paths/reasons without credential values. It is a heuristic plaintext scanner, skips binary contents and has a 6 MiB per-file/object limit. It does not prove that all secrets or vulnerabilities are absent. Never commit local environment files, DB folders, private keys, updater backups or deployment reports. Do not embed credentials in a Git remote URL. An ignored file can still exist in previous commits.

Run `npm run security:deps` to query current production dependency advisories. A clean advisory response does not certify application security. The repository CI runs in isolated synthetic test contexts without production credentials. Read-only hosted preflight and smoke checks do not replace manual security review, load testing, monitoring or a backup/restore drill.

Send suspected security issues privately to the repository owner through the available private communication channel. Do not post credentials, sessions, personal/payroll records or exploit details in public issues. No reporting email or external contact is configured by this release.

If a credential is exposed, revoke/rotate it before considering history cleanup. History rewriting, force push and database reset are not automatic fixes performed by these scripts. Account passwords printed by explicit local `auth:setup` are for the operator's password manager, not CI/deployment logs.

Real-data gates remain: individual identities, finer permission boundaries, least-privilege database roles, MFA/recovery, security review, alerting/abuse controls, tested recovery and operational acceptance. Cross-database AI allowances are not globally coordinated; keep new hosted providers disabled until a shared or partitioned remaining budget has been arranged.

No local Git hook is installed automatically. The operator must run the preflight before pushing; hosted CI scans code after it reaches GitHub.
