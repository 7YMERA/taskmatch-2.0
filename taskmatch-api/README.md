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
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key — only for admin endpoints (`/accounts`, `/set-role`). Never expose to the browser. | no (those endpoints return 503 without it) |
| `CORS_ORIGINS` | Comma-separated allowed frontend origins, e.g. `https://taskmatch.vercel.app,http://localhost:3000`. **Unset = no cross-origin allowed.** Use `*` only to deliberately open the API. | recommended |

## Run

```bash
uvicorn main:app --reload --port 8000
```

Health check: `GET http://localhost:8000/health`
Interactive API docs: `http://localhost:8000/docs`

## Test

```bash
pip install -r requirements-dev.txt
python -m pytest
```

Tests cover the pure logic (score banding, SLA auto-close) and never touch the
database. CI runs them on every push (`.github/workflows/ci.yml`).

## Security notes

- Identity for `/assign`, `/self-assign`, `/start`, `/complete`, `/unassign`,
  `/set-role` comes from the **verified Supabase token**, never the request body.
- Request bodies are validated with typed schemas — bad input is rejected with a 422.
- Lock `CORS_ORIGINS` to your real frontend URL before deploying.

## Endpoints (overview)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | — | liveness |
| GET | `/recommend/{task_id}` | — | ranked students for a task |
| GET | `/recommend-tasks/{student_id}` | — | ranked tasks for a student |
| POST | `/assign` | leader | assign a student to a task |
| POST | `/self-assign` | user | pick up a task for yourself |
| POST | `/start` | user | start an assigned task |
| POST | `/complete` | user | complete + score an assignment |
| POST | `/unassign` | user | remove an assignment |
| GET | `/wip` | — | work-in-progress status |
| GET | `/student-stats` | — | per-student performance |
| GET | `/accounts` | leader | list accounts (needs service-role key) |
| POST | `/set-role` | leader | promote/demote (needs service-role key) |
