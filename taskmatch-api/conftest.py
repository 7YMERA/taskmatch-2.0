"""Shared test setup: dummy env so main.py imports without real Supabase creds.
Loaded by pytest before any test module, so these apply whichever file imports main first."""
import os

os.environ.setdefault("SUPABASE_URL", "https://test.local")
os.environ.setdefault("SUPABASE_KEY", "test-key")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")

import pytest


@pytest.fixture(autouse=True)
def one_workspace(monkeypatch):
    """Most tests run inside a single workspace "w1". The caller's role there is whatever their fake
    user carries in app_metadata.role (member if none), so tests written before workspaces keep
    meaning the same thing. Tests about workspaces themselves replace this."""
    import main

    def fake_resolve(user):
        role = (getattr(user, "app_metadata", None) or {}).get("role")
        return "w1", role if role in main.ROLES else "member"
    fake_resolve.original = main.resolve_workspace
    monkeypatch.setattr(main, "resolve_workspace", fake_resolve)
    return fake_resolve
