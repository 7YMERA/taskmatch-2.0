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

### Phase 4 — COMPLETE: onboarding polish (Getting Started checklist)
- `taskmatch/app/components/GettingStarted.tsx` — a dismissible checklist card shown on the **dashboard** (leaders only) when the workspace is sparse. Steps reflect real data: *add people* (peopleCount>0), *create first task* (taskCount>0), *invite teammates* (links to `/team`). Auto-hides once people + at least one task exist, or when dismissed (`localStorage` key `tm_getting_started_dismissed`). Mounted in `dashboard/page.tsx` right after the PageHeader.
- The existing `/onboarding` create/join flow (Phase 3b) was already solid; the gap was the empty-dashboard dead-end, which this fills.
- **Phase 4 is now fully done** on the ROADMAP: Ctrl+K palette, `/settings`, CSV exports, Getting Started. All on branch `phase-4-command-palette` (unmerged pending review).

### What's next (Level 3 — "reframe as a product")
Per ROADMAP Level 3, the remaining big items are: **integrations** (GitHub Issues / Jira import), and an **outcome feedback loop** that retrains the matcher from real completion scores. Both are large and partly backend/data-model work — good candidates for a fresh, well-scoped session (and for splitting across agents once the RAM situation allows).

### Level 3 — STARTED (branch `level-3-integrations`, NOT merged)
**1. GitHub Issues import.** `/integrations` page (leaders only; sidebar + palette). Backend in `main.py`: `POST /import/github/preview` (fetch issues from a public or token-authed repo via GitHub's REST API; filters out PRs; skips already-imported) and `POST /import/github/commit` (creates tasks; labels → best-effort severity via `_SEVERITY_FROM_LABEL`; stamps `external_source`/`external_ref`). Schema add: `supabase/integrations.sql` adds `external_source` + `external_ref` to `tasks` + a per-workspace unique index — **user must run it** for dedupe to persist; the API degrades gracefully without it (import still works, just no dedupe column).
**1b. Jira import — DONE (same `/integrations` page, same shape).** Backend: `POST /import/jira/preview` + `POST /import/jira/commit`. Auth is a Jira account **email + API token** (Atlassian Cloud Basic auth); `site` is the host (`yourco.atlassian.net`), optional `project` key, optional raw `jql` (overrides project/state). Fetches via `GET /rest/api/3/search`; `_jira_text()` flattens Atlassian Document Format description JSON to plain text; Jira **priority** → severity via `_JIRA_PRIORITY_TO_SEVERITY` (Highest/Blocker→Critical, High/Major→High, Low/Minor/Lowest/Trivial→Low). Reuses the SAME `external_source='jira'` / `external_ref=<issue browse URL>` dedupe columns from `integrations.sql` — **no new SQL needed for Jira.** UI: a second card on `/integrations` (site, project, email, token → Preview → pick → Import).
**2. Outcome feedback loop = matcher calibration.** `matching.calibration(assignments, skill_names)` (pure, unit-tested in `test_calibration.py`) pairs each completed task's required skill level with the score it earned, computes a Pearson correlation per skill + overall, and returns a plain verdict. Exposed at `GET /matcher/calibration` (insights.view), shown on `/integrations`.
**2b. Matcher auto-tune — DONE (off by default, never silent).** Goes one step past calibration: proposes **re-balanced weights** from how well each of the four fit factors (skills/experience/availability/record) actually predicted real completion scores.
- Pure logic in `matching.py`: `suggest_weights(factor_pairs, base)` (needs ≥ `MIN_TUNE_SAMPLES=8` completed+scored tasks; blends current weights 50/50 with each factor's evidence-trust, keeps the total at 100, floors every factor at `WEIGHT_FLOOR=5` so none is ever zeroed) and `set_weights(new)` (validates keys/total, mutates the live `WEIGHTS` dict **in place** so `fit()` sees it). `fit()` now takes an optional `weights=` arg; `rank_people()` loads the workspace's applied weights via `load_active_weights()` and passes them down.
- Per-workspace storage: `supabase/matcher_weights.sql` — one `matcher_weights` row per workspace (JSONB), registered in `WORKSPACE_TABLES`. **No row = default weights** (`skills45/experience20/availability20/record15`). **User must run this SQL** to persist applied weights; without it the API still serves defaults + suggestions, it just can't save an applied set (POST returns a clear 409 telling them to run the SQL).
- Endpoints: `GET /matcher/weights` (active + default + suggestion, `insights.view`) and `POST /matcher/weights` (apply; `tasks.manage`; validated, audit-logged `matcher.weights_applied`). UI: a third card on `/integrations` shows active weights, the proposed diff per factor, **Apply** / **Reset to default** buttons. **Nothing re-ranks until a leader clicks Apply.**
- **Why off-by-default and human-applied:** auto-applying would silently re-rank everyone; a class/team's data is small, so a human reviewing the suggestion is the safe design. True continuous auto-retraining is the future extension (needs far more completed-task volume).
- Verified live: calibration returned real numbers on the demo workspace (53 scored tasks); auto-tune on the same 53 proposed `{skills:40, experience:16, availability:16, record:28}` (record correlated best at 0.37, experience/availability near zero). Backend **172 tests pass** (`test_calibration.py` + new `test_autotune.py` + extended L3 auth-contract tests). tsc clean, lint 0 errors.
- **For Claude:** `docs/PHASE-LEVEL3.md` now documents all of this. Remaining Level 3 ideas: other importers (Linear, Trello), scheduled re-sync of imported issues, and continuous auto-tune once there's enough data. Update the ROADMAP rows when you extend.

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
