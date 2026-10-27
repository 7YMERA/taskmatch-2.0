# TaskMatch 2.0

**Skill-based task matching for teams.** TaskMatch looks at the skills a task needs,
finds the people who have them, checks who has room to take more work, and helps a
lead assign it with the reason for every pick shown up front.

![TaskMatch 2.0 dashboard](https://raw.githubusercontent.com/wiki/7YMERA/taskmatch-v2/images/now/dashboard-dark.png)

| Light | Dark |
|---|---|
| ![Landing, light](https://raw.githubusercontent.com/wiki/7YMERA/taskmatch-v2/images/now/landing-light.png) | ![Landing, dark](https://raw.githubusercontent.com/wiki/7YMERA/taskmatch-v2/images/now/landing-dark.png) |

---

## Why this exists

TaskMatch started as my Final Year Project at Universiti Teknologi PETRONAS (UTP).
The original version ([7YMERA/taskmatch-git](https://github.com/7YMERA/taskmatch-git))
proved the idea: match people to tasks by skill instead of by whoever happens to be
free, cap how much work any one person carries, and pair strong members with learners
so skills spread across the team.

It worked, and it was well received. But it was still built like a student project:
keys in the code, endpoints anyone could call, a rainbow colour scheme with a light
mode that broke on half the pages, and a dashboard that showed totals rather than
answers.

TaskMatch 2.0 is a passion project to take that idea the rest of the way. The aim is
an app that holds up by today's standards, one I would be comfortable putting in front
of real teams and, one day, offering as a product.

## Goals

1. **Production-grade engineering.** Secure by default, tested, checked by CI on
   every push, and documented well enough that someone else can run it.
2. **A professional, modern look.** One coherent design system, calm neutral colours
   with a single brand accent, and light and dark modes that both actually work.
3. **Features a real team would expect.** Dashboards that answer "what needs me
   today?", automatic assignment, roles, audit history, notifications and more.
4. **Smarter matching.** Move beyond self-declared skills toward evidence from
   completed work, with a score leaders can understand and tune.
5. **Show the journey.** Every change is recorded with before/after screenshots, so
   the difference between the FYP and 2.0 is visible, not just claimed.

---

## Old vs new at a glance

| Area | Original FYP | TaskMatch 2.0 |
|---|---|---|
| **Secrets** | Supabase key hard-coded in the source | All keys in environment variables; the exposed key was rotated |
| **API access** | Read endpoints open to anyone | Every endpoint except `/health` needs a verified login token |
| **Identity** | Who-is-acting taken from the request body | Taken from the verified token, so actions can't be forged |
| **Database** | Row-level security off on most tables | RLS on every table ([`supabase/rls.sql`](supabase/rls.sql)) |
| **Abuse protection** | None | Per-IP rate limiting, locked-down CORS, typed request validation |
| **Errors** | Raw 500s | Handled globally with clean responses |
| **Tests and CI** | None | pytest suite (matcher, security, assignment modes) and GitHub Actions on every push and PR |
| **Look and feel** | Six-colour palette; white-on-white text in light mode | Neutral base with one indigo accent, per-theme tokens, Geist type, theme follows your OS |
| **Dashboard** | Totals at one point in time | Date ranges, KPI trends with sparklines, "needs attention", matching health, workload heatmap, skills coverage |
| **Assigning work** | Pick a person from a ranked list | Also auto-assign by best match, round robin or least loaded, previewed with the reason before confirming |
| **Assigning work, part 2** | Ranked by skill only | An explainable fit score out of 100 (skills, proven experience, availability, record), tunable per workspace from real outcomes |
| **Teams** | One shared list for everyone | Workspaces with their own people, tasks and roles; projects inside them; invite links |
| **Roles** | Leader or student, editable by the user | Admin, team lead, member, viewer, enforced by the API and the database, with an audit trail |
| **Staying informed** | Nothing | Notification bell, approvals for critical tasks, Ctrl+K search, CSV exports |
| **Integrations** | None | Import issues from GitHub or Jira |
| **Dialogs** | Browser `prompt()` boxes | Themed in-app dialogs |
| **Documentation** | Default framework README | Setup guides, API reference, and a [Wiki](https://github.com/7YMERA/taskmatch-v2/wiki/) with the roadmap and visual changelog |

---

## What's been enhanced so far

Each release has a full write-up with before/after screenshots in light and dark on the
**[Wiki](https://github.com/7YMERA/taskmatch-v2/wiki/)**. The **[Changelog](https://github.com/7YMERA/taskmatch-v2/wiki/Changelog)** lists every release, newest first.

| Release | What it brought | PRs | Write-up |
|---|---|---|---|
| Security hardening | Login on every endpoint, rate limiting, row-level security on every table | [#1](https://github.com/7YMERA/taskmatch-2.0/pull/1), [#3](https://github.com/7YMERA/taskmatch-2.0/pull/3) | [Changelog](https://github.com/7YMERA/taskmatch-v2/wiki/Changelog) |
| Modern redesign | One design system, neutral colours with one accent, light mode that works everywhere | [#2](https://github.com/7YMERA/taskmatch-2.0/pull/2), [#4](https://github.com/7YMERA/taskmatch-2.0/pull/4) | [Modern redesign](https://github.com/7YMERA/taskmatch-v2/wiki/Modern-Redesign) |
| Phase 1: dashboard | KPI trends, needs attention, workload heatmap, skills coverage, auto-assign modes | [#5](https://github.com/7YMERA/taskmatch-2.0/pull/5) | [Phase 1](https://github.com/7YMERA/taskmatch-v2/wiki/Phase-1-Dashboard) |
| Phase 1b, 1c: Tasks, People, My Tasks | List / board / calendar, saved views, bulk actions, skills matrix, quick views | [#7](https://github.com/7YMERA/taskmatch-2.0/pull/7), [#8](https://github.com/7YMERA/taskmatch-2.0/pull/8) | [1b](https://github.com/7YMERA/taskmatch-v2/wiki/Phase-1b-Tasks-and-People), [1c](https://github.com/7YMERA/taskmatch-v2/wiki/Phase-1c-My-Tasks-and-Quick-Views) |
| Phase 2: roles and audit | Admin / lead / member / viewer enforced by API and database, audit trail, away status | [#9](https://github.com/7YMERA/taskmatch-2.0/pull/9) | [Phase 2](https://github.com/7YMERA/taskmatch-v2/wiki/Phase-2-Roles-and-Audit) |
| Phase 3, 3b: suggestions, workspaces | Suggested skills, hours and severity; multi-team workspaces and projects | [#10](https://github.com/7YMERA/taskmatch-2.0/pull/10) – [#12](https://github.com/7YMERA/taskmatch-2.0/pull/12) | [3](https://github.com/7YMERA/taskmatch-v2/wiki/Phase-3-Task-Suggestions), [3b](https://github.com/7YMERA/taskmatch-v2/wiki/Phase-3b-Workspaces-and-Projects) |
| People and smarter matching | Explainable fit score out of 100, proven skills, Team insights, Find a match | [#18](https://github.com/7YMERA/taskmatch-2.0/pull/18) | [People matching](https://github.com/7YMERA/taskmatch-v2/wiki/People-Matching) |
| Phase 3c, 4: notifications, search, settings | Bell, approvals, Ctrl+K palette, CSV exports, Settings, Getting Started | [#19](https://github.com/7YMERA/taskmatch-2.0/pull/19) – [#24](https://github.com/7YMERA/taskmatch-2.0/pull/24), [#28](https://github.com/7YMERA/taskmatch-2.0/pull/28) | [3c](https://github.com/7YMERA/taskmatch-v2/wiki/Phase-3c-Notifications-and-Approvals), [Changelog](https://github.com/7YMERA/taskmatch-v2/wiki/Changelog#bell-and-ctrlk-polish) |
| Level 3: integrations | GitHub and Jira import, matcher calibration and auto-tune | [#27](https://github.com/7YMERA/taskmatch-2.0/pull/27) | [Level 3](https://github.com/7YMERA/taskmatch-v2/wiki/Level-3-Integrations) |

**v1 (the FYP) vs today**, on the same demo team. Every page, in both themes: **[v1 vs Now](https://github.com/7YMERA/taskmatch-v2/wiki/v1-vs-Now)**.

| v1 (FYP) | Today |
|---|---|
| ![Dashboard, v1](https://raw.githubusercontent.com/wiki/7YMERA/taskmatch-v2/images/v1/dashboard-dark.png) | ![Dashboard, today](https://raw.githubusercontent.com/wiki/7YMERA/taskmatch-v2/images/now/dashboard-light.png) |
| ![Tasks, v1](https://raw.githubusercontent.com/wiki/7YMERA/taskmatch-v2/images/v1/tasks-dark.png) | ![Tasks, today](https://raw.githubusercontent.com/wiki/7YMERA/taskmatch-v2/images/now/tasks-dark.png) |
| ![People, v1](https://raw.githubusercontent.com/wiki/7YMERA/taskmatch-v2/images/v1/people-dark.png) | ![People, today](https://raw.githubusercontent.com/wiki/7YMERA/taskmatch-v2/images/now/people-light.png) |

| Notifications | Ctrl+K search |
|---|---|
| ![Notifications](https://raw.githubusercontent.com/wiki/7YMERA/taskmatch-v2/images/bell-palette/after-bell-dark.png) | ![Command palette](https://raw.githubusercontent.com/wiki/7YMERA/taskmatch-v2/images/bell-palette/after-palette-search-light.png) |

How the two AI assistants (Claude and Kiro) split the work is in their notes on the Wiki:
[Claude notes](https://github.com/7YMERA/taskmatch-v2/wiki/Claude-Notes) and [Kiro notes](https://github.com/7YMERA/taskmatch-v2/wiki/Kiro-Notes).

---

## How matching works

1. A lead creates a task and tags the skills it needs.
2. The API scores every person against those skills, using the level they hold for each.
3. People who are already at the work-in-progress limit (3 active tasks) are left out.
4. Each person gets a fit score out of 100: skills (45), proven experience from finished work
   (20), availability (20) and track record (15). The app always shows the four parts, and a
   workspace can retune the weights from real outcomes. A strong member can be paired with a
   learner so skills spread.
5. The lead assigns from the list, or lets TaskMatch pick by mode:

| Mode | Who it picks |
|---|---|
| Best match | Top of the ranked list |
| Round robin | Whoever has gone longest without a new task |
| Least loaded | Fewest committed hours on active tasks |

Completed work is scored for efficiency, and a task that is still unfinished 7 days
past its due date is closed and locked automatically.

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | [Next.js 16](https://nextjs.org) (App Router), React 19, TypeScript, Tailwind CSS v4 |
| Backend | [FastAPI](https://fastapi.tiangolo.com) (Python 3.11+), Pydantic |
| Database and auth | [Supabase](https://supabase.com) (Postgres, Auth, Storage) with row-level security |
| Testing and CI | pytest, TypeScript type-check, ESLint, GitHub Actions |
| Hosting | Vercel for the frontend, Render for the API ([live demo](https://taskmatch-umber.vercel.app)) |

## Repository layout

```
taskmatch/        Next.js frontend (pages in app/, design system in app/components/ui.tsx)
taskmatch-api/    FastAPI matching and task engine (main.py) with its tests
supabase/         Database scripts, run in order (see "The database" below)
.github/          CI workflow
```

Release write-ups, screenshots, the roadmap and the assistants' notes live on the
[Wiki](https://github.com/7YMERA/taskmatch-v2/wiki/), not in the code.

---

## Running it locally

You need **Node.js 20+**, **Python 3.11+** and a free **Supabase** project.

### 1. The API

```bash
cd taskmatch-api
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # then fill in your Supabase values
uvicorn main:app --reload --port 8000
```

Interactive API docs are at http://localhost:8000/docs. Every environment variable and
endpoint is explained in [taskmatch-api/README.md](taskmatch-api/README.md).

### 2. The database

In the Supabase SQL Editor, run [`supabase/rls.sql`](supabase/rls.sql) once to switch on
row-level security. Set `SUPABASE_SERVICE_ROLE_KEY` for the API first, because the API's
queries rely on it.

Then run [`supabase/roles.sql`](supabase/roles.sql) once. It moves every account's role to a place
only the server can change (existing leaders become admins, everyone else members), adds the
"away" date, and sets the database rules for each role.

Then run [`supabase/workspaces.sql`](supabase/workspaces.sql) once. It adds workspaces and
projects. Everything you already have goes into one workspace called "My team", and every
existing account joins it with the role it has now. Admins rename it, send invite links and
change roles on the **Members & roles** page. New accounts create their own workspace or join
one with an invite link.

Then run these once, in this order:
[`supabase/notifications.sql`](supabase/notifications.sql) (notification bell and approvals),
[`supabase/integrations.sql`](supabase/integrations.sql) (GitHub and Jira import),
[`supabase/matcher_weights.sql`](supabase/matcher_weights.sql) (tuned matcher weights) and
[`supabase/storage_avatars.sql`](supabase/storage_avatars.sql) (profile picture uploads).

Optional: run [`supabase/demo-data.sql`](supabase/demo-data.sql) to make a fresh install look lived
in. It names the workspace, adds projects and files your tasks into them, gives open tasks to the
best-matching people, and adds a second workspace so the switcher has somewhere to go. Then run
[`supabase/demo-data-more.sql`](supabase/demo-data-more.sql) for a fuller task list: about 50 more
tasks, two months of finished work for the dashboard trends, and comments.

### 3. The frontend

Create `taskmatch/.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-key
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Then:

```bash
cd taskmatch
npm install
npm run dev
```

Open http://localhost:3000.

### Tests

```bash
cd taskmatch-api
pip install -r requirements-dev.txt
python -m pytest
```

CI runs the backend tests, the frontend type-check and lint on every push and pull request.

> Never commit `.env` or `.env.local`. Both are git-ignored, and the service-role key
> must only ever live on the server.

---

## Roadmap

The full plan is in [Roadmap](https://github.com/7YMERA/taskmatch-v2/wiki/Roadmap) on the Wiki. In short:

**Level 1: production-grade** ✅ done. Security, validation, tests, CI with blocking lint, a
detailed `/health` check, storage policies and docs are all in.

**Feature overhaul**, one phase per pull request, each with before/after screenshots:

| Phase | Scope | Status |
|---|---|---|
| 1 | Dashboards, analytics and assignment modes | ✅ done |
| 1b, 1c | Tasks and People pages rebuilt (views, saved filters, skills matrix, quick views) | ✅ done |
| 2 | Roles and permissions, audit trail, user management, "away" status | ✅ done |
| 3, 3b | Suggested skills, hours and severity (always confirmed by a person); workspaces and projects | ✅ done |
| 3d | People page and smarter matching: explainable fit score, proven skills, team insights | ✅ done |
| 3c | Notifications and approvals | ✅ done |
| 4 | Ctrl+K search, exports, settings, onboarding | ✅ done |

**Level 2: smarter matching.** Skill evidence from completed tasks, skill decay over
time, hours as well as a task limit, and an explainable, tunable score are in (see
[People matching](https://github.com/7YMERA/taskmatch-v2/wiki/People-Matching)). Per-person capacity is next.

**Level 3: a product.** Multiple teams, GitHub and Jira import, and a matcher that proposes new
weights from real outcomes are in (see [Level 3](https://github.com/7YMERA/taskmatch-v2/wiki/Level-3-Integrations)). Next: more
importers, scheduled re-sync, and design-system cleanup of the last few pages.

---

## Credits

Built by [@7YMERA](https://github.com/7YMERA). TaskMatch began as a Final Year Project at
Universiti Teknologi PETRONAS; 2.0 continues it independently, with AI coding assistants
used as pair programmers along the way.
