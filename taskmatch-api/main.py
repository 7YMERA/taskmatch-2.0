import os
import time
import logging
import secrets
from contextvars import ContextVar
from datetime import timedelta
from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from supabase import create_client
from collections import defaultdict, deque
from datetime import date, datetime, timezone

import ai
import suggest_history

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("taskmatch")

try:
    from dotenv import load_dotenv  # local dev: read taskmatch-api/.env (Render injects env vars directly)
    load_dotenv()
except Exception:
    pass

app = FastAPI()

# When the process started, and a version string — reported by /health so a dashboard
# or uptime monitor can see which build is live and how long it has been up.
APP_STARTED_AT = time.time()
APP_VERSION = os.environ.get("APP_VERSION") or os.environ.get("RENDER_GIT_COMMIT", "dev")[:12]


# ─── Rate limiting — per-client sliding window, in memory ───
# Caps how many requests one client (IP) can make per minute, so a script can't
# hammer the matcher (each /recommend call scans several whole tables) or brute-force
# tokens. In-memory is enough for a single server process; a multi-instance deploy
# would need a shared store (e.g. Redis) instead.
#
# Behind a proxy (Render), run uvicorn with --proxy-headers --forwarded-allow-ips='*'
# so request.client.host is the real visitor, not the proxy — otherwise every user
# shares one bucket.

class RateLimiter:
    """Sliding-window log: remember each client's recent request times, refuse once
    there are `limit` of them inside the last `window` seconds."""

    def __init__(self, limit, window=60.0):
        self.limit = limit
        self.window = window
        self._hits = defaultdict(deque)

    def hit(self, key, now=None):
        """Record one request for `key`. Returns None if allowed, otherwise the number
        of seconds until the client may retry. A limit of 0 or less disables limiting."""
        if self.limit <= 0:
            return None
        now = time.monotonic() if now is None else now
        cutoff = now - self.window
        hits = self._hits[key]
        while hits and hits[0] <= cutoff:
            hits.popleft()
        if len(hits) >= self.limit:
            return max(hits[0] + self.window - now, 0.0)
        hits.append(now)
        if len(self._hits) > 10_000:
            self._sweep(cutoff)
        return None

    def _sweep(self, cutoff):
        # Drop clients with no recent requests so memory can't grow without bound.
        for k in [k for k, h in self._hits.items() if not h or h[-1] <= cutoff]:
            del self._hits[k]


RATE_LIMIT_PER_MINUTE = int(os.environ.get("RATE_LIMIT_PER_MINUTE", "120"))  # 0 = off
rate_limiter = RateLimiter(RATE_LIMIT_PER_MINUTE, 60.0)
RATE_LIMIT_EXEMPT = {"/health"}  # the frontend's wake-up ping must always get through


# Registered BEFORE the CORS middleware so CORS wraps it: the 429 still carries CORS
# headers (the browser can read it) and preflight OPTIONS never counts against a client.
@app.middleware("http")
async def rate_limit(request: Request, call_next):
    if request.url.path in RATE_LIMIT_EXEMPT:
        return await call_next(request)
    client = request.client.host if request.client else "unknown"
    retry_after = rate_limiter.hit(client)
    if retry_after is not None:
        return JSONResponse(
            status_code=429,
            content={"detail": "Too many requests — please slow down and try again shortly."},
            headers={"Retry-After": str(int(retry_after) + 1)},
        )
    return await call_next(request)

# CORS_ORIGINS = comma-separated allowed origins (your deployed frontend URL,
# e.g. "https://taskmatch.vercel.app,http://localhost:3000").
# Locked down by default: if unset, NO cross-origin requests are allowed.
# Set it to "*" explicitly only if you truly want an open API (not recommended).
_origins = os.environ.get("CORS_ORIGINS", "").strip()
if _origins == "*":
    allow_origins = ["*"]
else:
    allow_origins = [o.strip() for o in _origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Request schemas — typed bodies so bad input is rejected at the door ───
# (actor identity is NEVER taken from the body — it comes from the verified token)

class AssignBody(BaseModel):
    task_id: str = Field(..., min_length=1)
    student_id: str = Field(..., min_length=1)

class SelfAssignBody(BaseModel):
    task_id: str = Field(..., min_length=1)

class StartBody(BaseModel):
    assignment_id: str = Field(..., min_length=1)

class UnassignBody(BaseModel):
    assignment_id: str = Field(..., min_length=1)

class CompleteBody(BaseModel):
    assignment_id: str = Field(..., min_length=1)
    actual_hours: float | None = Field(default=None, ge=0)

class AutoAssignBody(BaseModel):
    task_id: str = Field(..., min_length=1)
    mode: str = Field(..., pattern="^(best_match|round_robin|least_loaded)$")
    dry_run: bool = False  # true = preview the pick without assigning anyone

class SetRoleBody(BaseModel):
    user_id: str = Field(..., min_length=1)
    role: str = Field(..., pattern="^(admin|lead|member|viewer)$")

class SuggestTaskBody(BaseModel):
    description: str = Field(..., min_length=3, max_length=500)
    notes: str = Field(default="", max_length=2000)


# ─── Global error handling — no raw stack-trace 500s leak to clients ───

@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception):
    """Any unexpected error (e.g. a Supabase hiccup) becomes a clean 500 with a
    generic message. The real error is logged server-side for debugging."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Something went wrong on the server. Please try again."},
    )


# Supabase creds are loaded from the environment only — never hard-coded.
# Set SUPABASE_URL and SUPABASE_KEY in taskmatch-api/.env (local) or in your
# host's env vars (Render/AWS). See .env.example for the template.
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError(
        "SUPABASE_URL and SUPABASE_KEY must be set in the environment "
        "(copy taskmatch-api/.env.example to .env and fill it in)."
    )
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Admin client uses the secret/service-role key for privileged auth operations
# (listing accounts, changing roles). It is None until the key is configured, so those
# endpoints fail loudly with a 503 rather than silently misbehaving. NEVER expose this key
# to the browser — it bypasses row-level security.
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
admin = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) if SUPABASE_SERVICE_ROLE_KEY else None

if admin is None:
    logger.warning(
        "SUPABASE_SERVICE_ROLE_KEY is not set: table queries use the publishable key "
        "and will fail once row-level security is enabled (see supabase/rls.sql)."
    )


def raw_db():
    """Unscoped client. Uses the service-role key when configured so the API keeps working under
    row-level security; every endpoint checks the caller's login first, so the server, not the
    browser, is what holds the bypass. Only the workspace tables themselves use this directly."""
    return admin or supabase


# ─── Workspaces: every query is pinned to the caller's current workspace ───
# require_user() works out the caller's workspace and stores it here for the request. db() then
# hands out tables that add "workspace_id = <it>" to every select, update and delete, and stamp it
# on every insert, so an endpoint can't forget and read or change another workspace's rows.

_workspace = ContextVar("workspace", default=None)   # (workspace_id, role, user_id)

WORKSPACE_TABLES = {"students", "tasks", "assignments", "skills", "student_skills", "task_skills",
                    "groups", "task_comments", "activity_logs", "projects"}


class ScopedTable:
    def __init__(self, table, ws):
        self._t, self._ws = table, ws

    def select(self, *a, **k):
        return self._t.select(*a, **k).eq("workspace_id", self._ws)

    def insert(self, rows, *a, **k):
        if isinstance(rows, list):
            rows = [{**r, "workspace_id": self._ws} for r in rows]
        else:
            rows = {**rows, "workspace_id": self._ws}
        return self._t.insert(rows, *a, **k)

    def update(self, data, *a, **k):
        data = {key: v for key, v in data.items() if key != "workspace_id"}  # rows never move
        return self._t.update(data, *a, **k).eq("workspace_id", self._ws)

    def delete(self, *a, **k):
        return self._t.delete(*a, **k).eq("workspace_id", self._ws)


class ScopedClient:
    def __init__(self, client, ws):
        self._c, self._ws = client, ws

    def table(self, name):
        if name not in WORKSPACE_TABLES:
            raise RuntimeError(f"{name} is not a workspace table; use raw_db()")
        return ScopedTable(self._c.table(name), self._ws)


def current_workspace():
    ctx = _workspace.get()
    if not ctx or not ctx[0]:
        raise RuntimeError("No workspace for this request: call require_user() first")
    return ctx[0]


def db():
    """Tables of the caller's current workspace (see ScopedTable)."""
    return ScopedClient(raw_db(), current_workspace())


# ─── Auth helpers — every endpoint except /health requires a login ───

def _bearer(authorization):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    return authorization.split(" ", 1)[1].strip()


def memberships(user_id):
    """Every workspace the user belongs to, oldest first: [{workspace_id, role, ...}]."""
    return (raw_db().table("workspace_members").select("workspace_id, role, joined_at")
            .eq("user_id", user_id).order("joined_at").execute()).data or []


def resolve_workspace(user):
    """The workspace this user is working in and their role there. Their choice is kept in
    app_metadata.workspace_id (only the server writes it), but membership is checked every time,
    so someone removed from a workspace loses access at once. Falls back to their first
    workspace; (None, "none") if they have none yet."""
    rows = memberships(getattr(user, "id", None))
    wanted = (getattr(user, "app_metadata", None) or {}).get("workspace_id")
    pick = next((m for m in rows if m["workspace_id"] == wanted), rows[0] if rows else None)
    return (pick["workspace_id"], pick["role"]) if pick else (None, "none")


def require_user(authorization, need_workspace=True):
    """Verify the caller's Supabase access token and return the auth user. Also works out their
    current workspace for this request; without one, 409 (the app sends them to set one up)."""
    token = _bearer(authorization)
    try:
        res = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    if not res or not res.user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    user = res.user
    ws, role = resolve_workspace(user)
    _workspace.set((ws, role, getattr(user, "id", None)))
    if need_workspace and not ws:
        raise HTTPException(status_code=409, detail="no_workspace")
    return user


# ─── Roles and permissions ───
# Mirrors taskmatch/app/lib/permissions.json (a test keeps the two in step) and supabase/roles.sql.
# A role belongs to a membership: the same person can be an admin in one workspace and a viewer in
# another. It lives in workspace_members, which only the server writes. user_metadata (which
# a signed-in user can edit about themselves) is never trusted for it.

ROLES = ("admin", "lead", "member", "viewer")
ROLE_PERMISSIONS = {
    "tasks.manage":  {"admin", "lead"},
    "people.manage": {"admin", "lead"},
    "assign.others": {"admin", "lead"},
    "insights.view": {"admin", "lead"},
    "audit.view":    {"admin", "lead"},
    "team.manage":   {"admin"},
    "work.self":     {"admin", "lead", "member"},
    "comment":       {"admin", "lead", "member"},
    "away.self":     {"admin", "lead", "member"},
}


def role_of(user):
    """The user's role in the current workspace, from workspace_members. Not a member: "none",
    which has no permissions. app_metadata and user_metadata are never trusted for this."""
    ctx = _workspace.get()
    if not ctx or not ctx[0]:
        return "none"
    ws, caller_role, caller_id = ctx
    if getattr(user, "id", None) == caller_id:
        return caller_role
    rows = (raw_db().table("workspace_members").select("role")
            .eq("workspace_id", ws).eq("user_id", user.id).execute()).data
    role = rows[0]["role"] if rows else "none"
    return role if role in ROLES else "none"


def can(role, permission):
    return role in ROLE_PERMISSIONS.get(permission, set())


def require_permission(authorization, permission):
    """Caller must be signed in and hold the permission. Hiding a button in the UI is not
    security; this server-side check is the real gate for privileged actions."""
    user = require_user(authorization)
    if not can(role_of(user), permission):
        raise HTTPException(status_code=403, detail="Your role doesn't allow this.")
    return user


def require_assignee_or(authorization, student_id, permission="assign.others"):
    """Caller is the assignee themselves (with work.self) or holds `permission`.
    Returns (email, role)."""
    user = require_user(authorization)
    role = role_of(user)
    if can(role, permission):
        return user.email, role
    if can(role, "work.self"):
        me = db().table("students").select("id").eq("email", user.email).execute().data
        if me and me[0]["id"] == student_id:
            return user.email, role
    raise HTTPException(status_code=403, detail="You can only change your own assignments.")


def require_admin_client():
    if admin is None:
        raise HTTPException(
            status_code=503,
            detail="Admin key not configured on the server (set SUPABASE_SERVICE_ROLE_KEY).",
        )
    return admin


def actor_from_token(authorization):
    """Resolve the acting user's (email, role) from their verified Supabase token.

    This is the trusted source of identity for audit logging and permission
    checks — never read actor_email / actor_role from the request body, since a
    client can forge those. Returns (email, role)."""
    user = require_user(authorization)
    return user.email, role_of(user)


WIP_LIMIT = 3


@app.get("/health")
def health(deep: bool = False):
    """Liveness and readiness check.

    The default call is DB-free and cheap — the frontend pings it on load to wake the
    free-tier server before the user acts (avoids the cold-start error where a write
    lands but the proxy times out the response). It reports the build, how long the
    process has been up, and whether the service-role key is configured.

    Pass ?deep=1 for a readiness probe that also runs one cheap query against the
    database, so an uptime monitor can tell "process alive" from "can reach Supabase".
    """
    uptime = round(time.time() - APP_STARTED_AT, 1)
    body = {
        "ok": True,
        "status": "ok",
        "version": APP_VERSION,
        "uptime_seconds": uptime,
        "time": datetime.now(timezone.utc).isoformat(),
        "service_role_configured": admin is not None,
    }
    if deep:
        db_ok, db_error = True, None
        try:
            # Cheapest possible round-trip: ask for zero rows from a known table.
            (admin or supabase).table("students").select("id").limit(1).execute()
        except Exception as exc:  # noqa: BLE001 — report any DB failure, don't crash the probe
            db_ok, db_error = False, str(exc)[:200]
        body["database"] = {"ok": db_ok, **({"error": db_error} if db_error else {})}
        if not db_ok:
            body["ok"] = False
            body["status"] = "degraded"
            return JSONResponse(status_code=503, content=body)
    return body

# Performance-score bands (higher = better; score in 0..1)
def score_band(avg_score, completed_count):
    """Map an average score to a band. Unrated students (no completed
    scored tasks) are treated as 'learner' so they get growth pairings."""
    if not completed_count or avg_score is None:
        return "unrated"
    if avg_score >= 0.6:
        return "high"
    if avg_score >= 0.4:
        return "avg"
    return "low"


def now_iso():
    return datetime.now(timezone.utc).isoformat()


SLA_GRACE_DAYS = 7  # an unfinished task auto-closes (locks) this many days past its due date

def is_task_closed(due_date, status):
    """A task is 'closed' (SLA expired, locked) when it's still not completed and
    overdue by more than the grace window."""
    if status == "Completed" or not due_date:
        return False
    try:
        due = datetime.fromisoformat(due_date).date()
    except Exception:
        return False
    return (datetime.now(timezone.utc).date() - due).days > SLA_GRACE_DAYS


def log_activity(action, entity_type, entity_id=None, summary=None,
                 actor_email=None, actor_role=None, details=None):
    """Append one immutable row to activity_logs. Best-effort: never
    block the main operation if logging fails."""
    try:
        db().table("activity_logs").insert({
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "summary": summary,
            "actor_email": actor_email,
            "actor_role": actor_role,
            "details": details,
        }).execute()
    except Exception:
        pass


def compute_student_stats():
    """Return {student_id: {avg_score, completed_count, band}} for all students.
    avg_score is the mean of completed, scored assignments (None if unrated)."""
    assignments = (
        db().table("assignments")
        .select("student_id, score, status")
        .execute()
    ).data

    scores_by_student = defaultdict(list)
    for a in assignments:
        if a["status"] == "Completed" and a.get("score") is not None:
            scores_by_student[a["student_id"]].append(a["score"])

    students = (db().table("students").select("id").execute()).data
    stats = {}
    for s in students:
        scores = scores_by_student.get(s["id"], [])
        cnt = len(scores)
        avg = round(sum(scores) / cnt, 3) if cnt else None
        stats[s["id"]] = {"avg_score": avg, "completed_count": cnt, "band": score_band(avg, cnt)}
    return stats


# ─── Core matching algorithm ───────────────────────────────────

def score_candidates(task_id):
    """Score every student against one task (flag, don't filter). Shared by /recommend
    and /auto-assign so the ranked list and the automatic pick can never disagree.
    Returns the candidates sorted qualified-first, then skill match, then least busy."""
    # Step 1: Get all required skills for this task
    task_skills = (
        db().table("task_skills")
        .select("skill_id, min_proficiency")
        .eq("task_id", task_id)
        .execute()
    ).data

    if not task_skills:
        raise HTTPException(status_code=404, detail="Task not found or has no skill requirements")

    required = {ts["skill_id"]: ts["min_proficiency"] for ts in task_skills}

    # Step 2: Get all student skills
    all_student_skills = (
        db().table("student_skills")
        .select("student_id, skill_id, proficiency")
        .execute()
    ).data

    # Step 3: Group skills by student
    student_skill_map = defaultdict(dict)
    for row in all_student_skills:
        student_skill_map[row["student_id"]][row["skill_id"]] = row["proficiency"]

    # Step 4: Get each student's current active WIP count
    active_assignments = (
        db().table("assignments")
        .select("student_id")
        .in_("status", ["Assigned", "In Progress"])
        .execute()
    ).data

    wip_count = defaultdict(int)
    for row in active_assignments:
        wip_count[row["student_id"]] += 1

    # Names of required skills (for human-readable justifications).
    skill_rows = (
        db().table("skills").select("id, skill_name")
        .in_("id", list(required.keys())).execute()
    ).data
    skill_names = {r["id"]: r["skill_name"] for r in skill_rows}

    # Performance stats feed the band + the balanced pairing.
    stats = compute_student_stats()

    # Step 5: Score EVERY student (flag, don't filter) so the leader sees all —
    #         qualified float to the top, the rest are ranked below with a reason.
    all_students = (
        db().table("students")
        .select("*")   # "*" so this still works before roles.sql adds away_until
        .execute()
    ).data
    today = str(date.today())

    total_required = len(required)
    candidates = []
    for student in all_students:
        student_id = student["id"]
        skills = student_skill_map.get(student_id, {})
        over_wip = wip_count[student_id] >= WIP_LIMIT
        away_until = student.get("away_until")
        away = bool(away_until) and away_until >= today

        proficiency_scores = []
        met_count = 0
        missing = []
        for skill_id, min_prof in required.items():
            student_prof = skills.get(skill_id, 0)
            proficiency_scores.append(student_prof)
            if student_prof >= min_prof:
                met_count += 1
            else:
                missing.append(skill_names.get(skill_id, "a required skill"))

        meets_skills = met_count == total_required
        avg = sum(proficiency_scores) / len(proficiency_scores) if proficiency_scores else 0

        st = stats.get(student_id, {"avg_score": None, "completed_count": 0, "band": "unrated"})
        band = st["band"]
        unrated = band == "unrated"

        # Why this student appears — fit and/or growth reason.
        if away:
            justification = f"Away until {away_until} — not available for new work"
        elif over_wip:
            justification = "At WIP limit — finish current tasks first"
        elif meets_skills and band == "high":
            justification = "Strong fit — meets all required skills, high performer"
        elif meets_skills and band == "avg":
            justification = "Good fit — meets all required skills"
        elif meets_skills and unrated:
            justification = "Meets all required skills — growth opportunity to build a track record"
        elif meets_skills:  # low band
            justification = "Meets all required skills — pairing with a strong member helps them improve"
        else:
            grow = f" to build {missing[0]}" if missing else ""
            justification = (f"Suggested for growth — meets {met_count}/{total_required} required skills; "
                             f"a chance{grow} alongside a strong member")

        candidates.append({
            "student_id":  student_id,
            "name":        student.get("name"),
            "matric":      student.get("matric"),
            "programme":   student.get("programme"),
            "match_score": round(avg, 2),
            "met_count":   met_count,
            "total_required": total_required,
            "wip":         wip_count[student_id],
            "qualified":   meets_skills and not over_wip and not away,
            "over_wip":    over_wip,
            "away":        away,
            "away_until":  away_until if away else None,
            "avg_score":   st["avg_score"],
            "band":        band,
            "unrated":     unrated,
            "justification": justification,
        })

    # Step 6: Qualified first, then skill-match desc, then less busy first.
    candidates.sort(key=lambda x: (not x["qualified"], -x["match_score"], x["wip"]))
    return candidates


@app.get("/recommend/{task_id}")
def recommend(task_id: str, authorization: str = Header(None)):
    require_user(authorization)
    candidates = score_candidates(task_id)

    # Step 7: Balanced-pair suggestion — a strong performer + a learner, so the
    #         workload isn't dumped on top performers (per the FYP balance goal).
    def avg_or(c, default):
        return c["avg_score"] if c["avg_score"] is not None else default

    qualified = [c for c in candidates if c["qualified"]]
    strong = learner = None
    if qualified:
        strong = sorted(qualified, key=lambda c: (-(avg_or(c, -1)), -c["match_score"]))[0]
        rest = [c for c in qualified if c["student_id"] != strong["student_id"]]
        pool = rest if rest else [c for c in candidates if c["student_id"] != strong["student_id"]]
        if pool:
            learner = sorted(pool, key=lambda c: (avg_or(c, 0), -c["match_score"]))[0]

    suggested_pair = None
    if strong and learner and strong["student_id"] != learner["student_id"]:
        suggested_pair = {
            "strong":  {"student_id": strong["student_id"], "name": strong["name"],
                        "band": strong["band"], "avg_score": strong["avg_score"]},
            "learner": {"student_id": learner["student_id"], "name": learner["name"],
                        "band": learner["band"], "avg_score": learner["avg_score"]},
            "reason": (f"Balance the workload: pair {strong['name']} (strong) with "
                       f"{learner['name']} ({'unrated' if learner['unrated'] else learner['band']}) "
                       f"so learning is shared, not all work on the top performer."),
        }

    # Min-2 helper: how many people are on this task (assigned or in progress).
    current = (
        db().table("assignments").select("id")
        .eq("task_id", task_id).in_("status", ["Assigned", "In Progress"]).execute()
    ).data

    return {
        "task_id": task_id,
        "recommendations": candidates,
        "suggested_pair": suggested_pair,
        "assigned_count": len(current),
        "min_team_size": 2,
        "wip_limit": WIP_LIMIT,
    }

# ─── Assignment modes: pick one person automatically ───────────

ASSIGNMENT_MODES = {
    "best_match":   "Best match",
    "round_robin":  "Round robin",
    "least_loaded": "Least loaded",
}


def pick_assignee(candidates, mode, last_assigned=None, total_assigned=None, active_hours=None):
    """Choose one candidate for a task. Pure function (no DB) so it is easy to test.

    Only qualified candidates (meet every required skill, under the WIP limit) are ever
    picked; the modes differ in how they break the tie between them:
      best_match   — the top of the ranked list (highest skill match, then least busy)
      round_robin  — whoever has gone longest without a new assignment, so routine work
                     rotates evenly (never assigned counts as longest; then fewest
                     assignments overall, then name)
      least_loaded — fewest committed hours on active tasks (then fewest active tasks)
    Returns (candidate, reason), or (None, reason) when nobody qualifies."""
    last_assigned = last_assigned or {}
    total_assigned = total_assigned or {}
    active_hours = active_hours or {}

    pool = [c for c in candidates if c["qualified"]]
    if not pool:
        return None, "Nobody qualifies yet — no one meets every required skill with a free slot."

    if mode == "best_match":
        chosen = pool[0]  # candidates arrive already ranked
        reason = (f"Best match: {chosen['met_count']}/{chosen['total_required']} required skills, "
                  f"skill level {chosen['match_score']}, {chosen['wip']} of {WIP_LIMIT} slots used")
    elif mode == "round_robin":
        def rr_key(c):
            last = last_assigned.get(c["student_id"])
            # "" sorts before any ISO date, so never-assigned people go first.
            return (last or "", total_assigned.get(c["student_id"], 0), (c["name"] or "").lower())
        chosen = sorted(pool, key=rr_key)[0]
        last = last_assigned.get(chosen["student_id"])
        when = f"last given a task on {last}" if last else "has not been given a task yet"
        reason = (f"Round robin: next in rotation ({when}), meets all required skills, "
                  f"{chosen['wip']} of {WIP_LIMIT} slots used")
    elif mode == "least_loaded":
        def ll_key(c):
            return (active_hours.get(c["student_id"], 0), c["wip"], -c["match_score"])
        chosen = sorted(pool, key=ll_key)[0]
        hours = active_hours.get(chosen["student_id"], 0)
        reason = (f"Least loaded: {round(hours, 1)}h committed on active tasks, "
                  f"{chosen['wip']} of {WIP_LIMIT} slots used, meets all required skills")
    else:
        raise ValueError(f"unknown assignment mode: {mode}")
    return chosen, reason


@app.post("/auto-assign")
def auto_assign(body: AutoAssignBody, authorization: str = Header(None)):
    """Leader picks an assignment mode and the server chooses who gets the task.
    With dry_run the pick is only previewed, so the leader can confirm or override."""
    require_permission(authorization, "assign.others")
    actor_email, actor_role = actor_from_token(authorization)

    rows = (
        db().table("assignments")
        .select("task_id, student_id, status, assigned_date, tasks(committed_hours)")
        .execute()
    ).data

    already_on_task = set()
    last_assigned, total_assigned = {}, defaultdict(int)
    active_hours = defaultdict(float)
    for r in rows:
        sid = r["student_id"]
        if r["task_id"] == body.task_id:
            already_on_task.add(sid)
        total_assigned[sid] += 1
        d = r.get("assigned_date")
        if d and (sid not in last_assigned or d > last_assigned[sid]):
            last_assigned[sid] = d
        if r["status"] in ("Assigned", "In Progress"):
            active_hours[sid] += (r.get("tasks") or {}).get("committed_hours") or 0

    candidates = [c for c in score_candidates(body.task_id) if c["student_id"] not in already_on_task]
    chosen, reason = pick_assignee(candidates, body.mode, last_assigned, total_assigned, active_hours)

    result = {
        "mode": body.mode,
        "mode_label": ASSIGNMENT_MODES[body.mode],
        "dry_run": body.dry_run,
        "student_id": chosen["student_id"] if chosen else None,
        "name": chosen["name"] if chosen else None,
        "reason": reason,
    }
    if chosen is None or body.dry_run:
        return result

    created = _create_assignment(body.task_id, chosen["student_id"], actor_email, actor_role)
    log_activity(
        action="assignment.auto_assigned", entity_type="task", entity_id=body.task_id,
        summary=f"{chosen['name']} auto-assigned ({ASSIGNMENT_MODES[body.mode]})",
        actor_email=actor_email, actor_role=actor_role,
        details={"mode": body.mode, "student_id": chosen["student_id"], "reason": reason},
    )
    return {**result, "assignment": created["assignment"]}


def _create_assignment(task_id, student_id, actor_email, actor_role, self_assigned=False):
    """Shared assignment logic used by both leader-assign and student self-assign.
    Enforces: closed-task lock, one-assignment-per-(task,student), and the WIP limit."""
    if not task_id or not student_id:
        raise HTTPException(status_code=400, detail="task_id and student_id required")

    # A closed task (SLA window expired) is locked — no more assigning.
    tcheck = db().table("tasks").select("status, due_date").eq("id", task_id).execute().data
    if tcheck and is_task_closed(tcheck[0].get("due_date"), tcheck[0].get("status")):
        raise HTTPException(status_code=400, detail="This task is closed (SLA window expired) and can no longer be assigned.")

    # Guard against duplicate assignment (e.g. a double-click) — one assignment per (task, student).
    existing = (
        db().table("assignments")
        .select("id").eq("task_id", task_id).eq("student_id", student_id).execute()
    ).data
    if existing:
        raise HTTPException(status_code=409,
                            detail="You're already on this task." if self_assigned else "This student is already assigned to this task.")

    # WIP = everything on their plate that isn't done (assigned OR in progress).
    active = (
        db().table("assignments")
        .select("id").eq("student_id", student_id).in_("status", ["Assigned", "In Progress"]).execute()
    ).data
    if len(active) >= WIP_LIMIT:
        raise HTTPException(status_code=400,
                            detail=(f"You've reached your workload limit of {WIP_LIMIT} active tasks — finish one before taking another."
                                    if self_assigned else "Student has reached WIP limit"))

    # Create the assignment in the 'Assigned' state — the clock does NOT run yet.
    # The assignee starts it themselves (/start), which is when timing begins.
    try:
        result = (
            db().table("assignments")
            .insert({"task_id": task_id, "student_id": student_id,
                     "assigned_date": str(date.today()), "status": "Assigned"})
            .execute()
        ).data
    except Exception as e:
        if "duplicate" in str(e).lower() or "23505" in str(e):
            raise HTTPException(status_code=409, detail="You're already on this task." if self_assigned else "This student is already assigned to this task.")
        raise
    # Task stays 'New' until an assignee actually starts work.

    # Look up names for a readable audit line.
    student = (db().table("students").select("name").eq("id", student_id).execute()).data
    task = (db().table("tasks").select("description").eq("id", task_id).execute()).data
    student_name = student[0]["name"] if student else student_id
    task_desc = task[0]["description"] if task else task_id

    log_activity(
        action="assignment.self_assigned" if self_assigned else "assignment.assigned",
        entity_type="assignment",
        entity_id=result[0]["id"] if result else None,
        summary=f"{student_name} {'picked up' if self_assigned else 'assigned to'} task '{task_desc}'",
        actor_email=actor_email, actor_role=actor_role,
        details={"task_id": task_id, "student_id": student_id, "self_assigned": self_assigned},
    )
    return {"success": True, "assignment": result}


@app.post("/assign")
def assign(body: AssignBody, authorization: str = Header(None)):
    """Leader assigns a student to a task. Caller must be an authenticated leader;
    the actor recorded in the audit log is taken from the verified token, not the body."""
    require_permission(authorization, "assign.others")
    actor_email, actor_role = actor_from_token(authorization)
    return _create_assignment(body.task_id, body.student_id,
                              actor_email, actor_role)


@app.post("/self-assign")
def self_assign(body: SelfAssignBody, authorization: str = Header(None)):
    """A student picks up a task for themselves. The student is resolved from the caller's
    own verified login token — never from the request body — so this can only ever assign
    the caller to their own account, never anyone else."""
    user = require_permission(authorization, "work.self")
    role = role_of(user)
    task_id = body.task_id

    srows = db().table("students").select("id, name").eq("email", user.email).execute().data
    if not srows:
        raise HTTPException(status_code=400,
                            detail="No student record is linked to your account. Ask your leader to add you on the Students page.")
    return _create_assignment(task_id, srows[0]["id"], actor_email=user.email, actor_role=role, self_assigned=True)


@app.post("/start")
def start(body: StartBody, authorization: str = Header(None)):
    """Assignee starts their assigned task — the timer begins now (in_progress_at)."""
    require_user(authorization)
    assignment_id = body.assignment_id

    rows = (
        db().table("assignments")
        .select("id, task_id, student_id, status, in_progress_at")
        .eq("id", assignment_id)
        .execute()
    ).data
    if not rows:
        raise HTTPException(status_code=404, detail="Assignment not found")
    a = rows[0]
    actor_email, actor_role = require_assignee_or(authorization, a["student_id"])
    if a["status"] == "Completed":
        raise HTTPException(status_code=400, detail="This task is already completed.")

    started_at = a.get("in_progress_at") or now_iso()
    db().table("assignments").update({
        "status": "In Progress",
        "in_progress_at": started_at,
    }).eq("id", assignment_id).execute()

    # First person to start moves the task itself into progress.
    task = (db().table("tasks").select("description, status").eq("id", a["task_id"]).execute()).data
    if task and task[0].get("status") == "New":
        db().table("tasks").update({"status": "In Progress"}).eq("id", a["task_id"]).execute()

    student = (db().table("students").select("name").eq("id", a["student_id"]).execute()).data
    log_activity(
        action="assignment.started", entity_type="assignment", entity_id=assignment_id,
        summary=f"{student[0]['name'] if student else a['student_id']} started task '{task[0]['description'] if task else a['task_id']}'",
        actor_email=actor_email, actor_role=actor_role,
        details={"task_id": a["task_id"], "started_at": started_at},
    )
    return {"success": True, "in_progress_at": started_at}


@app.post("/unassign")
def unassign(body: UnassignBody, authorization: str = Header(None)):
    """Remove a student from a task (undo an assignment). Completed assignments are kept —
    they hold the student's performance record. If removing the last active assignee leaves
    the task with no one working it, roll the task back to 'New'."""
    require_permission(authorization, "assign.others")
    actor_email, actor_role = actor_from_token(authorization)
    assignment_id = body.assignment_id

    rows = (
        db().table("assignments")
        .select("id, task_id, student_id, status")
        .eq("id", assignment_id)
        .execute()
    ).data
    if not rows:
        raise HTTPException(status_code=404, detail="Assignment not found")
    a = rows[0]
    if a["status"] == "Completed":
        raise HTTPException(status_code=400,
                            detail="Can't remove a completed assignment — it holds the student's performance record.")

    # Names first (for a readable audit line), then delete.
    student = (db().table("students").select("name").eq("id", a["student_id"]).execute()).data
    task = (db().table("tasks").select("description, status").eq("id", a["task_id"]).execute()).data
    db().table("assignments").delete().eq("id", assignment_id).execute()

    # If nobody is actively on the task anymore, send it back to 'New'.
    remaining = (
        db().table("assignments").select("status").eq("task_id", a["task_id"]).execute()
    ).data
    any_active = any(r["status"] in ("Assigned", "In Progress") for r in remaining)
    if task and task[0].get("status") == "In Progress" and not any_active:
        db().table("tasks").update({"status": "New"}).eq("id", a["task_id"]).execute()

    log_activity(
        action="assignment.removed", entity_type="assignment", entity_id=assignment_id,
        summary=f"{student[0]['name'] if student else a['student_id']} removed from task "
                f"'{task[0]['description'] if task else a['task_id']}'",
        actor_email=actor_email, actor_role=actor_role,
        details={"task_id": a["task_id"], "student_id": a["student_id"], "prev_status": a["status"]},
    )
    return {"success": True, "task_reverted": bool(task and task[0].get("status") == "In Progress" and not any_active)}


@app.post("/complete")
def complete(body: CompleteBody, authorization: str = Header(None)):
    """Mark a student's assignment complete, compute their performance score,
    and flip the task to Completed once every assignee is done.

    score = committed_hours / (committed_hours + elapsed_hours), clamped 0..1.
    Elapsed defaults to wall-clock (in_progress_at -> now), but a manually
    entered actual_hours overrides it.
    """
    require_user(authorization)
    assignment_id = body.assignment_id
    actual_hours = body.actual_hours  # optional manual override

    rows = (
        db().table("assignments")
        .select("id, task_id, student_id, in_progress_at")
        .eq("id", assignment_id)
        .execute()
    ).data
    if not rows:
        raise HTTPException(status_code=404, detail="Assignment not found")
    assignment = rows[0]
    actor_email, actor_role = require_assignee_or(authorization, assignment["student_id"])
    task_id = assignment["task_id"]

    completed_at = datetime.now(timezone.utc)

    # timed_hours = the real timer (start -> now); recorded whenever the task was started.
    started = assignment.get("in_progress_at")
    timed_hours = None
    if started:
        start_dt = datetime.fromisoformat(started.replace("Z", "+00:00"))
        timed_hours = round(max((completed_at - start_dt).total_seconds() / 3600.0, 0.0), 3)

    # elapsed_hours = the SELF-DECLARED value (drives the score): manual if given, else the timer.
    if actual_hours is not None:
        try:
            elapsed_hours = float(actual_hours)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="actual_hours must be a number")
    elif timed_hours is not None:
        elapsed_hours = timed_hours
    else:
        # Not started and no manual hours given — can't time it.
        raise HTTPException(status_code=400, detail="Start the task first, or enter the hours spent.")

    # committed_hours from the task drives the score; due_date tells us if it's late.
    task = (
        db().table("tasks")
        .select("description, committed_hours, due_date, status")
        .eq("id", task_id)
        .execute()
    ).data
    committed = task[0].get("committed_hours") if task else None
    due_date = task[0].get("due_date") if task else None

    # A closed task is locked — it can no longer be completed.
    if task and is_task_closed(due_date, task[0].get("status")):
        raise HTTPException(status_code=400, detail="This task is closed (SLA window expired) and is locked.")

    score = None
    if committed:
        denom = committed + elapsed_hours
        score = round(committed / denom, 3) if denom > 0 else None
        if score is not None:
            score = max(0.0, min(1.0, score))

    db().table("assignments").update({
        "status": "Completed",
        "completed_at": completed_at.isoformat(),
        "actual_hours": elapsed_hours,   # self-declared (or timer if none given) — drives score
        "timed_hours": timed_hours,      # the real timer value — for leaders to compare
        "score": score,
    }).eq("id", assignment_id).execute()

    # If every assignment on the task is now Completed, complete the task.
    siblings = (
        db().table("assignments")
        .select("status")
        .eq("task_id", task_id)
        .execute()
    ).data
    all_done = siblings and all(s["status"] == "Completed" for s in siblings)
    # Was this completion past the deadline? (overdue = breached the set date, even if finished)
    late = bool(due_date and completed_at.date().isoformat() > due_date)
    if all_done:
        db().table("tasks").update({
            "status": "Completed",
            "completed_at": completed_at.isoformat(),
        }).eq("id", task_id).execute()

    student = (db().table("students").select("name").eq("id", assignment["student_id"]).execute()).data
    student_name = student[0]["name"] if student else assignment["student_id"]
    task_desc = task[0]["description"] if task else task_id

    # Don't dress up a late finish — flag the deadline breach in the log.
    late_note = f" — ⚠ DELAYED, past due {due_date}" if (all_done and late) else (" — on time" if all_done else "")
    log_activity(
        action="task.completed_late" if (all_done and late) else ("task.completed" if all_done else "assignment.completed"),
        entity_type="assignment",
        entity_id=assignment_id,
        summary=(f"{student_name} completed task '{task_desc}' "
                 f"in {round(elapsed_hours, 2)}h (score {score}){late_note}"),
        actor_email=actor_email, actor_role=actor_role,
        details={"task_id": task_id, "elapsed_hours": elapsed_hours,
                 "committed_hours": committed, "score": score,
                 "task_completed": bool(all_done), "late": late, "due_date": due_date},
    )

    return {"success": True, "score": score, "elapsed_hours": round(elapsed_hours, 2),
            "committed_hours": committed, "late": late, "task_completed": bool(all_done)}


@app.get("/student-stats")
def student_stats(authorization: str = Header(None)):
    """Per-student performance summary: average score over completed, scored
    assignments, plus a band (high/avg/low/unrated) used for matching + display."""
    require_user(authorization)
    stats = compute_student_stats()
    students = (db().table("students").select("id, name").execute()).data
    out = []
    for s in students:
        st = stats.get(s["id"], {"avg_score": None, "completed_count": 0, "band": "unrated"})
        out.append({"student_id": s["id"], "name": s["name"], **st})
    return {"stats": out}


@app.get("/wip")
def wip_status(authorization: str = Header(None)):
    """Per-student work-in-progress load: how many active (Assigned or In Progress)
    assignments each student holds, against the shared WIP limit. Same definition the
    matcher and /assign use, so the badges everywhere agree. Powers the WIP badges on the
    Students page, the task-assignment view, and the dashboard WIP panel."""
    require_user(authorization)
    active = (
        db().table("assignments")
        .select("student_id, task_id, status, tasks(description)")
        .in_("status", ["Assigned", "In Progress"])
        .execute()
    ).data

    by_student = defaultdict(list)
    for a in active:
        by_student[a["student_id"]].append({
            "task_id": a["task_id"],
            "status": a["status"],
            "description": (a.get("tasks") or {}).get("description"),
        })

    students = (db().table("students").select("id, name").execute()).data
    out = []
    for s in students:
        tasks = by_student.get(s["id"], [])
        wip = len(tasks)
        out.append({
            "student_id": s["id"],
            "name": s["name"],
            "wip": wip,
            "over_wip": wip >= WIP_LIMIT,
            "remaining": max(0, WIP_LIMIT - wip),
            "active_tasks": tasks,
        })
    out.sort(key=lambda x: (-x["wip"], x["name"] or ""))
    at_limit = sum(1 for x in out if x["wip"] >= WIP_LIMIT)
    working = sum(1 for x in out if x["wip"] > 0)
    return {"wip_limit": WIP_LIMIT, "at_limit": at_limit, "working": working, "students": out}


# ─── Reverse matching: recommend tasks for a student ───────────

@app.get("/recommend-tasks/{student_id}")
def recommend_tasks(student_id: str, authorization: str = Header(None)):
    """Given a student, return open tasks whose skill requirements they meet.

    Mirror of /recommend but from the student's perspective — used by the
    student profile page to show 'tasks recommended for you'.
    """
    require_user(authorization)

    # Step 1: This student's skill profile
    student_skills = (
        db().table("student_skills")
        .select("skill_id, proficiency")
        .eq("student_id", student_id)
        .execute()
    ).data

    skills = {s["skill_id"]: s["proficiency"] for s in student_skills}

    # Step 2: Tasks already linked to this student (any status) -> exclude
    my_assignments = (
        db().table("assignments")
        .select("task_id")
        .eq("student_id", student_id)
        .execute()
    ).data
    assigned_task_ids = {a["task_id"] for a in my_assignments}

    # Step 3: Tasks open for assignment or still gathering a team.
    open_tasks = (
        db().table("tasks")
        .select("id, description, estimated_days, committed_hours, severity, status, due_date")
        .in_("status", ["New", "In Progress"])
        .execute()
    ).data

    # Only suggest tasks the student can actually pick up: not already theirs, and not closed/locked
    # (overdue past the SLA grace window — those reject on assign, so don't show them).
    open_tasks = [t for t in open_tasks
                  if t["id"] not in assigned_task_ids and not is_task_closed(t.get("due_date"), t["status"])]
    candidate_ids = [t["id"] for t in open_tasks]
    if not candidate_ids:
        return {"student_id": student_id, "qualified": [], "growth": []}

    # Step 4: Required skills for those tasks (+ names for justifications)
    task_skill_rows = (
        db().table("task_skills")
        .select("task_id, skill_id, min_proficiency")
        .in_("task_id", candidate_ids)
        .execute()
    ).data

    required_by_task = defaultdict(dict)
    all_skill_ids = set()
    for row in task_skill_rows:
        required_by_task[row["task_id"]][row["skill_id"]] = row["min_proficiency"]
        all_skill_ids.add(row["skill_id"])

    skill_rows = (
        db().table("skills").select("id, skill_name")
        .in_("id", list(all_skill_ids)).execute()
    ).data if all_skill_ids else []
    skill_names = {r["id"]: r["skill_name"] for r in skill_rows}

    task_lookup = {t["id"]: t for t in open_tasks}

    # Step 5: Split into 'qualified' (meets all) and 'growth' (partial match).
    qualified_list = []
    growth_list = []
    for task_id, required in required_by_task.items():
        total = len(required)
        met = 0
        missing = []
        proficiency_scores = []
        for skill_id, min_prof in required.items():
            prof = skills.get(skill_id, 0)
            proficiency_scores.append(prof)
            if prof >= min_prof:
                met += 1
            else:
                missing.append(skill_names.get(skill_id, "a required skill"))

        task = task_lookup[task_id]
        base = {
            "task_id": task_id,
            "description": task["description"],
            "estimated_days": task.get("estimated_days"),
            "committed_hours": task.get("committed_hours"),
            "severity": task.get("severity"),
            "status": task.get("status"),
            "match_score": round(sum(proficiency_scores) / len(proficiency_scores), 2) if proficiency_scores else 0,
            "met_count": met,
            "total_required": total,
        }
        if met == total:
            base["reason"] = "You meet the required skills"
            qualified_list.append(base)
        elif met >= 1:
            grow = f" to build {missing[0]}" if missing else ""
            base["reason"] = f"Growth opportunity{grow} — you meet {met}/{total} required skills"
            growth_list.append(base)
        # met == 0 -> not relevant enough to suggest

    qualified_list.sort(key=lambda x: -x["match_score"])
    growth_list.sort(key=lambda x: -x["match_score"])

    return {"student_id": student_id, "qualified": qualified_list, "growth": growth_list}


# ─── Workspace members & roles (service-role) ──────

def _list_all_users(admin_client):
    """Walk every page of auth users (list_users caps at 50/page by default)."""
    users, page = [], 1
    while True:
        batch = admin_client.auth.admin.list_users(page=page, per_page=200)
        if not batch:
            break
        users.extend(batch)
        if len(batch) < 200:
            break
        page += 1
    return users


def _members(ws):
    return (raw_db().table("workspace_members").select("user_id, email, role, joined_at")
            .eq("workspace_id", ws).execute()).data or []


def _account_view(member, user, roster_emails):
    """One member of the workspace, with what the UI needs from their login account."""
    meta = (getattr(user, "user_metadata", None) or {}) if user else {}
    email = (member.get("email") or (user.email if user else "") or "")
    return {
        "id": member["user_id"],
        "email": email,
        "name": meta.get("full_name") or meta.get("name"),
        "role": member["role"],
        "last_sign_in_at": str(user.last_sign_in_at) if user and getattr(user, "last_sign_in_at", None) else None,
        "on_roster": email.lower() in roster_emails,
        "created_at": str(member.get("joined_at") or "") or None,
    }


def _remember_workspace(admin_client, user_id, ws, role):
    """Store the user's chosen workspace (and, for the app's display, their role there) in
    app_metadata. Only the server can write app_metadata. Access is still checked against
    workspace_members on every request; this is just which workspace to open."""
    target = admin_client.auth.admin.get_user_by_id(user_id)
    tuser = target.user if target else None
    meta = dict(getattr(tuser, "app_metadata", None) or {}) if tuser else {}
    meta.update({"workspace_id": ws, "role": role})
    admin_client.auth.admin.update_user_by_id(user_id, {"app_metadata": meta})


@app.get("/accounts")
def list_accounts(authorization: str = Header(None)):
    """Everyone in the current workspace, with their role, last sign-in and whether they're on
    the roster yet. Needs people.manage."""
    require_permission(authorization, "people.manage")
    admin_client = require_admin_client()
    ws = current_workspace()

    users = {u.id: u for u in _list_all_users(admin_client)}
    roster = db().table("students").select("email").execute().data or []
    roster_emails = {(s.get("email") or "").lower() for s in roster if s.get("email")}

    accounts = [_account_view(m, users.get(m["user_id"]), roster_emails) for m in _members(ws)]
    accounts.sort(key=lambda a: (a["email"] or "").lower())
    return {"accounts": accounts}


@app.post("/set-role")
def set_role(body: SetRoleBody, authorization: str = Header(None)):
    """Change someone's role in the current workspace. Admin-only, with a guard against removing
    the workspace's last admin, and every change written to the audit log."""
    actor = require_permission(authorization, "team.manage")
    admin_client = require_admin_client()
    ws = current_workspace()

    members = _members(ws)
    target = next((m for m in members if m["user_id"] == body.user_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="That person isn't in this workspace.")

    current_role, new_role = target["role"], body.role
    if current_role == new_role:
        return {"success": True, "unchanged": True, "role": new_role, "email": target["email"]}
    if current_role == "admin" and sum(m["role"] == "admin" for m in members) <= 1:
        raise HTTPException(status_code=400, detail="This is the last admin. Make someone else an admin first.")

    (raw_db().table("workspace_members").update({"role": new_role})
     .eq("workspace_id", ws).eq("user_id", body.user_id).execute())
    tuser = admin_client.auth.admin.get_user_by_id(body.user_id)
    tuser = tuser.user if tuser else None
    if tuser and (getattr(tuser, "app_metadata", None) or {}).get("workspace_id") == ws:
        _remember_workspace(admin_client, body.user_id, ws, new_role)

    log_activity(
        action="account.role_changed",
        entity_type="account",
        entity_id=body.user_id,
        summary=f"{target['email']} role changed: {current_role} → {new_role}",
        actor_email=getattr(actor, "email", None),
        actor_role=role_of(actor),
        details={"target_email": target["email"], "from": current_role, "to": new_role},
    )
    return {"success": True, "role": new_role, "email": target["email"]}


@app.delete("/workspaces/members/{user_id}")
def remove_member(user_id: str, authorization: str = Header(None)):
    """Remove someone from the current workspace (admin), or leave it yourself. Their past work
    and the audit trail stay. The last admin can't leave or be removed."""
    actor = require_user(authorization)
    ws = current_workspace()
    if user_id != actor.id and not can(role_of(actor), "team.manage"):
        raise HTTPException(status_code=403, detail="Your role doesn't allow this.")
    members = _members(ws)
    target = next((m for m in members if m["user_id"] == user_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="That person isn't in this workspace.")
    if target["role"] == "admin" and sum(m["role"] == "admin" for m in members) <= 1:
        raise HTTPException(status_code=400, detail="This is the last admin. Make someone else an admin first.")
    raw_db().table("workspace_members").delete().eq("workspace_id", ws).eq("user_id", user_id).execute()
    log_activity(
        action="account.left" if user_id == actor.id else "account.removed",
        entity_type="account", entity_id=user_id,
        summary=f"{target['email']} {'left' if user_id == actor.id else 'was removed from'} the workspace",
        actor_email=actor.email, actor_role=role_of(actor),
        details={"target_email": target["email"], "role": target["role"]},
    )
    return {"success": True}


# ─── Workspaces: create, switch, rename, invite, join ──────

STARTER_SKILLS = ["Python", "JavaScript", "React", "Node.js", "Java", "SQL", "Database Design",
                  "API Development", "UI/UX", "Mobile Development", "Testing / QA", "DevOps / CI-CD",
                  "Cloud Computing", "Cybersecurity", "Data Analysis", "Machine Learning",
                  "Project Management", "Technical Writing", "Graphic Design"]


class WorkspaceBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)

class SwitchBody(BaseModel):
    workspace_id: str = Field(..., min_length=1)

class InviteBody(BaseModel):
    role: str = Field(default="member", pattern="^(admin|lead|member|viewer)$")
    days: int = Field(default=7, ge=1, le=30)
    max_uses: int = Field(default=25, ge=1, le=500)

class JoinBody(BaseModel):
    code: str = Field(..., min_length=6, max_length=64)


def _workspace_list(user_id):
    rows = memberships(user_id)
    if not rows:
        return []
    ids = [m["workspace_id"] for m in rows]
    names = {w["id"]: w for w in (raw_db().table("workspaces").select("id, name, created_at")
                                  .in_("id", ids).execute()).data or []}
    return [{"id": m["workspace_id"], "name": names.get(m["workspace_id"], {}).get("name", "Workspace"),
             "role": m["role"]} for m in rows]


@app.get("/workspaces")
def list_workspaces(authorization: str = Header(None)):
    """The workspaces you belong to and which one you're in. Empty for a brand-new account."""
    user = require_user(authorization, need_workspace=False)
    ws, role = _workspace.get()[:2]
    return {"current": ws, "role": role, "workspaces": _workspace_list(user.id)}


@app.post("/workspaces")
def create_workspace(body: WorkspaceBody, authorization: str = Header(None)):
    """Start a new workspace. You become its admin and it opens straight away. It comes with a
    starter skill list that admins can change."""
    user = require_user(authorization, need_workspace=False)
    admin_client = require_admin_client()
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Give the workspace a name.")
    if len(memberships(user.id)) >= 20:
        raise HTTPException(status_code=400, detail="You're in 20 workspaces already.")
    ws = raw_db().table("workspaces").insert({"name": name, "created_by": user.id}).execute().data[0]["id"]
    raw_db().table("workspace_members").insert({"workspace_id": ws, "user_id": user.id, "email": user.email, "role": "admin"}).execute()
    raw_db().table("skills").insert([{"skill_name": n, "workspace_id": ws} for n in STARTER_SKILLS]).execute()
    _remember_workspace(admin_client, user.id, ws, "admin")
    _workspace.set((ws, "admin", user.id))
    log_activity(action="workspace.created", entity_type="workspace", entity_id=ws,
                 summary=f"Created workspace '{name}'", actor_email=user.email, actor_role="admin")
    return {"id": ws, "name": name, "role": "admin"}


@app.post("/workspaces/switch")
def switch_workspace(body: SwitchBody, authorization: str = Header(None)):
    """Open another workspace you belong to."""
    user = require_user(authorization, need_workspace=False)
    admin_client = require_admin_client()
    pick = next((m for m in memberships(user.id) if m["workspace_id"] == body.workspace_id), None)
    if not pick:
        raise HTTPException(status_code=403, detail="You're not a member of that workspace.")
    _remember_workspace(admin_client, user.id, pick["workspace_id"], pick["role"])
    return {"id": pick["workspace_id"], "role": pick["role"]}


@app.patch("/workspaces/current")
def rename_workspace(body: WorkspaceBody, authorization: str = Header(None)):
    actor = require_permission(authorization, "team.manage")
    ws = current_workspace()
    old = (raw_db().table("workspaces").select("name").eq("id", ws).execute()).data
    raw_db().table("workspaces").update({"name": body.name.strip()}).eq("id", ws).execute()
    log_activity(action="workspace.renamed", entity_type="workspace", entity_id=ws,
                 summary=f"Workspace renamed: {old[0]['name'] if old else '?'} → {body.name.strip()}",
                 actor_email=actor.email, actor_role=role_of(actor),
                 details={"from": old[0]["name"] if old else None, "to": body.name.strip()})
    return {"success": True, "name": body.name.strip()}


def _invite_valid(inv):
    exp = inv.get("expires_at")
    try:
        expired = exp and datetime.fromisoformat(str(exp).replace("Z", "+00:00")) < datetime.now(timezone.utc)
    except ValueError:
        expired = True
    return not inv.get("revoked") and not expired and (inv.get("uses") or 0) < (inv.get("max_uses") or 0)


@app.get("/workspaces/invites")
def list_invites(authorization: str = Header(None)):
    require_permission(authorization, "team.manage")
    rows = (raw_db().table("workspace_invites").select("*").eq("workspace_id", current_workspace())
            .order("created_at", desc=True).execute()).data or []
    return {"invites": [{**r, "valid": _invite_valid(r)} for r in rows if not r.get("revoked")]}


@app.post("/workspaces/invites")
def create_invite(body: InviteBody, authorization: str = Header(None)):
    """An invite link for the current workspace: anyone signed in who opens it joins with `role`.
    Expires after `days` or `max_uses` joins, and can be revoked."""
    actor = require_permission(authorization, "team.manage")
    ws = current_workspace()
    code = secrets.token_urlsafe(12)
    expires = (datetime.now(timezone.utc) + timedelta(days=body.days)).isoformat()
    raw_db().table("workspace_invites").insert({"code": code, "workspace_id": ws, "role": body.role,
                                                "created_by": actor.id, "expires_at": expires,
                                                "max_uses": body.max_uses}).execute()
    log_activity(action="workspace.invite_created", entity_type="workspace", entity_id=ws,
                 summary=f"Created an invite link for {body.role}s ({body.days} days, up to {body.max_uses} people)",
                 actor_email=actor.email, actor_role=role_of(actor), details={"role": body.role, "days": body.days})
    return {"code": code, "role": body.role, "expires_at": expires, "max_uses": body.max_uses}


@app.delete("/workspaces/invites/{code}")
def revoke_invite(code: str, authorization: str = Header(None)):
    actor = require_permission(authorization, "team.manage")
    ws = current_workspace()
    raw_db().table("workspace_invites").update({"revoked": True}).eq("workspace_id", ws).eq("code", code).execute()
    log_activity(action="workspace.invite_revoked", entity_type="workspace", entity_id=ws,
                 summary="Revoked an invite link", actor_email=actor.email, actor_role=role_of(actor))
    return {"success": True}


@app.get("/invites/{code}")
def preview_invite(code: str, authorization: str = Header(None)):
    """What an invite link is for, so the join page can say "Join X as a member"."""
    require_user(authorization, need_workspace=False)
    rows = (raw_db().table("workspace_invites").select("*").eq("code", code).execute()).data
    if not rows:
        raise HTTPException(status_code=404, detail="This invite link doesn't exist.")
    inv = rows[0]
    w = (raw_db().table("workspaces").select("name").eq("id", inv["workspace_id"]).execute()).data
    return {"workspace": w[0]["name"] if w else "Workspace", "role": inv["role"], "valid": _invite_valid(inv)}


@app.post("/workspaces/join")
def join_workspace(body: JoinBody, authorization: str = Header(None)):
    """Join a workspace with an invite code, and open it. Joining a workspace you're already in
    just opens it; it never changes your role."""
    user = require_user(authorization, need_workspace=False)
    admin_client = require_admin_client()
    rows = (raw_db().table("workspace_invites").select("*").eq("code", body.code).execute()).data
    if not rows or not _invite_valid(rows[0]):
        raise HTTPException(status_code=400, detail="This invite link has expired or was revoked. Ask for a new one.")
    inv = rows[0]
    ws = inv["workspace_id"]
    existing = next((m for m in memberships(user.id) if m["workspace_id"] == ws), None)
    role = existing["role"] if existing else inv["role"]
    if not existing:
        raw_db().table("workspace_members").insert({"workspace_id": ws, "user_id": user.id,
                                                    "email": user.email, "role": role}).execute()
        raw_db().table("workspace_invites").update({"uses": (inv.get("uses") or 0) + 1}).eq("code", body.code).execute()
    _remember_workspace(admin_client, user.id, ws, role)
    _workspace.set((ws, role, user.id))
    if not existing:
        log_activity(action="account.joined", entity_type="account", entity_id=user.id,
                     summary=f"{user.email} joined as {role} with an invite link",
                     actor_email=user.email, actor_role=role, details={"role": role})
    w = (raw_db().table("workspaces").select("name").eq("id", ws).execute()).data
    return {"id": ws, "name": w[0]["name"] if w else "Workspace", "role": role, "already_member": bool(existing)}


# ─── AI assist ───
# Suggestions only: the app shows each one with its confidence and the lead accepts or dismisses
# it. Nothing here writes to the database. See ai.py.

ai_limiter = RateLimiter(int(os.environ.get("AI_RATE_LIMIT_PER_MINUTE", "10")), 60.0)  # per user


@app.get("/ai/status")
def ai_status(authorization: str = Header(None)):
    """Which suggestion engine is on: Claude when ANTHROPIC_API_KEY is set, otherwise the
    built-in one that works from the team's finished tasks (free, no key)."""
    require_user(authorization)
    on = ai.enabled()
    return {"enabled": True, "engine": "claude" if on else suggest_history.ENGINE, "model": ai.AI_MODEL if on else None}


@app.post("/ai/suggest-task")
def ai_suggest_task(body: SuggestTaskBody, authorization: str = Header(None)):
    """Suggest skills, hours and severity for a task description, each with a confidence level.
    Needs tasks.manage. Grounded in the team's own skill list and finished tasks. Uses Claude
    when it's set up, otherwise the built-in engine."""
    user = require_permission(authorization, "tasks.manage")
    wait = ai_limiter.hit(user.email or user.id)
    if wait is not None:
        raise HTTPException(status_code=429, detail=f"Too many requests for suggestions. Try again in {int(wait) + 1} seconds.",
                            headers={"Retry-After": str(int(wait) + 1)})

    skills = db().table("skills").select("id, skill_name").execute().data or []
    tasks = (
        db().table("tasks")
        .select("id, description, committed_hours, severity, task_skills(min_proficiency, skills(skill_name)), assignments(actual_hours, status)")
        .eq("status", "Completed")
        .order("completed_at", desc=True)
        .limit(300)
        .execute()
    ).data or []

    if not ai.enabled():
        return suggest_history.suggest(body.description, body.notes, skills, tasks)

    import anthropic
    try:
        return ai.suggest(body.description, body.notes, skills, tasks)
    except ai.AIUnavailable as e:
        raise HTTPException(status_code=422, detail=str(e))
    except anthropic.RateLimitError:
        raise HTTPException(status_code=429, detail="The AI service is busy. Try again in a minute.")
    except anthropic.AuthenticationError:
        logger.error("ai: ANTHROPIC_API_KEY was rejected")
        raise HTTPException(status_code=503, detail="The server's AI key was rejected. Check ANTHROPIC_API_KEY.")
    except (anthropic.APIStatusError, anthropic.APIConnectionError) as e:
        logger.warning("ai: request failed: %s", type(e).__name__)
        raise HTTPException(status_code=502, detail="The AI service didn't respond. Try again.")
