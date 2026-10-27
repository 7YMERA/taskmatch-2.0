"""Tests for the API's access controls: login on the read-only endpoints and the
per-client rate limit. No database, no network — Supabase is swapped for a fake.

Run from taskmatch-api/:  python -m pytest
"""
import os
import sys
import importlib
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("SUPABASE_URL", "https://test.local")
os.environ.setdefault("SUPABASE_KEY", "test-key")

sys.path.insert(0, os.path.dirname(__file__))
main = importlib.import_module("main")


READ_ENDPOINTS = ["/recommend/t1", "/recommend-tasks/s1", "/wip", "/student-stats", "/people/insights"]


# ─── A tiny stand-in for the Supabase client ───

class FakeQuery:
    """Chainable like supabase-py's query builder; every query on a table returns
    that table's canned rows."""

    def __init__(self, rows):
        self._rows = rows

    def select(self, *a, **k): return self
    def eq(self, *a, **k): return self
    def in_(self, *a, **k): return self

    def execute(self):
        return SimpleNamespace(data=self._rows)


class FakeAuth:
    def get_user(self, token):
        if token != "good-token":
            raise Exception("invalid JWT")
        return SimpleNamespace(user=SimpleNamespace(email="ali@utp.edu.my", user_metadata={"role": "student"}))


class FakeSupabase:
    TABLES = {
        "task_skills": [{"task_id": "t1", "skill_id": "k1", "min_proficiency": 2}],
        "student_skills": [{"student_id": "s1", "skill_id": "k1", "proficiency": 3}],
        "assignments": [],
        "skills": [{"id": "k1", "skill_name": "Python"}],
        "students": [{"id": "s1", "name": "Ali", "matric": "123", "programme": "CS"}],
        "tasks": [{"id": "t1", "description": "Build API", "status": "New", "due_date": None}],
    }

    def __init__(self):
        self.auth = FakeAuth()

    def table(self, name):
        return FakeQuery(self.TABLES.get(name, []))


@pytest.fixture
def client(monkeypatch):
    fake = FakeSupabase()
    monkeypatch.setattr(main, "supabase", fake)
    # Read endpoints query via the service-role `admin` client under RLS;
    # patch it too so tests never reach the real network.
    monkeypatch.setattr(main, "admin", fake)
    # A fresh, generous limiter per test so tests never throttle each other.
    monkeypatch.setattr(main, "rate_limiter", main.RateLimiter(1000))
    return TestClient(main.app)


GOOD = {"Authorization": "Bearer good-token"}


# ─── Login required on read-only endpoints ───

@pytest.mark.parametrize("path", READ_ENDPOINTS)
def test_read_endpoint_rejects_anonymous(client, path):
    r = client.get(path)
    assert r.status_code == 401


@pytest.mark.parametrize("path", READ_ENDPOINTS)
def test_read_endpoint_rejects_bad_token(client, path):
    r = client.get(path, headers={"Authorization": "Bearer forged"})
    assert r.status_code == 401


@pytest.mark.parametrize("path", READ_ENDPOINTS)
def test_read_endpoint_allows_logged_in_user(client, path):
    r = client.get(path, headers=GOOD)
    assert r.status_code == 200, r.text


def test_recommend_still_ranks_students_when_logged_in(client):
    body = client.get("/recommend/t1", headers=GOOD).json()
    assert body["recommendations"][0]["student_id"] == "s1"
    assert body["recommendations"][0]["qualified"] is True


def test_health_stays_public(client):
    assert client.get("/health").status_code == 200


# ─── RateLimiter: the sliding window itself ───

class TestRateLimiter:
    def test_allows_up_to_limit_then_blocks(self):
        rl = main.RateLimiter(3, window=60)
        assert [rl.hit("ip", now=t) for t in (0, 1, 2)] == [None, None, None]
        assert rl.hit("ip", now=3) == pytest.approx(57)  # oldest hit (t=0) expires at 60

    def test_window_slides(self):
        rl = main.RateLimiter(2, window=60)
        rl.hit("ip", now=0)
        rl.hit("ip", now=30)
        assert rl.hit("ip", now=59) is not None
        assert rl.hit("ip", now=60) is None  # t=0 has aged out

    def test_blocked_requests_do_not_extend_the_ban(self):
        rl = main.RateLimiter(1, window=60)
        rl.hit("ip", now=0)
        for t in range(1, 60):
            rl.hit("ip", now=t)
        assert rl.hit("ip", now=60) is None

    def test_clients_are_counted_separately(self):
        rl = main.RateLimiter(1, window=60)
        assert rl.hit("a", now=0) is None
        assert rl.hit("b", now=0) is None
        assert rl.hit("a", now=1) is not None

    def test_zero_limit_disables_limiting(self):
        rl = main.RateLimiter(0)
        assert all(rl.hit("ip", now=t) is None for t in range(100))

    def test_sweep_forgets_idle_clients(self):
        rl = main.RateLimiter(5, window=60)
        rl.hit("old", now=0)
        rl._sweep(cutoff=100)
        assert "old" not in rl._hits


# ─── Rate limit wired into the app ───

def test_app_returns_429_with_retry_after(client, monkeypatch):
    monkeypatch.setattr(main, "rate_limiter", main.RateLimiter(2))
    assert client.get("/wip", headers=GOOD).status_code == 200
    assert client.get("/wip", headers=GOOD).status_code == 200
    r = client.get("/wip", headers=GOOD)
    assert r.status_code == 429
    assert int(r.headers["Retry-After"]) >= 1


def test_anonymous_requests_count_too(client, monkeypatch):
    # Throttling runs before the login check, so token-guessing is capped as well.
    monkeypatch.setattr(main, "rate_limiter", main.RateLimiter(1))
    assert client.get("/wip").status_code == 401
    assert client.get("/wip").status_code == 429


def test_forwarded_headers_ignored_off_vercel(client, monkeypatch):
    # Off Vercel a caller could forge x-forwarded-for, so it must not dodge the limit.
    monkeypatch.setattr(main, "ON_VERCEL", False)
    monkeypatch.setattr(main, "rate_limiter", main.RateLimiter(1))
    assert client.get("/wip", headers={"x-forwarded-for": "1.1.1.1"}).status_code == 401
    assert client.get("/wip", headers={"x-forwarded-for": "2.2.2.2"}).status_code == 429


def test_vercel_counts_each_visitor_ip(client, monkeypatch):
    # On Vercel every request arrives from Vercel's edge, so the visitor IP comes
    # from the headers it sets; two visitors must not share one bucket.
    monkeypatch.setattr(main, "ON_VERCEL", True)
    monkeypatch.setattr(main, "rate_limiter", main.RateLimiter(1))
    assert client.get("/wip", headers={"x-real-ip": "1.1.1.1"}).status_code == 401
    assert client.get("/wip", headers={"x-real-ip": "2.2.2.2"}).status_code == 401
    assert client.get("/wip", headers={"x-forwarded-for": "3.3.3.3, 10.0.0.1"}).status_code == 401
    assert client.get("/wip", headers={"x-real-ip": "1.1.1.1"}).status_code == 429


def test_api_prefix_is_stripped(client, monkeypatch):
    # On Vercel the API is served under /api on the frontend's domain.
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/wip", headers=GOOD).status_code == 200
    assert client.get("/api/wip").status_code == 401  # still needs a login
    assert client.get("/wip", headers=GOOD).status_code == 200  # Render and local keep working


def test_api_docs_work_under_prefix(client):
    # The docs page must fetch /api/openapi.json, not /openapi.json (that's the site's).
    r = client.get("/api/docs")
    assert r.status_code == 200 and "/api/openapi.json" in r.text
    assert client.get("/api/openapi.json").status_code == 200


def test_api_prefix_health_is_never_throttled(client, monkeypatch):
    monkeypatch.setattr(main, "rate_limiter", main.RateLimiter(1))
    for _ in range(3):
        assert client.get("/api/health").status_code == 200


def test_health_is_never_throttled(client, monkeypatch):
    monkeypatch.setattr(main, "rate_limiter", main.RateLimiter(1))
    for _ in range(5):
        assert client.get("/health").status_code == 200


def test_429_carries_cors_headers(monkeypatch):
    # The limiter sits inside CORS, so the browser can actually read the 429.
    monkeypatch.setattr(main, "rate_limiter", main.RateLimiter(1))
    origin = "http://localhost:3000"  # allowed via conftest.py
    c = TestClient(main.app)
    c.get("/wip", headers={"Origin": origin})
    r = c.get("/wip", headers={"Origin": origin})
    assert r.status_code == 429
    assert r.headers.get("access-control-allow-origin") in (origin, "*")


def test_table_queries_use_service_role_client_when_configured(monkeypatch):
    # Under row-level security the publishable key sees nothing, so the API must query
    # with the service-role client whenever it is configured.
    service, public = object(), object()
    monkeypatch.setattr(main, "supabase", public)
    monkeypatch.setattr(main, "admin", service)
    assert main.raw_db() is service
    monkeypatch.setattr(main, "admin", None)
    assert main.raw_db() is public


# ─── Workspace scoping ───

class RecordingTable:
    def __init__(self): self.calls = []
    def select(self, *a, **k): self.calls.append(("select", a)); return self
    def insert(self, rows, *a, **k): self.calls.append(("insert", rows)); return self
    def update(self, data, *a, **k): self.calls.append(("update", data)); return self
    def delete(self, *a, **k): self.calls.append(("delete",)); return self
    def eq(self, col, val): self.calls.append(("eq", col, val)); return self


def test_every_query_is_pinned_to_the_current_workspace(monkeypatch):
    t = RecordingTable()
    monkeypatch.setattr(main, "admin", SimpleNamespace(table=lambda name: t))
    main._workspace.set(("w1", "lead", "u1"))
    main.db().table("tasks").select("id")
    main.db().table("tasks").update({"status": "New", "workspace_id": "w2"})
    main.db().table("tasks").delete()
    main.db().table("tasks").insert([{"description": "a"}, {"description": "b", "workspace_id": "w2"}])
    assert t.calls == [
        ("select", ("id",)), ("eq", "workspace_id", "w1"),
        ("update", {"status": "New"}), ("eq", "workspace_id", "w1"),   # can't move a row out
        ("delete",), ("eq", "workspace_id", "w1"),
        ("insert", [{"description": "a", "workspace_id": "w1"}, {"description": "b", "workspace_id": "w1"}]),
    ]


def test_no_workspace_means_no_queries():
    main._workspace.set(None)
    with pytest.raises(RuntimeError):
        main.db()
    main._workspace.set(("w1", "lead", "u1"))
    with pytest.raises(RuntimeError):
        main.db().table("workspace_members")  # not a workspace table: must use raw_db() deliberately


# ─── Phase 3c: notifications + approvals require a login ───

NOTIFY_READS = ["/notifications", "/approvals"]
NOTIFY_WRITES = ["/notifications/read", "/approvals/request", "/approvals/decide"]


@pytest.mark.parametrize("path", NOTIFY_READS)
def test_notify_read_rejects_anonymous(client, path):
    assert client.get(path).status_code == 401


@pytest.mark.parametrize("path", NOTIFY_READS)
def test_notify_read_rejects_bad_token(client, path):
    assert client.get(path, headers={"Authorization": "Bearer forged"}).status_code == 401


@pytest.mark.parametrize("path", NOTIFY_WRITES)
def test_notify_write_rejects_anonymous(client, path):
    # Rejected before the handler runs: 401 (auth) or 422 when required body
    # fields are missing (FastAPI validates the body first). Either way, no data
    # is touched without a valid session.
    assert client.post(path, json={}).status_code in (401, 422)


# Regression: the Phase 3c tables must be registered as workspace-scoped, or db() raises.
def test_phase3c_tables_are_workspace_scoped():
    assert {'notifications', 'approvals'} <= main.WORKSPACE_TABLES


def test_matcher_weights_table_is_workspace_scoped():
    assert 'matcher_weights' in main.WORKSPACE_TABLES


# Level 3: GitHub/Jira import + matcher calibration/weights require a login / permission.
L3_READS = ['/matcher/calibration', '/matcher/weights']
L3_WRITES = ['/import/github/preview', '/import/github/commit',
             '/import/jira/preview', '/import/jira/commit', '/matcher/weights']

@pytest.mark.parametrize('path', L3_READS)
def test_l3_read_rejects_anonymous(client, path):
    assert client.get(path).status_code == 401

@pytest.mark.parametrize('path', L3_WRITES)
def test_l3_write_rejects_anonymous(client, path):
    assert client.post(path, json={}).status_code in (401, 422)
