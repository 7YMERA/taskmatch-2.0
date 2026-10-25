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

def test_role_comes_from_app_metadata():
    assert main.role_of(user("a@x", app_role="admin")) == "admin"


def test_user_metadata_role_is_ignored():
    # A member can write {"role": "leader"} into their own user_metadata from the browser.
    assert main.role_of(user("m@x", user_role="leader")) == "member"
    assert main.role_of(user("m@x", user_role="admin")) == "member"


def test_unknown_or_missing_role_means_member():
    assert main.role_of(user("x@x")) == "member"
    assert main.role_of(user("x@x", app_role="superuser")) == "member"


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
    def eq(self, col, val): return Q([r for r in self.rows if r.get(col) == val])
    def in_(self, *a, **k): return self
    def update(self, *a, **k): return self
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
    }

    def __init__(self):
        self.auth = SimpleNamespace(get_user=FakeAuth().get_user, admin=FakeAdmin())

    def table(self, name):
        return Q([dict(r) for r in self.TABLES.get(name, [])])


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


def test_admin_sets_role_in_app_metadata(fake):
    r = TestClient(main.app).post("/set-role", json={"user_id": "um", "role": "lead"}, headers=bearer("admin"))
    assert r.status_code == 200, r.text
    uid, attrs = fake.auth.admin.updated[0]
    assert uid == "um" and attrs == {"app_metadata": {"role": "lead"}}


def test_last_admin_cannot_be_demoted(fake):
    r = TestClient(main.app).post("/set-role", json={"user_id": "ua", "role": "member"}, headers=bearer("admin"))
    assert r.status_code == 400
    assert fake.auth.admin.updated == []


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
