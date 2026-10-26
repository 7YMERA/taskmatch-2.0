# TaskMatch API

The matching + task engine for TaskMatch. Scores students against a task's
required skills, caps work-in-progress, pairs a strong member with a learner,
and auto-closes overdue tasks. FastAPI + Supabase (Postgres + auth).

## Requirements

- Python **3.11+** (the code uses `float | None` type syntax)
- A Supabase project (URL + keys)

## Setup

```bash
cd taskmatch-api
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Copy the env template and fill it in:

```bash
cp .env.example .env
```

| Variable | What it is | Required |
|---|---|---|
| `SUPABASE_URL` | Your project URL | yes |
| `SUPABASE_KEY` | Publishable (anon) key — used for normal reads/writes | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key. Used for all table queries (so the API works under row-level security, see `supabase/rls.sql`) and for the admin endpoints (`/accounts`, `/set-role`). Never expose to the browser. | yes once RLS is on (without it, table queries use `SUPABASE_KEY` and the admin endpoints return 503) |
| `CORS_ORIGINS` | Comma-separated allowed frontend origins, e.g. `https://taskmatch.vercel.app,http://localhost:3000`. **Unset = no cross-origin allowed.** Use `*` only to deliberately open the API. | recommended |
| `RATE_LIMIT_PER_MINUTE` | Max requests per client IP per minute (default `120`, `0` = off). `/health` is never limited. | no |
| `ANTHROPIC_API_KEY` | Claude API key for AI assist (console.anthropic.com → API keys). Without it, suggestions come from the free built-in engine (`suggest_history.py`) instead. Never expose to the browser. | no |
| `AI_MODEL` | Claude model for AI assist (default `claude-opus-5-5`). | no |
| `AI_RATE_LIMIT_PER_MINUTE` | Suggestion requests per user per minute (default `10`). | no |
| `CAPACITY_HOURS` | Hours of active work one person can carry, for the fit score's availability part and Team insights (default `20`). | no |
| `EVIDENCE_HALF_LIFE_DAYS` | How fast proven experience fades: finished work counts half as much after this many days (default `180`). | no |

## Run

```bash
uvicorn main:app --reload --port 8000
```

Behind a reverse proxy (e.g. Render), start it with proxy headers on so the rate
limiter sees each visitor's real IP instead of the proxy's (otherwise everyone
shares one limit):

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips='*'
```

Health check: `GET http://localhost:8000/health`
Interactive API docs: `http://localhost:8000/docs`

## Test

```bash
pip install -r requirements-dev.txt
python -m pytest
```

Tests cover the pure logic (score banding, SLA auto-close) plus the access
controls (login required, rate limiting), and never touch the database. CI runs them on every push (`.github/workflows/ci.yml`).

## Security notes

- Identity for `/assign`, `/self-assign`, `/start`, `/complete`, `/unassign`,
  `/set-role` comes from the **verified Supabase token**, never the request body.
- Every endpoint except `/health` requires a valid Supabase login token
  (`Authorization: Bearer <access_token>`), including the read-only ones.
- Each client IP is rate-limited (`RATE_LIMIT_PER_MINUTE`, default 120/min); over
  the limit returns `429` with a `Retry-After` header. The limit is in memory, so
  it is per server process.
- Request bodies are validated with typed schemas — bad input is rejected with a 422.
- Lock `CORS_ORIGINS` to your real frontend URL before deploying.

## Endpoints (overview)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | — | liveness |
| GET | `/recommend/{task_id}` | user | everyone ranked for a task by fit score (0–100, with its four parts; see `matching.py`) |
| GET | `/recommend-tasks/{student_id}` | user | open tasks for a person, by fit score |
| POST | `/match/people` | user | everyone ranked for any skills and levels (+ optional description), same fit score |
| GET | `/people/insights` | user | load in hours, proven skills, skill coverage and risk, tasks nobody available can take |
| POST | `/assign` | admin, lead | assign a student to a task |
| POST | `/auto-assign` | admin, lead | pick and assign one person by mode: `best_match`, `round_robin` or `least_loaded` (`dry_run: true` previews the pick) |
| POST | `/self-assign` | admin, lead, member | pick up a task for yourself |
| POST | `/start` | the assignee, or admin/lead | start an assigned task |
| POST | `/complete` | the assignee, or admin/lead | complete + score an assignment |
| POST | `/unassign` | admin, lead | remove an assignment |
| GET | `/wip` | user | work-in-progress status |
| GET | `/student-stats` | user | per-student performance |
| GET | `/accounts` | admin, lead | members of the current workspace, with role and last sign-in (needs service-role key) |
| POST | `/set-role` | admin | set a member's role in the current workspace: `admin`, `lead`, `member` or `viewer`; refuses to remove the last admin |
| DELETE | `/workspaces/members/{user_id}` | admin, or yourself | remove someone from the current workspace, or leave it; not the last admin |
| GET | `/workspaces` | signed in | your workspaces, the open one and your role there (empty for a new account) |
| POST | `/workspaces` | signed in | create a workspace; you become its admin and it opens |
| POST | `/workspaces/switch` | a member of it | open another of your workspaces |
| PATCH | `/workspaces/current` | admin | rename the current workspace |
| GET, POST | `/workspaces/invites` | admin | list or create invite links (`role`, `days` 1–30, `max_uses` 1–500) |
| DELETE | `/workspaces/invites/{code}` | admin | revoke an invite link |
| GET | `/invites/{code}` | signed in | what an invite is for (workspace name, role, still valid) |
| POST | `/workspaces/join` | signed in | join with an invite code; never changes the role of someone already in |
| GET | `/ai/status` | user | which suggestion engine is on: `claude` or `history` (built-in) |
| POST | `/ai/suggest-task` | admin, lead | suggested skills, hours and severity for a task description, each with a confidence level; writes nothing (Claude with `ANTHROPIC_API_KEY`, otherwise the built-in engine) |

Every request runs inside one workspace: the one in the account's `app_metadata.workspace_id`
(written only by the server), checked against `workspace_members` on every request. Queries add
`workspace_id` automatically (`ScopedClient` in `main.py`), and a request from someone with no
workspace gets `409 no_workspace`. Roles are per workspace and come from `workspace_members`,
never from `user_metadata`, which users can edit about themselves. The permission table is `ROLE_PERMISSIONS` in
`main.py`; it matches `taskmatch/app/lib/permissions.json` (a test checks) and `supabase/roles.sql`.
