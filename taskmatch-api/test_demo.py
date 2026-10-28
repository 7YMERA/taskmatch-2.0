"""Tests for "Try the demo": the visitor is signed in on the server as a team lead in the demo
workspace, never an admin, and the password never leaves the server.

Run from taskmatch-api/:  python -m pytest
"""
import importlib
import os
import sys
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(__file__))
main = importlib.import_module("main")
from test_workspaces import Query  # noqa: E402  (the same in-memory query builder)


class FakeAdmin:
    def __init__(self):
        self.users, self.passwords = [], {}

    def list_users(self, page=1, per_page=200):
        return list(self.users) if page == 1 else []

    def create_user(self, attrs):
        u = SimpleNamespace(id=f"u{len(self.users)}", email=attrs["email"], app_metadata={})
        self.users.append(u)
        self.passwords[u.id] = attrs["password"]
        return SimpleNamespace(user=u)

    def get_user_by_id(self, uid):
        return SimpleNamespace(user=next(u for u in self.users if u.id == uid))

    def update_user_by_id(self, uid, attrs):
        u = next(u for u in self.users if u.id == uid)
        if "password" in attrs:
            self.passwords[uid] = attrs["password"]
        if "app_metadata" in attrs:
            u.app_metadata = attrs["app_metadata"]


class FakeClient:
    def __init__(self):
        self.data = {
            "workspaces": [{"id": "w1", "name": "Acme Studio"}],
            "workspace_members": [
                {"workspace_id": "w1", "user_id": "own", "email": "demo@taskmatch.app", "role": "admin", "joined_at": "1"},
            ],
        }
        self.auth = SimpleNamespace(admin=FakeAdmin())

    def table(self, name):
        return Query(self.data, name)


@pytest.fixture
def api(monkeypatch):
    f = FakeClient()
    monkeypatch.setattr(main, "supabase", f)
    monkeypatch.setattr(main, "admin", f)
    monkeypatch.setattr(main, "SUPABASE_SERVICE_ROLE_KEY", "service-key")
    monkeypatch.setattr(main, "demo_limiter", main.RateLimiter(1000))
    monkeypatch.delenv("DEMO_WORKSPACE_ID", raising=False)
    signed_in = []

    def fake_sign_in(email, password):
        user = next(u for u in f.auth.admin.users if u.email == email)
        if f.auth.admin.passwords[user.id] != password:
            raise Exception("Invalid login credentials")
        signed_in.append(email)
        return SimpleNamespace(session=SimpleNamespace(access_token="at", refresh_token="rt"))
    monkeypatch.setattr(main, "_demo_sign_in", fake_sign_in)
    c = TestClient(main.app)
    c.fake, c.signed_in = f, signed_in
    return c


def members(api):
    return [m for m in api.fake.data["workspace_members"] if m["email"] == main.DEMO_VISITOR_EMAIL]


def test_first_start_creates_the_visitor_as_a_team_lead(api):
    r = api.post("/demo/start")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body == {"access_token": "at", "refresh_token": "rt", "role": "lead"}
    assert [(m["workspace_id"], m["role"]) for m in members(api)] == [("w1", "lead")]
    assert api.fake.auth.admin.users[0].app_metadata["workspace_id"] == "w1"


def test_password_never_reaches_the_browser(api):
    r = api.post("/demo/start")
    assert main._demo_password() not in r.text


def test_second_start_reuses_the_visitor(api):
    api.post("/demo/start")
    api.post("/demo/start")
    assert len(api.fake.auth.admin.users) == 1 and len(members(api)) == 1


def test_a_changed_password_is_reset_on_the_next_start(api):
    api.post("/demo/start")
    uid = api.fake.auth.admin.users[0].id
    api.fake.auth.admin.passwords[uid] = "changed-by-a-visitor"
    assert api.post("/demo/start").status_code == 200


def test_a_promoted_visitor_goes_back_to_team_lead(api):
    api.post("/demo/start")
    members(api)[0]["role"] = "admin"
    api.post("/demo/start")
    assert members(api)[0]["role"] == "lead"


def test_no_demo_workspace_is_a_503(api):
    api.fake.data["workspace_members"] = []
    assert api.post("/demo/start").status_code == 503


def test_demo_starts_are_rate_limited(api, monkeypatch):
    monkeypatch.setattr(main, "demo_limiter", main.RateLimiter(1))
    assert api.post("/demo/start").status_code == 200
    r = api.post("/demo/start")
    assert r.status_code == 429 and "Retry-After" in r.headers
