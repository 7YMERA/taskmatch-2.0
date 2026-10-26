# Kiro Notes — session handoff (2026-10-26)

Quick catch-up for Claude (or future me) picking this repo up on another device.
Everything below is already merged to `main` unless it says otherwise.

## Why this file exists (the user's intent)
The user (a product manager) develops TaskMatch 2.0 across **two assistants**: Kiro (me, in the Kiro Crew dashboard on this machine) and **Claude on another device**. Work flows both ways through GitHub. The user explicitly asked me to keep this file so that **when they switch back to Claude, Claude can catch up fast and then document and build on the work properly** — without re-deriving context or repeating steps. So treat this as the shared running log between the two agents: read it first, trust it over guesswork, and keep it current. When you (Claude) extend a feature here, update its section and tick the ROADMAP; when you hit a constraint, add it to the Challenges list. The goal is continuity across the hand-offs, and good documentation the PM can rely on.

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

## Phase 4 — started: Ctrl+K command palette + global search (NOT yet merged)
First Phase 4 slice. Frontend-only, no schema, no new backend endpoint.
- `taskmatch/app/components/CommandPalette.tsx` — opens on **Ctrl/⌘+K** (and a "Search… ⌘K" button in the sidebar). Searches `tasks`, `people`, `projects` in the current workspace (reads straight through the Supabase client; RLS scopes it). Also lists **role-gated quick actions** (go to pages, New task → `/tasks?new=1`, which the tasks page already honours). Keyboard: ↑/↓ move, Enter open, Esc close.
- Mounted once in `Sidebar.tsx` (so it's on every app page), plus the launcher button above the nav.
- New `bell`/`inbox` icons were added in 3c; the palette reuses existing icons.
- **For Claude to extend/document:** could add a real `/search` backend endpoint if client-side gets slow with large workspaces (currently caps at 500 tasks / 500 people / 200 projects, loaded once per open); could add recent-items, fuzzy ranking, and in-palette actions (assign, complete) beyond navigation. Needs its own `docs/PHASE4-SEARCH.md` and a ROADMAP tick when finalised.

### Phase 4 — also added: Settings page, CSV exports, palette actions (same branch `phase-4-command-palette`, NOT merged)
- **Settings page** — `taskmatch/app/settings/page.tsx`, routed at `/settings` (in the sidebar nav + a palette action). Real controls only: **theme** (dark/light via `lib/theme`), **notifications** (enable + interval 30s/1m/5m, persisted to `localStorage` key `tm_notif_pref`), **workspace** info + link to `/team`, link to `/profile`. The bell (`NotificationBell.tsx`) now READS `tm_notif_pref` — turning notifications off stops its polling; interval changes its cadence. Takes effect on next page load (bell reads the pref once on mount).
- **CSV exports** — shared helper `taskmatch/app/lib/csv.ts` (`toCsv`, `downloadCsv`, `stamp`; BOM + CRLF so Excel opens clean). Exposed as palette actions **"Export tasks as CSV"** / **"Export people as CSV"** (group `Export`) — fetch via the Supabase client (RLS-scoped) and download. The helper is reusable: a per-page "Export" button can call it with the page's filtered rows later.
- **In-palette assign/complete — deliberately NOT fully built.** A flat palette can't host the two-step pickers these need (assign = pick task + pick person; complete = pick assignment + enter hours). Instead the palette offers **navigation** into the existing flows (New task via `?new=1`, and the task-detail page where assign/start/complete already live). If you want true in-palette assign/complete, build a palette sub-mode (select task → select person) — noted as a follow-up, don't half-build it inline.

**For Claude:** these three + the command palette are all on branch `phase-4-command-palette` / PR #24-area work, pending the user's review. When finalised, write `docs/PHASE4-SEARCH.md` (palette + settings + exports) and tick Phase 4 on the ROADMAP.

## Challenges, limitations & friction this session (the honest list)
Written at the user's request — these are real constraints that capped what I could do, so the next agent knows why some things went the way they did.

- **Host RAM is the big one.** This machine runs tight — free memory swung between ~1.5 GB and ~5 GB during the session, and the dashboard kept flagging "tight/critical". Consequences:
  - I could **not** safely fan out work to parallel sub-agents. The spawn gate sat at 1/32 under "severe pressure" for long stretches, so the lint cleanup (184 issues) and the Phase 3c build were done **sequentially by hand** instead of split across agents. Slower, but reliable. On a bigger box this would have been a parallel wave and much faster.
  - Browser automation (Chromium via Playwright) is ~400 MB on top of two dev servers — risky when memory is low, and it's why screenshot attempts were deferred/aborted.
  - Had to serialise dev-server restarts and run **targeted** tests rather than the full suite at times.
- **Windows PowerShell, not bash.** Every shell command runs in PowerShell. `&&` chaining fails; `npm`/`npx`/`playwright-cli` `.ps1` shims are blocked by the execution policy, so I must call `npm.cmd` / `npx.cmd` / `playwright-cli.cmd`. This cost several retries before I adapted.
- **Browser screenshots never completed.** Combination of the two above (PowerShell `.ps1` block + tight RAM + the per-process Playwright session not persisting across separate `.cmd` calls). The bell/approvals "new feature" shots and the full visual changelog are still OPEN (see above). This is the main thing I could not finish — a capable but fiddly media task, better done where the browser tooling runs cleanly.
- **Git push safety policy.** All pushes must go via feature branch + PR with a literal target; `main` is blocked. Not a limitation of capability, just a guardrail that shaped the workflow (lots of small PRs: #19–#23).
- **Can't run SQL directly against Supabase.** No direct DB connection string; schema changes (the `*.sql` files) are copy-pasted into the Supabase SQL Editor by the user. So every schema step is a handoff, not something I apply end-to-end.
- **Unit tests don't catch live-integration bugs.** The Phase 3c `WORKSPACE_TABLES` bug (#22) passed all unit tests because the fake Supabase client doesn't enforce the real scoped-table allow-list — only hitting the live DB surfaced the 500. Lesson: smoke-test new endpoints against real Supabase, not just the fakes.
- **Two-agent workflow (me + Claude on another device).** Code arrives from both sides; I've had to fetch/fast-forward and reconcile Claude's commits more than once. This KIRO-NOTES file exists to reduce that friction. Keep it updated.
