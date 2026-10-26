"""Tests for the approvals rules and the Jira host check. No database, no network.

Run from taskmatch-api/:  python -m pytest
"""
import importlib
import os
import sys
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(__file__))
main = importlib.import_module("main")


def user(email, role, uid):
    return SimpleNamespace(id=uid, email=email, app_metadata={"role": role}, user_metadata={})


TOKENS = {"lead": user("lead@x", "lead", "ul"), "member": user("ali@x", "member", "um"),
          "other": user("bea@x", "member", "ub")}


class Q:
    """A tiny query builder over shared rows: filters apply to select, update and execute."""
    def __init__(self, rows): self.rows, self.filters, self.patch = rows, [], None
    def select(self, *a, **k): return self
    def eq(self, col, val): self.filters.append((col, val)); return self
    def in_(self, *a, **k): return self
    def is_(self, *a, **k): return self
    def order(self, *a, **k): return self
    def limit(self, *a, **k): return self
    def update(self, data): self.patch = data; return self
    def insert(self, data):
        self.rows.append(dict(data)); self.inserted = [dict(data)]; return self

    def execute(self):
        if hasattr(self, "inserted"):
            return SimpleNamespace(data=self.inserted)
        hits = [r for r in self.rows if all(r.get(c) == v for c, v in self.filters if c != "workspace_id")]
        if self.patch is not None:
            for r in hits:
                r.update(self.patch)
        return SimpleNamespace(data=[dict(r) for r in hits])


class Fake:
    def __init__(self):
        self.tables = {
            "approvals": [
                {"id": "p1", "requested_by": "um", "kind": "other", "status": "pending"},
                {"id": "p2", "requested_by": "ub", "kind": "other", "status": "pending"},
            ],
            "workspace_members": [{"workspace_id": "w1", "user_id": u.id, "role": u.app_metadata["role"]}
                                  for u in TOKENS.values()],
        }
        self.auth = SimpleNamespace(get_user=lambda t: SimpleNamespace(user=TOKENS[t]))

    def table(self, name): return Q(self.tables.setdefault(name, []))


@pytest.fixture
def fake(monkeypatch):
    f = Fake()
    monkeypatch.setattr(main, "supabase", f)
    monkeypatch.setattr(main, "admin", f)
    monkeypatch.setattr(main, "rate_limiter", main.RateLimiter(1000))
    monkeypatch.setattr(main, "log_activity", lambda **k: None)
    monkeypatch.setattr(main, "notify", lambda *a, **k: None)
    monkeypatch.setattr(main, "notify_leaders", lambda *a, **k: None)
    return f


def bearer(t): return {"Authorization": f"Bearer {t}"}


def test_members_only_see_their_own_requests(fake):
    r = TestClient(main.app).get("/approvals", headers=bearer("member"))
    assert r.status_code == 200
    assert [a["id"] for a in r.json()["approvals"]] == ["p1"]


def test_leaders_see_every_request(fake):
    r = TestClient(main.app).get("/approvals", headers=bearer("lead"))
    assert sorted(a["id"] for a in r.json()["approvals"]) == ["p1", "p2"]


def test_client_cannot_file_a_critical_task_request(fake):
    r = TestClient(main.app).post("/approvals/request", headers=bearer("member"), json={
        "kind": "self_assign_critical", "payload": {"task_id": "t1", "student_id": "someone-else"}})
    assert r.status_code == 400
    assert len(fake.tables["approvals"]) == 2   # nothing recorded


def test_a_request_is_decided_only_once(fake):
    c = TestClient(main.app)
    first = c.post("/approvals/decide", headers=bearer("lead"), json={"approval_id": "p1", "decision": "rejected"})
    second = c.post("/approvals/decide", headers=bearer("lead"), json={"approval_id": "p1", "decision": "approved"})
    assert first.status_code == 200
    assert second.status_code == 409
    assert fake.tables["approvals"][0]["status"] == "rejected"


@pytest.mark.parametrize("typed, host", [
    ("yourco.atlassian.net", "yourco.atlassian.net"),
    ("https://YourCo.atlassian.net/", "yourco.atlassian.net"),
    ("https://yourco.atlassian.net/jira/software/projects", "yourco.atlassian.net"),
])
def test_jira_host_accepts_atlassian_cloud(typed, host):
    assert main._jira_host(typed) == host


@pytest.mark.parametrize("typed", [
    "169.254.169.254", "localhost", "evil.com", "atlassian.net.evil.com",
    "yourco.atlassian.net@evil.com", "http://internal:8080",
])
def test_jira_host_rejects_other_hosts(typed):
    with pytest.raises(HTTPException) as e:
        main._jira_host(typed)
    assert e.value.status_code == 422
