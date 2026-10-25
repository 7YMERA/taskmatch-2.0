# TaskMatch 2.0: Phase 1c, My Tasks and quick views (before / after)

Phase 1c of the feature overhaul, done before roles at the owner's request. My Tasks becomes a
personal focus page, and Tasks and People get side panels, so checking or changing something no
longer means leaving the list you were working in.

No database or API changes were needed.

## What changed

### My Tasks (`app/my-tasks/page.tsx`)

- A greeting and one line on where you stand: in progress, up next, due this week, overdue.
- **At a glance**: how full your plate is (with the limit of 3), what's due this week, what you
  finished in the last 30 days, and your on-time rate.
- **In progress**: each running task shows a live timer, a due countdown ("Due in 2d",
  "5d overdue") and a budget bar comparing time so far with the committed hours. After a day the
  timer switches to days and hours and asks if you're still working on it.
- **Up next**: assigned but not started, soonest due first, with Start.
- **Done**: finished work for the last 30 days or all time, each marked on time or late.
- **Mark complete** opens a proper dialog instead of a browser prompt: it shows the timer and the
  budget side by side and fills either in with one tap.
- **Your last 8 weeks**: tasks finished per week, split into on time, late and no due date.
- **Suggested for you**: open tasks that fit your skills, with Pick up, right on the page.
- **Team deadlines**: what your group is working on, soonest first, in a compact list.

### Tasks (`app/tasks/page.tsx`, `app/components/TaskQuickView.tsx`)

- Clicking a task in the list, on the board or in the calendar opens a **quick view** panel:
  status, severity, dates, hours, group, required skills, who's on it and the latest comments.
- Leads **edit those fields in place**. Each change saves straight away and is written to the
  activity log with its old and new value.
- **New task** opens in a side panel instead of pushing the list down.
- Ctrl-click (Cmd-click on a Mac) still opens the full task page. The open panel is kept in the
  address (`?open=…`), so it can be shared.

### People (`app/students/page.tsx`, `app/components/PersonQuickView.tsx`)

- A new **Cards** layout next to Roster and Skills matrix: avatar, group, workload meter, what
  they're on now, their top skills with level bars, and (for leads) their average score.
- Clicking a name opens a **person quick view**: workload, finished count, score or on-time rate,
  current tasks, every skill with its level, and recently finished work marked on time or late.

### Shared

- `Drawer` in `app/components/ui.tsx`: a right-hand panel that closes on Esc or a click outside,
  and respects reduced-motion settings.

## Screens

All screenshots use the same seeded demo data, at 1440×900. My Tasks is shown as a member.

### My Tasks

| | Before | After |
|---|---|---|
| Dark | ![](screenshots/phase1c/before-my-tasks-dark.png) | ![](screenshots/phase1c/after-my-tasks-dark.png) |
| Light | ![](screenshots/phase1c/before-my-tasks-light.png) | ![](screenshots/phase1c/after-my-tasks-light.png) |

### Completing a task

| Dark | Light |
|---|---|
| ![](screenshots/phase1c/after-my-tasks-complete-dark.png) | ![](screenshots/phase1c/after-my-tasks-complete-light.png) |

### New task

| | Before | After |
|---|---|---|
| Dark | ![](screenshots/phase1c/before-tasks-new-dark.png) | ![](screenshots/phase1c/after-tasks-new-dark.png) |
| Light | ![](screenshots/phase1c/before-tasks-new-light.png) | ![](screenshots/phase1c/after-tasks-new-light.png) |

### Task quick view (new)

| Dark | Light |
|---|---|
| ![](screenshots/phase1c/after-tasks-quick-dark.png) | ![](screenshots/phase1c/after-tasks-quick-light.png) |

### People: cards (new)

| | Before (roster) | After (cards) |
|---|---|---|
| Dark | ![](screenshots/phase1c/before-students-dark.png) | ![](screenshots/phase1c/after-students-cards-dark.png) |
| Light | ![](screenshots/phase1c/before-students-light.png) | ![](screenshots/phase1c/after-students-cards-light.png) |

### Person quick view (new)

| Dark | Light |
|---|---|
| ![](screenshots/phase1c/after-students-quick-dark.png) | ![](screenshots/phase1c/after-students-quick-light.png) |

## Known limits

- Quick-view edits are open to anyone the app shows as a lead. Proper role checks in the
  database come with Phase 2.
- The weekly chart counts tasks by the day you finished them, not when they were due.
