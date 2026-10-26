# TaskMatch 2.0 — Visual Changelog

Every release of TaskMatch 2.0, newest first, compared with what came before it. The very first
"before" is the original Final Year Project ([`taskmatch-git`](https://github.com/7YMERA/taskmatch-git)).
Each entry links to its pull request and to a full write-up with more screenshots in light and dark.

| Release | What changed | PRs | Write-up |
|---|---|---|---|
| [Bell and Ctrl+K polish](#bell-and-ctrlk-polish) | Notification panel opens on screen, grouped, with icons; palette scrolls, ranks and highlights | #28 | this page |
| [Review fixes + Level 3 merged](#review-fixes-and-level-3) | Approvals hardened, Jira hosts limited, GitHub/Jira import and matcher auto-tune shipped | #27 | [PHASE-LEVEL3.md](PHASE-LEVEL3.md) |
| [Phase 4: search, settings, exports](#phase-4-search-settings-exports-onboarding) | Ctrl+K palette, Settings page, CSV exports, Getting Started checklist | #24 | [KIRO-NOTES.md](KIRO-NOTES.md) |
| [Phase 3c: notifications and approvals](#phase-3c-notifications-and-approvals) | Notification bell, approvals inbox for critical tasks | #21, #22 | [PHASE3C-NOTIFICATIONS.md](PHASE3C-NOTIFICATIONS.md) |
| Level 1 finished | Detailed `/health`, blocking lint in CI, no failing Vercel previews | #19, #20 | [ROADMAP.md](ROADMAP.md) |
| [People page and smarter matching](#people-page-and-smarter-matching) | Fit score out of 100 with its reasons, proven skills, Team insights, Find a match | #18 | [PEOPLE-MATCHING.md](PEOPLE-MATCHING.md) |
| Demo data | A lived-in demo workspace, a second workspace, two months of history | #13 – #17 | [README](../README.md#2-the-database) |
| [Phase 3b: workspaces and projects](#phase-3b-workspaces-and-projects) | Multi-team like Jira: switcher, invite links, roles per workspace, projects | #12 | [PHASE3B-WORKSPACES.md](PHASE3B-WORKSPACES.md) |
| [Phase 3: suggestions for new tasks](#phase-3-suggestions-for-new-tasks) | Skills, hours and severity suggested with a confidence level; free by default | #10, #11 | [PHASE3-AI-ASSIST.md](PHASE3-AI-ASSIST.md) |
| [Phase 2: roles and audit trail](#phase-2-roles-and-audit-trail) | Admin / lead / member / viewer, Members & roles page, audit trail, away status | #9 | [PHASE2-ROLES-AUDIT.md](PHASE2-ROLES-AUDIT.md) |
| [Phase 1c: My Tasks and quick views](#phase-1c-my-tasks-and-quick-views) | Personal focus page, side-panel quick views, People cards | #8 | [PHASE1C-WORKSPACE.md](PHASE1C-WORKSPACE.md) |
| [Phase 1b: Tasks and People](#phase-1b-tasks-and-people) | List / board / calendar, saved views, bulk actions, skills matrix | #7 | [PHASE1B-TASKS-PEOPLE.md](PHASE1B-TASKS-PEOPLE.md) |
| [Phase 1: dashboard](#phase-1-dashboard) | KPI trends, needs attention, workload heatmap, skills coverage, auto-assign | #5 | [PHASE1-DASHBOARD.md](PHASE1-DASHBOARD.md) |
| [Modern redesign](#modern-redesign) | Neutral theme, one accent colour, light mode that works everywhere | #2, #4 | [REDESIGN.md](REDESIGN.md) |
| Security | Login on every endpoint, rate limiting, row-level security on every table | #1, #3 | [README](../README.md#old-vs-new-at-a-glance) |
| [First revamp vs the FYP](#first-revamp-vs-the-fyp) | Login, landing and dashboard against the original project | — | below |

---

## Bell and Ctrl+K polish

**Notification bell.** It used to sit in a crowded footer row, and its panel opened downward off
the bottom of the screen and spilled out of the narrow sidebar, so most of it couldn't be seen. The
bell now sits next to the logo. Its panel is placed on screen wherever the bell is, and shows:

- an icon and colour for each kind of notification (assigned, completed, approval requested, approved, rejected)
- **Today** and **Earlier** groups, an **All / Unread** switch, and a "3 new" count
- unread rows tinted with a dot, plus links to **Open approvals** (leaders) and **Notification settings**
- Esc to close; opening one marks it read straight away

| Before | After |
|---|---|
| ![Bell before, dark](screenshots/bell-palette/before-bell-dark.png) | ![Bell after, dark](screenshots/bell-palette/after-bell-dark.png) |
| ![Bell before, light](screenshots/bell-palette/before-bell-light.png) | ![Bell after, light](screenshots/bell-palette/after-bell-light.png) |

**Ctrl+K palette.** Moving with the arrow keys used to leave the highlighted row out of sight, the
search box showed a heavy focus outline, Windows users were shown ⌘ instead of Ctrl, and every task
had the same grey tick. Now:

- the highlighted row stays in view, and the arrow keys wrap around at the ends
- results are ranked (starts with, then word starts with, then anywhere) and the matched text is highlighted
- tasks show a coloured status tag, projects their key, and each group has its own icon colour
- groups are **Go to**, **Create**, **Tasks**, **People**, **Projects** and **Export**
- the shortcut reads **Ctrl K** on Windows and **⌘ K** on a Mac
- data reloads each time the palette opens, so new tasks show up without refreshing the page
- a search button in the mobile top bar opens it on phones

| Before | After |
|---|---|
| ![Palette search before, light](screenshots/bell-palette/before-palette-search-light.png) | ![Palette search after, light](screenshots/bell-palette/after-palette-search-light.png) |
| ![Palette before, dark](screenshots/bell-palette/before-palette-dark.png) | ![Palette after, dark](screenshots/bell-palette/after-palette-dark.png) |

---

## Review fixes and Level 3

No visual change. The Level 3 work (GitHub Issues and Jira import, matcher calibration and
auto-tune, on the **Integrations** page) was merged into `main`. Approvals were made safer: members
only see their own requests, a critical-task request can't carry a hand-made payload, and a request
can only be decided once. Jira import only talks to `*.atlassian.net`. See
[CLAUDE-NOTES.md](CLAUDE-NOTES.md#review-of-kiros-work-since-18-written-2026-10-26).

---

## Phase 4: search, settings, exports, onboarding

New in Phase 4, so there is no "before". **Settings** holds the theme, the notification check
(on or off, and how often), your workspace and a link to your profile. Exports and the Getting
Started checklist live in the palette and on the dashboard.

| Dark | Light |
|---|---|
| ![Settings, dark](screenshots/bell-palette/new-settings-dark.png) | ![Settings, light](screenshots/bell-palette/new-settings-light.png) |

---

## Phase 3c: notifications and approvals

New in Phase 3c. When a member asks to take a **Critical** task, it waits here for a team lead or
admin to approve or reject it, and the member is told either way.

| Dark | Light |
|---|---|
| ![Approvals, dark](screenshots/bell-palette/new-approvals-dark.png) | ![Approvals, light](screenshots/bell-palette/new-approvals-light.png) |

---

## People page and smarter matching

| Before | After |
|---|---|
| ![People before](screenshots/people-matching/before-people-light.png) | ![People after](screenshots/people-matching/after-people-light.png) |
| ![Quick view before](screenshots/people-matching/before-quickview-dark.png) | ![Team insights](screenshots/people-matching/after-insights-dark.png) |

---

## Phase 3b: workspaces and projects

| Before | After |
|---|---|
| ![Switcher before](screenshots/phase3b/before-switcher-dark.png) | ![Switcher after](screenshots/phase3b/after-switcher-dark.png) |
| ![Members before](screenshots/phase3b/before-members-light.png) | ![Members after](screenshots/phase3b/after-members-light.png) |

---

## Phase 3: suggestions for new tasks

| Before | After |
|---|---|
| ![New task before](screenshots/phase3/before-newtask-light.png) | ![New task after](screenshots/phase3/after-newtask-light.png) |

---

## Phase 2: roles and audit trail

| Before | After |
|---|---|
| ![Activity log before](screenshots/phase2/before-logs-dark.png) | ![Audit trail after](screenshots/phase2/after-audit-dark.png) |
| ![Students before](screenshots/phase2/before-students-light.png) | ![Members & roles](screenshots/phase2/after-team-light.png) |

---

## Phase 1c: My Tasks and quick views

| My Tasks | Complete dialog |
|---|---|
| ![My Tasks](screenshots/phase1c/after-my-tasks-light.png) | ![Complete dialog](screenshots/phase1c/after-my-tasks-complete-dark.png) |

---

## Phase 1b: Tasks and People

| Before | After |
|---|---|
| ![Tasks before](screenshots/phase1b/before-tasks-light.png) | ![Tasks after](screenshots/phase1b/after-tasks-light.png) |
| ![Students before](screenshots/phase1b/before-students-dark.png) | ![Skills matrix](screenshots/phase1b/after-students-matrix-dark.png) |

---

## Phase 1: dashboard

| Before | After |
|---|---|
| ![Dashboard before](screenshots/phase1/before-dashboard-dark.png) | ![Dashboard after](screenshots/phase1/after-dashboard-dark.png) |
| ![Workload before](screenshots/phase1/before-workload-light.png) | ![Workload after](screenshots/phase1/after-workload-light.png) |

---

## Modern redesign

| Before | After |
|---|---|
| ![Dashboard before](screenshots/redesign/before-dashboard-light.png) | ![Dashboard after](screenshots/redesign/after-dashboard-light.png) |
| ![Sign up before](screenshots/redesign/before-signup-light.png) | ![Sign up after](screenshots/redesign/after-signup-light.png) |

---

## First revamp vs the FYP

The original project's pages next to the first 2.0 revamp, before the modern redesign.

| Page | Before (FYP) | After |
|---|---|---|
| Login | ![Login before](screenshots/before-login.png) | ![Login after](screenshots/after-login.png) |
| Landing | ![Landing before](screenshots/before-landing.png) | ![Landing after](screenshots/after-landing.png) |
| Dashboard | ![Dashboard before](screenshots/before-dashboard.png) | ![Dashboard after](screenshots/after-dashboard.png) |

> Screenshots from the redesign onwards are taken at 1440×900 against the same seeded data for
> "before" and "after", in both themes.
