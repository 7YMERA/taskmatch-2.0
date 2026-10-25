"""Tests for roles and permissions: where the role is read from, the permission table, and the
endpoints that check it. No database, no network — Supabase is swapped for a fake.

Run from taskmatch-api/:  python -m pytest
"""
import importlib
import json
import os
import sys
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(__file__))
main = importlib.import_module("main")

PERMISSIONS_JSON = os.path.join(os.path.dirname(__file__), "..", "taskmatch", "app", "lib", "permissions.json")


def user(email, app_role=None, user_role=None, uid="u"):
    return SimpleNamespace(id=uid, email=email, created_at=None, last_sign_in_at=None,
                           app_metadata={"role": app_role} if app_role else {},
                           user_metadata={"role": user_role} if user_role else {})


# ─── Where the role comes from ───
# A role belongs to a workspace membership (workspace_members). Nothing the user can edit about
# their own account changes it.

class MembersOnly:
    """Just enough of a client for role_of(): the workspace_members table."""
    def __init__(self, rows): self.rows = rows
    def table(self, name): return Q([dict(r) for r in self.rows] if name == "workspace_members" else [])


@pytest.fixture
def in_w1(monkeypatch):
    monkeypatch.setattr(main, "admin", MembersOnly([
        {"workspace_id": "w1", "user_id": "a", "role": "admin"},
        {"workspace_id": "w2", "user_id": "m", "role": "admin"},
        {"workspace_id": "w1", "user_id": "m", "role": "member"},
    ]))
    main._workspace.set(("w1", "lead", "caller"))


def test_role_comes_from_the_workspace_membership(in_w1):
    assert main.role_of(user("a@x", uid="a")) == "admin"


def test_role_is_per_workspace(in_w1):
    # m is an admin in w2 but only a member here.
    assert main.role_of(user("m@x", uid="m")) == "member"


def test_metadata_roles_are_ignored(in_w1):
    assert main.role_of(user("m@x", app_role="admin", user_role="leader", uid="m")) == "member"


def test_not_a_member_means_no_role(in_w1):
    assert main.role_of(user("x@x", app_role="admin", uid="x")) == "none"
    assert not any(main.can("none", p) for p in main.ROLE_PERMISSIONS)


def test_resolve_workspace_checks_membership(monkeypatch, one_workspace):
    resolve = one_workspace.original
    rows = [{"workspace_id": "w1", "role": "member"}, {"workspace_id": "w2", "role": "admin"}]
    monkeypatch.setattr(main, "memberships", lambda uid: rows)
    pick = lambda ws: SimpleNamespace(id="u", app_metadata={"workspace_id": ws} if ws else {})
    assert resolve(pick("w2")) == ("w2", "admin")
    assert resolve(pick("w9")) == ("w1", "member")   # not a member of w9: falls back to their first
    assert resolve(pick(None)) == ("w1", "member")
    monkeypatch.setattr(main, "memberships", lambda uid: [])
    assert resolve(pick("w1")) == (None, "none")      # removed from everything


@pytest.mark.skipif(not os.path.exists(PERMISSIONS_JSON), reason="frontend not checked out")
def test_permission_table_matches_frontend():
    data = json.load(open(PERMISSIONS_JSON))
    assert [r["key"] for r in data["roles"]] == list(main.ROLES)
    assert {p["key"]: set(p["roles"]) for p in data["permissions"]} == main.ROLE_PERMISSIONS


def test_viewer_can_change_nothing():
    assert [p for p, roles in main.ROLE_PERMISSIONS.items() if "viewer" in roles] == []


# ─── Endpoints ───

class Q:
    def __init__(self, rows): self.rows = rows
    def select(self, *a, **k): return self
    def eq(self, col, val): return Q([r for r in self.rows if r.get(col, val) == val])
    def in_(self, *a, **k): return self
    def update(self, data, *a, **k):
        getattr(self, "log", []).append((getattr(self, "name", None), data))
        return self
    def insert(self, *a, **k): return self
    def delete(self, *a, **k): return self
    def execute(self): return SimpleNamespace(data=self.rows)


TOKENS = {
    "admin": user("admin@x", "admin", uid="ua"),
    "lead": user("lead@x", "lead", uid="ul"),
    "member": user("ali@x", "member", uid="um"),
    "viewer": user("vee@x", "viewer", uid="uv"),
    "sneaky": user("sneaky@x", user_role="leader", uid="us"),
}


class FakeAuth:
    def get_user(self, token):
        if token not in TOKENS:
            raise Exception("invalid JWT")
        return SimpleNamespace(user=TOKENS[token])


class FakeAdmin:
    def __init__(self):
        self.users = {u.id: u for u in TOKENS.values()}
        self.updated = []

    def list_users(self, page=1, per_page=200):
        return list(self.users.values()) if page == 1 else []

    def get_user_by_id(self, uid):
        return SimpleNamespace(user=self.users.get(uid))

    def update_user_by_id(self, uid, attrs):
        self.updated.append((uid, attrs))


class FakeClient:
    TABLES = {
        "students": [{"id": "s1", "name": "Ali", "email": "ali@x"}, {"id": "s2", "name": "Bea", "email": "bea@x"}],
        "assignments": [{"id": "a1", "task_id": "t1", "student_id": "s1", "status": "In Progress", "in_progress_at": None},
                        {"id": "a2", "task_id": "t1", "student_id": "s2", "status": "Assigned", "in_progress_at": None}],
        "tasks": [{"id": "t1", "description": "Build API", "status": "In Progress", "due_date": None, "committed_hours": 4}],
        "workspace_members": [{"workspace_id": "w1", "user_id": u.id, "email": u.email,
                               "role": (u.app_metadata or {}).get("role") or "member", "joined_at": None}
                              for u in TOKENS.values()],
    }

    def __init__(self):
        self.auth = SimpleNamespace(get_user=FakeAuth().get_user, admin=FakeAdmin())
        self.writes = []

    def table(self, name):
        q = Q([dict(r) for r in self.TABLES.get(name, [])])
        q.log, q.name = self.writes, name
        return q


@pytest.fixture
def fake(monkeypatch):
    f = FakeClient()
    monkeypatch.setattr(main, "supabase", f)
    monkeypatch.setattr(main, "admin", f)
    monkeypatch.setattr(main, "rate_limiter", main.RateLimiter(1000))
    monkeypatch.setattr(main, "log_activity", lambda **k: None)
    return f


def bearer(t): return {"Authorization": f"Bearer {t}"}


@pytest.mark.parametrize("who", ["member", "viewer", "sneaky"])
def test_only_leads_and_admins_assign_others(fake, who):
    r = TestClient(main.app).post("/assign", json={"task_id": "t1", "student_id": "s2"}, headers=bearer(who))
    assert r.status_code == 403


@pytest.mark.parametrize("who", ["member", "viewer", "lead", "sneaky"])
def test_only_admins_change_roles(fake, who):
    r = TestClient(main.app).post("/set-role", json={"user_id": "um", "role": "admin"}, headers=bearer(who))
    assert r.status_code == 403
    assert fake.auth.admin.updated == []


def test_admin_sets_role_in_the_workspace(fake):
    r = TestClient(main.app).post("/set-role", json={"user_id": "um", "role": "lead"}, headers=bearer("admin"))
    assert r.status_code == 200, r.text
    assert ("workspace_members", {"role": "lead"}) in fake.writes


def test_cannot_set_role_for_someone_outside_the_workspace(fake):
    r = TestClient(main.app).post("/set-role", json={"user_id": "stranger", "role": "lead"}, headers=bearer("admin"))
    assert r.status_code == 404


def test_last_admin_cannot_be_demoted(fake):
    r = TestClient(main.app).post("/set-role", json={"user_id": "ua", "role": "member"}, headers=bearer("admin"))
    assert r.status_code == 400
    assert fake.writes == []


def test_old_role_names_are_rejected(fake):
    r = TestClient(main.app).post("/set-role", json={"user_id": "um", "role": "leader"}, headers=bearer("admin"))
    assert r.status_code == 422


def test_member_can_start_their_own_assignment(fake):
    r = TestClient(main.app).post("/start", json={"assignment_id": "a1"}, headers=bearer("member"))
    assert r.status_code == 200, r.text


def test_member_cannot_start_someone_elses_assignment(fake):
    r = TestClient(main.app).post("/start", json={"assignment_id": "a2"}, headers=bearer("member"))
    assert r.status_code == 403


def test_member_cannot_complete_someone_elses_assignment(fake):
    r = TestClient(main.app).post("/complete", json={"assignment_id": "a2"}, headers=bearer("member"))
    assert r.status_code == 403


def test_viewer_cannot_start_work(fake):
    r = TestClient(main.app).post("/start", json={"assignment_id": "a1"}, headers=bearer("viewer"))
    assert r.status_code == 403


def test_lead_can_start_anyones_assignment(fake):
    r = TestClient(main.app).post("/start", json={"assignment_id": "a2"}, headers=bearer("lead"))
    assert r.status_code == 200, r.text


def test_viewer_cannot_self_assign(fake):
    r = TestClient(main.app).post("/self-assign", json={"task_id": "t1"}, headers=bearer("viewer"))
    assert r.status_code == 403


def test_member_cannot_unassign(fake):
    r = TestClient(main.app).post("/unassign", json={"assignment_id": "a2"}, headers=bearer("member"))
    assert r.status_code == 403
