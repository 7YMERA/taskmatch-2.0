# Claude Notes — session handoff (2026-10-26)

Quick catch-up for Kiro (or future me) picking this repo up on another device, and a plain-English
record for the owner of what Claude has built so far. It is the companion to
[KIRO-NOTES.md](KIRO-NOTES.md): same shape, same purpose. Read both before starting work.
Everything below is merged to `main` unless it says otherwise.

## Why this file exists (the user's intent)
The user builds TaskMatch 2.0 with **two assistants**: Claude (cloud sessions, plus a session on the
personal laptop) and **Kiro** (KiroCrew, on the work laptop). Work moves both ways through GitHub. The
user asked each assistant to keep its own notes file so they can read later what changed, and so the
other assistant can catch up without re-deriving context. Kiro's file covers PRs #19 onward; this file
covers Claude's work, **PRs #1 to #18**, plus a review of Kiro's work since.

## What shipped (all merged)

| PR | What |
|---|---|
| #1 | **Locked the API down.** Every endpoint except `/health` needs a login token; per-IP rate limit (`RATE_LIMIT_PER_MINUTE`, default 120); one shared Supabase client in `taskmatch/app/lib/supabase.ts`. |
| #2 | **Tasks and Students pages restyled** onto the design system (`globals.css` tokens + `components/ui.tsx`). Added `tm-chip`, `tm-menu`, `tm-pick`, `tm-select-sm`, `tm-btn-sm`, `tm-btn-icon`. |
| #3 | **Row-level security on every table** (`supabase/rls.sql`). Before this, RLS was off on 8 of 9 tables, so the public key alone could read and write data. API now prefers the service-role client (`db()`). |
| #4 | **Modern redesign**: neutral greys + one brand colour, every colour defined per theme so light mode stops showing white-on-white text, rebuilt landing, login and sign-up. Documented in `docs/REDESIGN.md`. |
| #5 | **Phase 1 dashboard**: KPI tiles with trend vs previous period, Needs attention, Matching health (the FYP's own success targets), workload heatmap, skills coverage, date range in the URL. **Auto-assign modes**: best match, round robin, least loaded, with reasons shown before confirming. `docs/PHASE1-DASHBOARD.md`. |
| #6 | **Project README** (portfolio framing: why, goals, v1 vs v2, setup, roadmap). |
| #7 | **Phase 1b Tasks + People**: list / board / calendar views, search, quick + saved views, bulk actions; people filters and skills matrix. `docs/PHASE1B-TASKS-PEOPLE.md`. |
| #8 | **Phase 1c**: My Tasks focus page (live timer, budget bar, proper Complete dialog), quick-view drawers for tasks and people, People cards. `docs/PHASE1C-WORKSPACE.md`. |
| #9 | **Phase 2 roles + audit**: admin / lead / member / viewer stored in `app_metadata` (before, any student could make themselves a leader through `user_metadata`), permission checks in the API and in SQL (`supabase/roles.sql`), `/team` and `/audit` pages, away status. `docs/PHASE2-ROLES-AUDIT.md`. |
| #10, #11 | **Phase 3 AI assist**: skills, hours and severity suggestions for a new task, each with a confidence level, nothing applied until a person clicks Use. Works free by default (`suggest_history.py`, learns from the team's finished tasks); Claude is used only if `ANTHROPIC_API_KEY` is set. `docs/PHASE3-AI-ASSIST.md`. |
| #12 | **Phase 3b workspaces + projects** (multi-team, like Jira): workspace switcher, create/join with invite links, a role per person per workspace, projects with short keys. Every API query is pinned to the caller's workspace via `ScopedTable` / `WORKSPACE_TABLES`. `supabase/workspaces.sql`, `docs/PHASE3B-WORKSPACES.md`. Also stopped failing Vercel preview builds for `claude/*` branches. |
| #13, #14, #16, #17 | **Demo data**: `supabase/demo-data.sql` (Acme Studio with projects PLAT/MOB/WEB/DATA, a second "Weekend hackathon" workspace) and `supabase/demo-data-more.sql` (46 more tasks with two months of history). Names, emails and skills made unique per workspace. Fixes for the live DB (`activity_logs.entity_id` is a uuid; skill levels are 1 to 3). Tasks page now opens on the Board. |
| #15 | **Live-site fix**: trims a trailing slash from `NEXT_PUBLIC_API_URL`, which was turning every API call into `//path` (404). |
| #18 | **People page + smarter matching** (Level 2 start): explainable fit score out of 100 (skills 45, proven experience 20, availability 20, record 15) in `taskmatch-api/matching.py`; skill evidence from finished work that fades with age; `/match/people` and `/people/insights`; Team insights and Find a match tabs; "Who could take this?" in New task. `docs/PEOPLE-MATCHING.md`. |

**Deployment (not a PR, done with the user on 2026-10-25):** frontend on Vercel
(`taskmatch-umber.vercel.app`, root dir `taskmatch`, auto-deploys from `main`), API on Render
(`taskmatch-rkwr.onrender.com`, root dir `taskmatch-api`, start command needs
`--proxy-headers --forwarded-allow-ips='*'` or every user shares one rate-limit bucket). SQL run order
on Supabase: `rls.sql` → `roles.sql` → `workspaces.sql` → (optional) demo data → Kiro's `notifications.sql`.

## Highlighted changes (the ones that matter most)
- **Security went from open to locked.** v1 had a hard-coded key, RLS off on most tables, and a role any
  user could edit. Now: login on every endpoint, RLS everywhere, server-only roles, rotated key.
- **Every page themed in both modes**, one brand colour instead of a rainbow.
- **The matcher explains itself.** Every recommendation shows its four parts, and skills are backed by
  finished work, not only self-declared.
- **Multi-team.** One deploy can serve many teams, each fully separated.
- **Free by default.** Nothing needs a paid API key; Claude AI is an opt-in upgrade.

## Challenges & friction (the honest list)
- **The cloud sandbox can't reach the live services.** `*.supabase.co`, `vercel.app` and `onrender.com`
  are blocked from Claude's cloud container, so I can't test against the real database or the live
  site. Every SQL script is a hand-off to the user (copy into the Supabase SQL Editor), and live checks
  had to run from the user's laptop.
- **Screenshots need a mock harness.** Because Supabase is unreachable, every before/after shot was taken
  against mocked data (fake session in `localStorage`, Supabase REST + API calls answered by Playwright
  routes, and the real `main.py` running on in-memory data). It works well, but the harness lives in the
  session scratchpad, not the repo, so it has to be rebuilt in a new session.
- **Schema drift between scripts and the live DB.** Two demo-data fixes (#14, #17) came from the live
  database differing from what the code assumed (uuid `entity_id`, a 1–3 check on skill levels). Same
  lesson Kiro wrote down: fakes don't catch live-only constraints.
- **Merging mid-PR.** PR #10 was merged at its first commit while follow-up commits were still landing;
  the rest had to go out again as #11. Lesson: say clearly when a PR is still receiving commits.
- **Vercel Hobby plan** rejects preview builds of commits by non-member authors (Claude), and emails the
  user each time. Fixed in `vercel.json` (#12, then Kiro widened it in #20).
- **Deploy ordering is fragile.** Roles and workspaces each needed "run the SQL, then deploy the API"
  in a specific order or the live site breaks briefly.

## Limitations (what Claude can't do here)
- No direct database access, and no access to the live site from the cloud (see above).
- No memory between sessions except the project notes and this file, so anything not written down is lost.
- Only sees what's on GitHub: uncommitted work on either laptop is invisible until pushed.
- RAM is not the constraint for Claude (unlike Kiro); session length and the blocked network are.

## Review of Kiro's work since #18 (written 2026-10-26)
Read through PRs #19–#24 (on `main`) and the `level-3-integrations` branch. Overall the work is solid,
well documented and consistent with the existing patterns. What I found, and what PR #27 did about it:

| # | Finding | Status |
|---|---|---|
| 1 | **Level 3 was never merged.** PRs #25 and #26 were closed without merging into `main`, so GitHub/Jira import and matcher calibration/auto-tune weren't live. | **Fixed in #27**: `level-3-integrations` merged in. Its SQL still has to be run: `integrations.sql`, `matcher_weights.sql`, `storage_avatars.sql`. |
| 2 | **KIRO-NOTES had the demo admin login and the publishable key, in a public repo.** Anyone could sign in as admin on the live site. | **Removed from the file in #27.** It is still in git history, so the owner must **change the demo password** in Supabase (Authentication → Users). |
| 3 | **Any member could list every pending approval.** `GET /approvals` reads with the service-role key, so RLS didn't filter it. | **Fixed**: members only get their own requests; leaders get all. |
| 4 | **`/approvals/request` took a client-built payload** for `self_assign_critical`, so a member could name another person or task and have it run on approval. | **Fixed**: that kind is only created by `/self-assign`, which builds the payload on the server. |
| 5 | **Approving was check-then-update**, so two leaders at once could both run the action. | **Fixed**: the update only matches a row still `pending`; the loser gets 409. |
| 6 | **Jira `site` accepted any host**, so the API could be pointed at internal addresses with the user's token. | **Fixed**: only `*.atlassian.net` (`_jira_host()`). |
| 7 | **`matching.set_weights()` changed the shared default weights** for every workspace on the server. | **Fixed**: replaced by `validate_weights()`, which returns a copy and is what `POST /matcher/weights` now uses. |
| 8 | **Seeded test rows**: 3 notifications + 1 approval in the demo workspace, for screenshots. | Open: delete once the screenshots exist. |
| 9 | **Vercel previews still built for `claude/*` branches**: `"*"` doesn't match a `/`, so the filter from #20 missed them. | **Fixed**: added `"**": false` to `vercel.json`. |
| – | KIRO-NOTES deferred item 2 (replace the `prompt()` Complete box) | Already done: there is no `prompt()` left in `taskmatch/app`; #8 added the themed dialog. |

Tests for 3–7 are in `taskmatch-api/test_approvals.py` and `test_autotune.py` (185 backend tests pass).

## Suggestions / what's next
In rough order of value:
1. Run the Level 3 SQL, change the demo password, and delete the seeded test rows (review items 1, 2, 8).
2. Take the deferred media work from KIRO-NOTES (bell + approvals "new feature" shots, and the full
   v1 → v2 visual changelog in `docs/CHANGELOG-VISUAL.md`). Claude's mock harness can do this without
   touching the live database.
3. Move Logs, Signup and the leftover dashboard panels onto the design system. (KIRO-NOTES deferred
   item 2, replacing the `prompt()` Complete box, is already done: there is no `prompt()` left in
   `taskmatch/app`; #8 added the themed Complete dialog.)
4. Per-person capacity for the matcher's availability part (Level 2 leftover).
5. Split `taskmatch-api/main.py` into route modules once Level 3 is settled; it touches everything, so
   do it when no other branch is in flight.
6. Check the screenshot harness into the repo (e.g. `tools/screenshots/`) so either assistant can reuse it.

## Conventions (so neither of us repeats mistakes)
- Feature branch + PR for everything; never push to `main`.
- New workspace-scoped tables go in `WORKSPACE_TABLES` in `main.py` (Kiro's #22 lesson).
- Permissions live in three places that must agree: `permissions.json`, API `ROLE_PERMISSIONS`, SQL `tm_can()`.
- No emoji in the product UI; outline SVG icons from `ui.tsx`. Varied but tasteful colour, both themes.
- Each phase gets a `docs/PHASE*.md` with light + dark before/after screenshots and a ROADMAP tick.
- Never put credentials, client names or work (Axrail) material in this repo.
