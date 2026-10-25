"""Tests for workspaces: creating, switching, invite links, joining and leaving, and that every
request only sees its own workspace. Supabase is swapped for a small in-memory database.

Run from taskmatch-api/:  python -m pytest
"""
import importlib
import os
import sys
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(__file__))
main = importlib.import_module("main")


class Query:
    """Enough of supabase-py's builder: filters apply when the query runs."""

    def __init__(self, db, name):
        self.db, self.name, self.filters, self.op, self.payload = db, name, [], "select", None

    def select(self, *a, **k): return self
    def eq(self, col, val): self.filters.append(lambda r: r.get(col) == val); return self
    def in_(self, col, vals): self.filters.append(lambda r: r.get(col) in vals); return self
    def order(self, *a, **k): return self
    def limit(self, *a, **k): return self
    def insert(self, rows, *a, **k): self.op, self.payload = "insert", rows; return self
    def update(self, data, *a, **k): self.op, self.payload = "update", data; return self
    def delete(self, *a, **k): self.op = "delete"; return self

    def execute(self):
        rows = self.db.setdefault(self.name, [])
        hit = [r for r in rows if all(f(r) for f in self.filters)]
        if self.op == "insert":
            new = self.payload if isinstance(self.payload, list) else [self.payload]
            new = [{"id": f"{self.name}-{len(rows) + i}", **r} for i, r in enumerate(new)]
            rows.extend(new)
            return SimpleNamespace(data=new)
        if self.op == "update":
            for r in hit:
                r.update(self.payload)
        if self.op == "delete":
            self.db[self.name] = [r for r in rows if r not in hit]
        return SimpleNamespace(data=[dict(r) for r in hit])


USERS = {
    "ann": SimpleNamespace(id="ann", email="ann@x", app_metadata={"workspace_id": "w1"}, user_metadata={}, last_sign_in_at=None),
    "bob": SimpleNamespace(id="bob", email="bob@x", app_metadata={"workspace_id": "w1"}, user_metadata={}, last_sign_in_at=None),
    "cat": SimpleNamespace(id="cat", email="cat@x", app_metadata={}, user_metadata={}, last_sign_in_at=None),
    "eve": SimpleNamespace(id="eve", email="eve@x", app_metadata={"workspace_id": "w2"}, user_metadata={}, last_sign_in_at=None),
}


class FakeAdmin:
    def __init__(self): self.meta = {}
    def get_user_by_id(self, uid): return SimpleNamespace(user=USERS.get(uid))
    def list_users(self, page=1, per_page=200): return list(USERS.values()) if page == 1 else []

    def update_user_by_id(self, uid, attrs):
        self.meta[uid] = attrs["app_metadata"]
        USERS[uid].app_metadata = attrs["app_metadata"]


class FakeClient:
    def __init__(self):
        self.data = {
            "workspaces": [{"id": "w1", "name": "Acme"}, {"id": "w2", "name": "Globex"}],
            "workspace_members": [
                {"workspace_id": "w1", "user_id": "ann", "email": "ann@x", "role": "admin", "joined_at": "1"},
                {"workspace_id": "w1", "user_id": "bob", "email": "bob@x", "role": "member", "joined_at": "2"},
                {"workspace_id": "w2", "user_id": "eve", "email": "eve@x", "role": "admin", "joined_at": "1"},
            ],
            "workspace_invites": [],
            "students": [{"id": "s1", "name": "Bob", "email": "bob@x", "workspace_id": "w1"},
                         {"id": "s9", "name": "Spy", "email": "spy@x", "workspace_id": "w2"}],
            "assignments": [], "skills": [], "tasks": [], "activity_logs": [],
        }
        self.auth = SimpleNamespace(get_user=self.get_user, admin=FakeAdmin())

    def get_user(self, token):
        if token not in USERS:
            raise Exception("invalid JWT")
        return SimpleNamespace(user=USERS[token])

    def table(self, name):
        return Query(self.data, name)


@pytest.fixture
def api(monkeypatch, one_workspace):
    monkeypatch.setattr(main, "resolve_workspace", one_workspace.original)  # the real thing here
    for u, ws in (("ann", "w1"), ("bob", "w1"), ("cat", None), ("eve", "w2")):
        USERS[u].app_metadata = {"workspace_id": ws} if ws else {}
    f = FakeClient()
    monkeypatch.setattr(main, "supabase", f)
    monkeypatch.setattr(main, "admin", f)
    monkeypatch.setattr(main, "rate_limiter", main.RateLimiter(1000))
    c = TestClient(main.app)
    c.fake = f
    return c


def as_(u): return {"Authorization": f"Bearer {u}"}


# ─── Isolation ───

def test_each_workspace_sees_only_its_own_people(api):
    ann = api.get("/student-stats", headers=as_("ann")).json()["stats"]
    eve = api.get("/student-stats", headers=as_("eve")).json()["stats"]
    assert [s["student_id"] for s in ann] == ["s1"]
    assert [s["student_id"] for s in eve] == ["s9"]


def test_no_workspace_yet_is_a_409(api):
    r = api.get("/wip", headers=as_("cat"))
    assert r.status_code == 409 and r.json()["detail"] == "no_workspace"
    assert api.get("/workspaces", headers=as_("cat")).json()["workspaces"] == []


def test_pointing_at_a_workspace_you_left_falls_back(api):
    USERS["bob"].app_metadata = {"workspace_id": "w2"}   # not a member of w2
    body = api.get("/workspaces", headers=as_("bob")).json()
    assert body["current"] == "w1" and body["role"] == "member"


def test_logs_are_stamped_with_the_workspace(api):
    api.post("/workspaces/invites", json={"role": "member"}, headers=as_("ann"))
    assert api.fake.data["activity_logs"][-1]["workspace_id"] == "w1"


# ─── Create and switch ───

def test_create_workspace_makes_you_admin_and_opens_it(api):
    r = api.post("/workspaces", json={"name": "  New Co "}, headers=as_("cat"))
    assert r.status_code == 200, r.text
    ws = r.json()["id"]
    members = [m for m in api.fake.data["workspace_members"] if m["workspace_id"] == ws]
    assert [(m["user_id"], m["role"]) for m in members] == [("cat", "admin")]
    assert USERS["cat"].app_metadata["workspace_id"] == ws
    assert len([s for s in api.fake.data["skills"] if s["workspace_id"] == ws]) == len(main.STARTER_SKILLS)
    assert next(w for w in api.fake.data["workspaces"] if w["id"] == ws)["name"] == "New Co"


def test_switch_only_to_your_own_workspaces(api):
    assert api.post("/workspaces/switch", json={"workspace_id": "w2"}, headers=as_("bob")).status_code == 403
    api.fake.data["workspace_members"].append({"workspace_id": "w2", "user_id": "bob", "email": "bob@x", "role": "viewer", "joined_at": "3"})
    r = api.post("/workspaces/switch", json={"workspace_id": "w2"}, headers=as_("bob"))
    assert r.status_code == 200 and r.json()["role"] == "viewer"
    assert USERS["bob"].app_metadata == {"workspace_id": "w2", "role": "viewer"}


def test_only_admins_rename(api):
    assert api.patch("/workspaces/current", json={"name": "X"}, headers=as_("bob")).status_code == 403
    assert api.patch("/workspaces/current", json={"name": "Acme Ltd"}, headers=as_("ann")).status_code == 200
    assert api.fake.data["workspaces"][0]["name"] == "Acme Ltd"


# ─── Invites ───

def test_only_admins_create_invites(api):
    assert api.post("/workspaces/invites", json={"role": "member"}, headers=as_("bob")).status_code == 403


def test_join_with_invite(api):
    code = api.post("/workspaces/invites", json={"role": "lead", "days": 3}, headers=as_("ann")).json()["code"]
    assert api.get(f"/invites/{code}", headers=as_("cat")).json() == {"workspace": "Acme", "role": "lead", "valid": True}
    r = api.post("/workspaces/join", json={"code": code}, headers=as_("cat"))
    assert r.status_code == 200 and r.json()["role"] == "lead"
    assert {"workspace_id": "w1", "user_id": "cat", "email": "cat@x", "role": "lead"}.items() <= \
        next(m for m in api.fake.data["workspace_members"] if m["user_id"] == "cat").items()
    assert api.fake.data["workspace_invites"][0]["uses"] == 1
    assert USERS["cat"].app_metadata["workspace_id"] == "w1"


def test_joining_again_never_changes_your_role(api):
    code = api.post("/workspaces/invites", json={"role": "admin"}, headers=as_("ann")).json()["code"]
    r = api.post("/workspaces/join", json={"code": code}, headers=as_("bob"))
    assert r.json()["role"] == "member" and r.json()["already_member"]


def test_revoked_expired_and_used_up_invites_fail(api):
    code = api.post("/workspaces/invites", json={"role": "member", "max_uses": 1}, headers=as_("ann")).json()["code"]
    api.post("/workspaces/join", json={"code": code}, headers=as_("cat"))
    assert api.post("/workspaces/join", json={"code": code}, headers=as_("eve")).status_code == 400   # used up

    code2 = api.post("/workspaces/invites", json={"role": "member"}, headers=as_("ann")).json()["code"]
    api.delete(f"/workspaces/invites/{code2}", headers=as_("ann"))
    assert api.post("/workspaces/join", json={"code": code2}, headers=as_("eve")).status_code == 400  # revoked

    code3 = api.post("/workspaces/invites", json={"role": "member"}, headers=as_("ann")).json()["code"]
    inv = next(i for i in api.fake.data["workspace_invites"] if i["code"] == code3)
    inv["expires_at"] = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    assert api.post("/workspaces/join", json={"code": code3}, headers=as_("eve")).status_code == 400  # expired
    assert api.post("/workspaces/join", json={"code": "nope-nope"}, headers=as_("eve")).status_code == 400


def test_an_admin_cannot_revoke_another_workspaces_invite(api):
    code = api.post("/workspaces/invites", json={"role": "member"}, headers=as_("ann")).json()["code"]
    api.delete(f"/workspaces/invites/{code}", headers=as_("eve"))
    assert api.fake.data["workspace_invites"][0].get("revoked") is not True


# ─── Members ───

def test_accounts_lists_only_this_workspace(api):
    emails = [a["email"] for a in api.get("/accounts", headers=as_("ann")).json()["accounts"]]
    assert emails == ["ann@x", "bob@x"]


def test_member_can_leave_but_not_remove_others(api):
    assert api.delete("/workspaces/members/ann", headers=as_("bob")).status_code == 403
    assert api.delete("/workspaces/members/bob", headers=as_("bob")).status_code == 200
    assert not any(m["user_id"] == "bob" for m in api.fake.data["workspace_members"])


def test_last_admin_cannot_leave(api):
    r = api.delete("/workspaces/members/ann", headers=as_("ann"))
    assert r.status_code == 400


def test_admin_cannot_touch_members_of_another_workspace(api):
    assert api.delete("/workspaces/members/eve", headers=as_("ann")).status_code == 404
    assert api.post("/set-role", json={"user_id": "eve", "role": "viewer"}, headers=as_("ann")).status_code == 404
