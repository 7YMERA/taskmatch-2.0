# Kiro Notes — session handoff (2026-10-26)

Quick catch-up for Claude (or future me) picking this repo up on another device.
Everything below is already merged to `main` unless it says otherwise.

## What shipped this session (all merged)

| PR | What |
|---|---|
| #19 | **Level 1 finished** — detailed `/health` (version, uptime, service-role state, `?deep=1` DB probe → 503 if DB down; shallow `{ok:true}` kept). CI lint flipped to **blocking**. ESLint: real errors (react-hooks/purity, type) block; `no-explicit-any` + React-Compiler hook rules are **warnings**. Fixed 3 purity bugs (`Date.now()` in render → `useState` lazy init). |
| #20 | **Vercel preview deploys disabled** for all non-production branches (`vercel.json`: only `main` deploys). Stops failed-preview-build emails. |
| #21 | **Phase 3c — notifications + approvals** (see below). |
| #22 | **Fix**: registered `notifications` + `approvals` in `WORKSPACE_TABLES` (they were missing, so `db().table(...)` threw and both endpoints 500'd against the live DB). Verified live after the fix. |

## Phase 3c details (what to know before touching it)

**Backend** (`taskmatch-api/main.py`):
- Helpers near `log_activity`: `notify()`, `notify_leaders()`, `_user_id_for_student()` — all best-effort (never block the real action).
- Endpoints: `GET /notifications`, `POST /notifications/read`, `GET /approvals`, `POST /approvals/request`, `POST /approvals/decide`.
- Notifications fire on: leader assigns you (`/assign`), task fully completed (leaders, in `/complete`), approval approved/rejected.
- **Approval gate** lives in `/self-assign`: a plain **member** self-assigning a **Critical** task files a pending approval instead of assigning. Leaders/admins bypass.
- New tables MUST be in `WORKSPACE_TABLES` (that was the #22 bug) — if you add more workspace-scoped tables, register them there too.

**Frontend** (`taskmatch/`):
- `app/components/NotificationBell.tsx` — bell + unread badge + dropdown, polls every 60s. Mounted in `Sidebar.tsx` (desktop footer + mobile bar).
- `app/approvals/page.tsx` — leaders-only inbox, Approve/Reject.
- New `bell` + `inbox` outline icons in `components/ui.tsx`. No emoji anywhere (user preference — use outline SVG icons).

**Schema**: `supabase/notifications.sql` — run once in the Supabase SQL Editor after `rls.sql`, `roles.sql`, `workspaces.sql`. **Already run** by the user on 2026-10-26. Tables confirmed live.

## Environment / deploy state
- Supabase publishable key was rotated to `sb_publishable_zOsqCqnjuKMr9bzoRrsq6A_Zq0fbsXE`; secret + URL unchanged. Local `.env` files, Render, and Vercel all updated — live site boots clean.
- Local dev: API on `127.0.0.1:8000` (venv uvicorn, reads `taskmatch-api/.env`), frontend on `:3000`.
- Demo login: `demo@taskmatch.app` / `taskmatch123` (role **admin/leader**).

## Test data I seeded (clean up when done)
For the demo account's workspace I inserted **3 notifications** + **1 pending approval** so screenshots show live content. These are real rows in Supabase — delete them from `notifications` / `approvals` when no longer needed (e.g. `delete from notifications where user_id = '<demo uid>'`).

## OPEN / not done (the handoff ask)
1. **Screenshots of the bell + approvals** as a "new feature" showcase (there is NO real "before" — these are new in 3c, so don't fake a before/after pair). Capturing was blocked locally by Windows PowerShell script-execution policy on the `playwright-cli.ps1` shim — use `playwright-cli.cmd` or run from a shell where `.ps1` is allowed.
2. **Visual changelog not updated** for recent work. User wants a changelog covering **all** the big features compared against **v1** (the old `taskmatch-git` repo): FYP→generic rebrand, auth hardening, design-system/token UI, landing page, login redesign, dashboard overhaul, workspaces/projects, roles+audit, AI assist, and Phase 3c notifications/approvals. Existing visual changelog is `docs/CHANGELOG-VISUAL.md` (landing/login/dashboard before/after pairs only).

## Conventions that bit me (so you don't repeat them)
- **Never** `git push` to `main` — a safety policy blocks it. Push a feature branch + open a PR.
- Don't chain `git commit`/`git push` with `{...}` braces or variable expansion in one command — the policy reads it as an unverifiable push target. Run commit and push as separate, literal commands.
- No emojis in the product UI; use outline SVG icons. User also wants tasteful color variety (not just black/purple) across cards in both themes.
