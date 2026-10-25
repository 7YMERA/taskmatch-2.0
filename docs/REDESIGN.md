# TaskMatch 2.0 — Modern redesign (before / after)

This document records the October 2026 redesign of TaskMatch, page by page, in
both light and dark mode. Every "before" screenshot is the app at commit
`803b489`, and every "after" screenshot is the app on the `modern-redesign`
branch. Both sets were taken against the same live data, at the same 1440×900
window size.

## Why

The previous design had three problems:

1. **Light mode was broken in places.** Many pages hard-coded white text
   (`text-white/40` and similar). In light mode that text turned white-on-white
   and disappeared, as you can see in the sign-up form labels, the dashboard
   chart legends and the activity log. A CSS "bridge" was patching some cases,
   but not all of them.
2. **Too many colours.** A six-colour rainbow (indigo, violet, sky, emerald,
   amber and rose) was used on the wordmark, buttons, stat numbers, step cards
   and glows. Nothing stood out because everything was colourful.
3. **No single source of truth.** Accent colours were raw hex values, chosen
   for a dark background, so they were too pale to read on white.

## What changed

### Design system (`app/globals.css`, `app/components/ui.tsx`)
- **Neutral base and one brand colour.** Zinc-style greys carry the interface,
  and a single indigo `--tm-primary` is used for actions, focus and active
  states. Status colours only appear where they mean something (badges and
  charts).
- **Every colour is defined per theme.** Light mode gets its own deeper accent
  shades, such as `--tm-emerald: #047857` on light versus `#34d399` on dark, so
  text in an accent colour always stays readable.
- **Tokens are exposed to Tailwind** (`text-fg`, `text-muted`, `bg-surface`,
  `border-line`, `bg-primary-soft` and others), so pages never need a raw
  colour. The old "legacy bridge" overrides were deleted.
- **Typography.** Geist Sans and Geist Mono are loaded through `next/font`,
  with tighter heading tracking and tabular numbers for stats.
- **The theme follows the operating system on the first visit**, then
  remembers the user's choice.
- **New shared pieces:** `Logo` (one SVG instead of four copies),
  `PageHeader`, `AuthShell` and `AuthBuffer` (sign-in and sign-up layout), a
  segmented control (`.tm-seg`), a table style (`.tm-table`) and a themed
  `promptDialog()` that replaces the browser's `window.prompt` for "Mark
  complete".

### Pages
- **Landing:** a new hero with a product preview that mocks the matching
  screen, a six-feature grid, a numbered "how it works" section, a "why"
  section, a roadmap list and a solid brand call-to-action. The placeholder
  team section ("Add your name") was removed.
- **Sign in and sign up:** a split layout, with the form on the left and a
  product panel on the right. Both have proper labels, autocomplete hints,
  inline validation and a clearer demo-account button. Sign-up previously
  ignored the theme entirely.
- **App shell:** the sidebar has a "Workspace" section label, an active state
  that tints the icon, a "Preview as" segmented control, and a compact profile
  row with theme and sign-out icon buttons.
- **Dashboard:** a page description, segmented tabs, calmer stat tiles (a
  neutral number with a small coloured dot), chart colours taken from the
  theme, and slim progress bars.
- **Activity log:** a search field with an icon, filter pills with counts, a
  styled table, badges and proper empty states.
- **Tasks, Students, detail pages, My Tasks and Profile:** moved onto brand
  tokens for avatars, checkboxes and selected states. The "complete task"
  prompt is now a styled dialog.

### Housekeeping
- `next.config.ts` pins `turbopack.root`, because a stray lockfile in the home
  folder was making Next pick the wrong root and serve stale CSS. The config
  also hides the dev-mode indicator.

---

## Screens

Each row shows **before** on the left and **after** on the right.

### Landing

| | Before | After |
|---|---|---|
| Dark | ![](screenshots/redesign/before-landing-dark.png) | ![](screenshots/redesign/after-landing-dark.png) |
| Light | ![](screenshots/redesign/before-landing-light.png) | ![](screenshots/redesign/after-landing-light.png) |

### Sign in

| | Before | After |
|---|---|---|
| Dark | ![](screenshots/redesign/before-login-dark.png) | ![](screenshots/redesign/after-login-dark.png) |
| Light | ![](screenshots/redesign/before-login-light.png) | ![](screenshots/redesign/after-login-light.png) |

### Sign up

In the "before" light-mode shot, the labels and helper text are invisible.

| | Before | After |
|---|---|---|
| Dark | ![](screenshots/redesign/before-signup-dark.png) | ![](screenshots/redesign/after-signup-dark.png) |
| Light | ![](screenshots/redesign/before-signup-light.png) | ![](screenshots/redesign/after-signup-light.png) |

### Dashboard

In the "before" light-mode shot, the chart legends, subtitles and counts are
missing.

| | Before | After |
|---|---|---|
| Dark | ![](screenshots/redesign/before-dashboard-dark.png) | ![](screenshots/redesign/after-dashboard-dark.png) |
| Light | ![](screenshots/redesign/before-dashboard-light.png) | ![](screenshots/redesign/after-dashboard-light.png) |

### Tasks

| | Before | After |
|---|---|---|
| Dark | ![](screenshots/redesign/before-tasks-dark.png) | ![](screenshots/redesign/after-tasks-dark.png) |
| Light | ![](screenshots/redesign/before-tasks-light.png) | ![](screenshots/redesign/after-tasks-light.png) |

### Task detail

| | Before | After |
|---|---|---|
| Dark | ![](screenshots/redesign/before-tasks-detail-dark.png) | ![](screenshots/redesign/after-tasks-detail-dark.png) |
| Light | ![](screenshots/redesign/before-tasks-detail-light.png) | ![](screenshots/redesign/after-tasks-detail-light.png) |

### Students

| | Before | After |
|---|---|---|
| Dark | ![](screenshots/redesign/before-students-dark.png) | ![](screenshots/redesign/after-students-dark.png) |
| Light | ![](screenshots/redesign/before-students-light.png) | ![](screenshots/redesign/after-students-light.png) |

### Student detail

| | Before | After |
|---|---|---|
| Dark | ![](screenshots/redesign/before-students-detail-dark.png) | ![](screenshots/redesign/after-students-detail-dark.png) |
| Light | ![](screenshots/redesign/before-students-detail-light.png) | ![](screenshots/redesign/after-students-detail-light.png) |

### My Tasks

| | Before | After |
|---|---|---|
| Dark | ![](screenshots/redesign/before-my-tasks-dark.png) | ![](screenshots/redesign/after-my-tasks-dark.png) |
| Light | ![](screenshots/redesign/before-my-tasks-light.png) | ![](screenshots/redesign/after-my-tasks-light.png) |

### Profile

| | Before | After |
|---|---|---|
| Dark | ![](screenshots/redesign/before-profile-dark.png) | ![](screenshots/redesign/after-profile-dark.png) |
| Light | ![](screenshots/redesign/before-profile-light.png) | ![](screenshots/redesign/after-profile-light.png) |

### Activity log

In the "before" light-mode shot, the description, filters and every table cell
except the action badges are invisible.

| | Before | After |
|---|---|---|
| Dark | ![](screenshots/redesign/before-logs-dark.png) | ![](screenshots/redesign/after-logs-dark.png) |
| Light | ![](screenshots/redesign/before-logs-light.png) | ![](screenshots/redesign/after-logs-light.png) |

---

## How the screenshots were made

1. Check out the old commit in a separate folder and run it on
   `localhost:3000`. Use the same port so the signed-in session carries over.
2. Drive a separate Edge profile over the Chrome DevTools Protocol. For every
   page, set `localStorage['tm-theme']` to `dark` and then `light`, reload,
   and capture a 1440×900 image.
3. Switch back to the new branch and repeat.
