# TaskMatch 2.0 — Roadmap

TaskMatch started as a Final Year Project (UTP). It works and scored 4.76/5.
The idea is good. The engineering around it is what still reads "student project".
This roadmap turns it into something production-grade, in three levels.

**Rule: finish Level 1 before Level 2.** Solid engineering on a simple matcher
reads as professional. A clever matcher on untested code is still a student project.

---

## Level 1 — Make it production-grade

Same features. Real engineering. This is the current focus.

| # | Task | Why it matters | Status |
|---|---|---|---|
| 1 | Remove hard-coded Supabase keys | secrets never in code | ✅ done |
| 2 | Token-based identity on `/assign` `/start` `/complete` `/unassign` | stop forged actions | ✅ done |
| 3 | Lock CORS to known origins | any site could call the API | ✅ done (`CORS_ORIGINS`) |
| 4 | Validate request bodies with typed schemas (Pydantic) | reject bad data at the door | ✅ done |
| 5 | Handle DB/Supabase errors gracefully | no raw 500s | ✅ done (global handler) |
| 6 | Rate limiting | protect the free tier from abuse | ✅ done |
| 6b | Login required on read endpoints + row-level security on every table | the public key alone can't read or write data | ✅ done (`supabase/rls.sql`) |
| 7 | Test suite for the matcher + core logic | change code safely | ✅ done (pytest) |
| 8 | CI on every push (lint, type-check, tests) | catch breaks automatically | ✅ done (lint advisory) |
| 9 | API README + setup guide | a marker/dev can run it | ✅ done |
| 10 | Structured logging + `/health` detail | see what the server is doing | ◐ logging done; `/health` is still a bare liveness check |

**Left in Level 1:** `/health` detail (#10), storage policies for the `avatars`
bucket, and making lint blocking in CI.

### UI refresh (runs alongside Level 1)

Moving every page onto the design system (`app/globals.css` tokens +
`app/components/ui.tsx`) so light and dark mode both work.

| Page | Status |
|---|---|
| Landing, Login | ✅ done |
| Tasks list, Students list | ✅ done |
| Task detail, Student detail, My Tasks, Profile | ✅ done |
| Toasts + confirm dialog | ✅ done |
| Dashboard | ◐ partly (some panels still use legacy classes) |
| Logs, Signup | ☐ todo |

---

## Feature overhaul (runs alongside)

Making TaskMatch feel like a complete team platform, one phase at a time. Each phase
ships as its own pull request with before/after screenshots.

| Phase | Scope | Status |
|---|---|---|
| 1 | Dashboards and analytics (trends, needs attention, matching health, workload heatmap, skills coverage) + assignment modes (best match, round robin, least loaded) | ✅ done ([PHASE1-DASHBOARD.md](PHASE1-DASHBOARD.md)) |
| 1b | Tasks and People pages rebuilt (list/board/calendar, search, saved views, bulk actions, people filters, skills matrix) | ✅ done ([PHASE1B-TASKS-PEOPLE.md](PHASE1B-TASKS-PEOPLE.md)) |
| 1c | My Tasks focus page, task and person quick views, create task in a side panel, People cards | ✅ done ([PHASE1C-WORKSPACE.md](PHASE1C-WORKSPACE.md)) |
| 2 | Roles and permissions, audit trail, user management, "away" status | ✅ done ([PHASE2-ROLES-AUDIT.md](PHASE2-ROLES-AUDIT.md)) |
| 3 | AI assist: suggested skills, hours and severity for new tasks, each with a confidence level, confirmed by a person | ✅ done ([PHASE3-AI-ASSIST.md](PHASE3-AI-ASSIST.md)) |
| 3b | Workspaces and projects (multi-org, like Jira): one workspace per team or company, projects inside it, a role per person per workspace | ◐ in review ([PHASE3B-WORKSPACES.md](PHASE3B-WORKSPACES.md)) |
| 3c | Notification centre, approvals | ☐ next (built on workspaces) |
| 4 | Search, Ctrl+K, exports, settings, onboarding | ☐ todo |

---

## Level 2 — Deepen the premise (smarter matching)

The dissertation itself flagged these: workload scored lowest, skills are pure
self-declaration. These add real value for TaskMatch specifically.

| Task | Why |
|---|---|
| Skill *evidence* from completed tasks, not just claims | trust the skill data |
| Skill *decay* over time | stale skills fade |
| Per-person / per-role capacity (not a flat WIP of 3) | real teams differ |
| Explainable, tunable match score | leaders trust and adjust it |

---

## Level 3 — Reframe as a product

Biggest scope. "Startup", not "FYP".

| Task | Why |
|---|---|
| Multi-team / multi-org | beyond one UTP class (✅ workspaces, Phase 3b) |
| Integrations (GitHub Issues, Jira) | real workflows |
| Outcome feedback loop retrains the matcher | learns from results |

---

## Known debt (tracked, not urgent)

- ~~Old repo history still contains the public *publishable* Supabase key.~~ Done: the
  key was rotated in Supabase and RLS is on for every table.
- The `avatars` storage bucket has no storage policies yet (RLS covers tables only).
- "Complete" still uses the browser's `prompt()` box for hours; replace it with a
  themed dialog.
- `role.ts` UI role-toggle is a testing aid; the server now ignores it (correct),
  but it should not reach production unchanged.
- ~~Supabase client is created separately in ~8 frontend files — one shared helper.~~ Done: `app/lib/supabase.ts`.
- `taskmatch-api/main.py` is a single large file; split into modules as it grows.
- Frontend lint has legacy `any` types (`dashboard/page.tsx`, `SkillPicker.tsx`)
  and unused imports. CI runs lint as **advisory** until these are cleaned; make
  it blocking once fixed. Type-check and tests ARE blocking gates.
