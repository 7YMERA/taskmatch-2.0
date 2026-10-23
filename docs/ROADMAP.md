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
| 3 | Lock CORS to known origins | any site could call the API | ☐ todo |
| 4 | Validate request bodies with typed schemas (Pydantic) | reject bad data at the door | ☐ todo |
| 5 | Handle DB/Supabase errors gracefully | no raw 500s | ☐ todo |
| 6 | Rate limiting | protect the free tier from abuse | ☐ todo |
| 7 | Test suite for the matcher + core logic | change code safely | ☐ todo |
| 8 | CI on every push (lint, type-check, tests) | catch breaks automatically | ☐ todo |
| 9 | API README + setup guide | a marker/dev can run it | ☐ todo |
| 10 | Structured logging + `/health` detail | see what the server is doing | ☐ todo |

**Order:** 3 + 4 + 5 together (server hardening) → 7 + 8 (safety net) → 6, 9, 10.

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
| Multi-team / multi-org | beyond one UTP class |
| Integrations (GitHub Issues, Jira) | real workflows |
| Outcome feedback loop retrains the matcher | learns from results |

---

## Known debt (tracked, not urgent)

- Old repo history still contains the public *publishable* Supabase key. Low-risk,
  but rotate it in Supabase if you want it gone for good.
- `role.ts` UI role-toggle is a testing aid; the server now ignores it (correct),
  but it should not reach production unchanged.
- Supabase client is created separately in ~8 frontend files — one shared helper.
- `taskmatch-api/main.py` is a single large file; split into modules as it grows.
- Frontend lint has legacy `any` types (`dashboard/page.tsx`, `SkillPicker.tsx`)
  and unused imports. CI runs lint as **advisory** until these are cleaned; make
  it blocking once fixed. Type-check and tests ARE blocking gates.
