# Level 3 — Integrations & matcher feedback loop

This level turns TaskMatch from "a tool my team uses" into "a tool that connects to the rest of
the stack and gets smarter from its own results". Three things: import work from **GitHub** and
**Jira**, measure how well the matcher **predicts outcomes** (calibration), and let a leader
**re-tune the matcher's weights** from that evidence.

Everything is workspace-scoped and follows the same roles (admin / lead / member / viewer).
All of it lives on one page: **Integrations** (`/integrations`, sidebar + ⌘K palette, leaders only).

---

## 1. Import work — GitHub Issues & Jira

Both importers work the same way: **Preview → pick → Import**, and an issue already imported into
this workspace is skipped so you never get duplicates.

### GitHub
- Enter **owner** + **repo** (e.g. `7YMERA` / `taskmatch-2.0`), optional **token** (for private
  repos or higher rate limits — not stored).
- Preview fetches open issues (pull requests are filtered out). Each issue shows a suggested
  **severity**, mapped from its labels (`critical`/`security`/`p0` → Critical, `high`/`p1` → High,
  `low`/`minor`/`p3` → Low, else Medium).
- Import creates one task per picked issue.

### Jira (Atlassian Cloud)
- Enter **site** (`yourco.atlassian.net`), your Jira **email** + an **API token**
  (create at id.atlassian.com → Security → API tokens), optional **project key** (e.g. `TM`).
- Preview fetches issues via Jira's REST search. Severity is mapped from the issue's **priority**
  (Highest/Blocker → Critical, High/Major → High, Low/Minor/Lowest/Trivial → Low, else Medium).
- Import creates one task per picked issue.

### How dedupe works (both)
Each imported task stores where it came from:
- `external_source` — `'github'` or `'jira'`
- `external_ref` — the issue's URL (unique per workspace)

A re-import checks these and skips anything already brought in. These two columns are added by
`supabase/integrations.sql` (run once in the Supabase SQL Editor). **The importers still work
without the columns** — they just can't remember what was imported, so run the SQL to get dedupe.

### API
| Endpoint | Permission | Does |
|---|---|---|
| `POST /import/github/preview` | tasks.manage | fetch GitHub issues (not yet imported) |
| `POST /import/github/commit` | tasks.manage | create tasks from chosen issues |
| `POST /import/jira/preview` | tasks.manage | fetch Jira issues (not yet imported) |
| `POST /import/jira/commit` | tasks.manage | create tasks from chosen issues |

---

## 2. Matcher calibration — does the matcher actually work?

The matcher predicts who fits a task. Calibration asks the honest question back: **when we
required a higher skill level, did the task actually turn out better?**

`GET /matcher/calibration` (insights.view) looks at every completed, scored assignment, pairs the
task's required skill level with the score it earned, and reports a **Pearson correlation** per
skill and overall, plus a plain verdict:

- correlation ≥ 0.3 → "lines up well"
- correlation ≤ −0.3 → "tracking LOWER — worth reviewing"
- in between → "weak so far — more finished work will sharpen this"
- < 3 scored tasks → "not enough finished work yet"

It only *measures*. It changes nothing. Logic is the pure function `matching.calibration()`,
unit-tested in `test_calibration.py`.

---

## 3. Matcher auto-tune — re-balance the weights from outcomes

The fit score is the sum of four parts, each with a weight that adds to 100:

| Part | Default weight | What it measures |
|---|---|---|
| Skills | 45 | has the required skills at the required level |
| Experience | 20 | has *used* those skills on finished work |
| Availability | 20 | has room (slots + hours) |
| Record | 15 | finished on time, good average score |

Auto-tune proposes **new weights** that lean toward whichever parts actually predicted the real
outcome. It is **off by default and never silent**:

- `GET /matcher/weights` (insights.view) → the active weights, the default, and a **suggestion**
  with the per-factor diff.
- `POST /matcher/weights` (tasks.manage) → apply a set of weights for this workspace. Validated
  (must have all four keys, non-negative, sum to 100) and audit-logged.
- A leader reviews the suggestion on `/integrations` and clicks **Apply** (or **Reset to default**).
  Only then do rankings change.

### How the suggestion is computed (`matching.suggest_weights`)
- For every completed, scored assignment, recompute the four fit factors for that person on that
  task, and pair each factor's 0–1 value with the real score.
- Pearson-correlate each factor with the score. A factor that tracked the outcome earns more
  "trust"; one that didn't keeps a small neutral trust (so it is never dropped).
- Blend the current weights 50/50 with the evidence-trust, scale back to a total of 100, and floor
  every factor at **5** (`WEIGHT_FLOOR`) so no part is ever zeroed.
- Needs at least **8** completed+scored tasks (`MIN_TUNE_SAMPLES`); below that it returns the
  current weights and says so.

### Where it's stored
One `matcher_weights` row per workspace (JSONB), created by `supabase/matcher_weights.sql`.
**No row = default weights.** `rank_people()` calls `load_active_weights()` and passes them into
`fit(..., weights=...)`, so applying new weights changes `/recommend`, `/auto-assign` and
`/match/people` together — they can never disagree. Without the SQL table the API still serves
defaults and suggestions; applying returns a clear 409 asking the user to run the SQL first.

Logic is pure and tested in `test_autotune.py` (`suggest_weights`, `set_weights`, floor/total
invariants).

### Why human-applied, not automatic
Auto-applying would silently re-rank everyone on thin data. A class or small team doesn't have the
volume for safe continuous retraining, so the safe design is: measure, propose, let a human decide.
Continuous auto-tune is the natural future extension once there's far more completed-task data.

---

## Schema to run (Supabase SQL Editor, after the earlier scripts)
| File | Adds | Needed for |
|---|---|---|
| `supabase/integrations.sql` | `tasks.external_source`, `tasks.external_ref` + unique index | import dedupe (GitHub **and** Jira) |
| `supabase/matcher_weights.sql` | `matcher_weights` table + RLS | persisting applied matcher weights |

Both are safe to re-run, and the API degrades gracefully if they haven't been run yet.

## Tests
- `test_calibration.py` — calibration correlation + verdicts.
- `test_autotune.py` — weight suggestion (total/floor invariants), `set_weights` validation.
- `test_security.py` — all Level 3 endpoints reject anonymous callers; `matcher_weights` is a
  workspace-scoped table.
Full backend suite: **172 tests pass**.

## Ideas for the next pass
- More importers (Linear, Trello, GitHub Projects).
- Scheduled re-sync of imported issues (status/closed changes flow back).
- Continuous auto-tune once there's enough completed-task data to do it safely.
