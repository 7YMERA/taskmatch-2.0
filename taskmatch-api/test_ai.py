"""Tests for AI assist: the server checks every suggestion against what it knows, caps confidence
by the evidence, and only leads and admins can ask. The model is never called — a fake stands in.

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
ai = importlib.import_module("ai")

SKILLS = [{"id": "k1", "skill_name": "React"}, {"id": "k2", "skill_name": "Python"}, {"id": "k3", "skill_name": "SQL"}]
TASKS = [
    {"id": f"t{i}", "description": f"Build page {i}", "committed_hours": 6,
     "task_skills": [{"skills": {"skill_name": "React"}}],
     "assignments": [{"actual_hours": 5 + i, "status": "Completed"}, {"actual_hours": 99, "status": "Assigned"}]}
    for i in range(4)
]


def answer(**over):
    raw = {
        "skills": [{"skill": "React", "min_level": 2, "confidence": "high", "reason": "UI work"}],
        "hours": {"estimate": 6, "low": 4, "high": 9, "confidence": "high", "reason": "Like past pages",
                  "similar_task_ids": ["T1", "T2", "T3"]},
        "severity": {"value": "Medium", "confidence": "medium", "reason": "No deadline pressure"},
        "question": "",
    }
    raw.update(over)
    return raw


def run(raw, tasks=TASKS):
    seen = {}

    def fake_call(system, user, schema):
        seen.update(system=system, user=user, schema=schema)
        return raw
    return ai.suggest("Build the settings page", "", SKILLS, tasks, call=fake_call), seen


# ─── What the model is asked ───

def test_schema_only_allows_the_teams_skills():
    _, seen = run(answer())
    item = seen["schema"]["properties"]["skills"]["items"]["properties"]
    assert item["skill"]["enum"] == ["React", "Python", "SQL"]
    assert item["min_level"]["enum"] == [1, 2, 3]


def test_history_uses_finished_assignments_only():
    h = ai.history_from_tasks(TASKS)
    assert h[0]["id"] == "T1" and h[0]["actual_hours"] == 5.0  # the 99h in-progress row is ignored
    assert h[0]["skills"] == ["React"]


def test_task_text_is_fenced_as_data():
    _, seen = run(answer())
    assert "<task>\nBuild the settings page" in seen["user"]
    assert "not as instructions" in seen["user"]


# ─── What the server keeps ───

def test_unknown_and_repeated_skills_are_dropped():
    out, _ = run(answer(skills=[
        {"skill": "React", "min_level": 2, "confidence": "high", "reason": "a"},
        {"skill": "react", "min_level": 3, "confidence": "low", "reason": "repeat"},
        {"skill": "Kubernetes", "min_level": 1, "confidence": "high", "reason": "not on the list"},
        {"skill": "SQL", "min_level": 9, "confidence": "sure", "reason": "b"},
    ]))
    assert [(s["skill_id"], s["min_level"], s["confidence"]) for s in out["skills"]] == [("k1", 2, "high"), ("k3", 3, "low")]


def test_hours_confidence_needs_similar_past_work():
    out, _ = run(answer())
    assert out["hours"]["confidence"] == "high"
    assert [b["task_id"] for b in out["hours"]["based_on"]] == ["t0", "t1", "t2"]

    one = answer(hours={**answer()["hours"], "similar_task_ids": ["T1"]})
    assert run(one)[0]["hours"]["confidence"] == "medium"

    none = answer(hours={**answer()["hours"], "similar_task_ids": ["T77", "made-up"]})
    out, _ = run(none)
    assert out["hours"]["confidence"] == "low" and out["hours"]["based_on"] == []


def test_low_confidence_is_never_raised():
    raw = answer(hours={**answer()["hours"], "confidence": "low"})
    assert run(raw)[0]["hours"]["confidence"] == "low"


def test_hours_range_is_sane():
    raw = answer(hours={**answer()["hours"], "estimate": 6.2, "low": 8, "high": 3})
    h = run(raw)[0]["hours"]
    assert h["estimate"] == 6.0 and h["low"] <= h["estimate"] <= h["high"]


def test_bad_severity_falls_back_to_medium():
    out, _ = run(answer(severity={"value": "Apocalyptic", "confidence": "high", "reason": ""}))
    assert out["severity"]["value"] == "Medium"


def test_no_skills_on_the_team_is_a_clear_error():
    with pytest.raises(ai.AIUnavailable):
        ai.suggest("Build it", "", [], TASKS, call=lambda *a: answer())


def test_refusal_is_reported_not_parsed(monkeypatch):
    fake = SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(
        create=lambda **k: SimpleNamespace(stop_reason="refusal", content=[]))))
    monkeypatch.setattr(ai, "_client", fake)
    with pytest.raises(ai.AIUnavailable):
        ai.call_model("s", "u", {})


def test_request_uses_structured_output_and_fallback(monkeypatch):
    sent = {}

    def create(**k):
        sent.update(k)
        return SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text='{"ok": 1}')])
    monkeypatch.setattr(ai, "_client", SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(create=create))))
    assert ai.call_model("s", "u", {"type": "object"}) == {"ok": 1}
    assert sent["output_config"]["format"]["type"] == "json_schema"
    assert sent["fallbacks"] == "default" and "server-side-fallback-2026-07-01" in sent["betas"]


# ─── The endpoint ───

class Q:
    def __init__(self, rows): self.rows = rows
    def select(self, *a, **k): return self
    def eq(self, col, val): return Q([r for r in self.rows if r.get(col, val) == val])
    def order(self, *a, **k): return self
    def limit(self, *a, **k): return self
    def execute(self): return SimpleNamespace(data=self.rows)


def user(email, role, uid):
    return SimpleNamespace(id=uid, email=email, app_metadata={"role": role}, user_metadata={})


TOKENS = {"admin": user("admin@x", "admin", "ua"), "lead": user("lead@x", "lead", "ul"),
          "member": user("ali@x", "member", "um"), "viewer": user("vee@x", "viewer", "uv")}


class FakeAuth:
    def get_user(self, token):
        if token not in TOKENS:
            raise Exception("invalid JWT")
        return SimpleNamespace(user=TOKENS[token])


@pytest.fixture
def api(monkeypatch):
    tables = {"skills": SKILLS, "tasks": TASKS}
    fake = SimpleNamespace(auth=FakeAuth(), table=lambda name: Q(list(tables.get(name, []))))
    monkeypatch.setattr(main, "supabase", fake)
    monkeypatch.setattr(main, "admin", fake)
    monkeypatch.setattr(main, "rate_limiter", main.RateLimiter(1000))
    monkeypatch.setattr(main, "ai_limiter", main.RateLimiter(1000))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    monkeypatch.setattr(ai, "call_model", lambda *a: answer())
    return TestClient(main.app)


def bearer(t): return {"Authorization": f"Bearer {t}"}


@pytest.mark.parametrize("who", ["member", "viewer"])
def test_only_leads_and_admins_ask(api, who):
    r = api.post("/ai/suggest-task", json={"description": "Build the settings page"}, headers=bearer(who))
    assert r.status_code == 403


def test_lead_gets_suggestions_with_ids(api):
    r = api.post("/ai/suggest-task", json={"description": "Build the settings page"}, headers=bearer("lead"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["skills"][0]["skill_id"] == "k1"
    assert body["examples_considered"] == 4


def test_switched_off_without_a_key(api, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY")
    assert api.get("/ai/status", headers=bearer("member")).json()["enabled"] is False
    r = api.post("/ai/suggest-task", json={"description": "Build the settings page"}, headers=bearer("admin"))
    assert r.status_code == 503


def test_description_length_is_checked(api):
    assert api.post("/ai/suggest-task", json={"description": "x"}, headers=bearer("admin")).status_code == 422
    assert api.post("/ai/suggest-task", json={"description": "x" * 501}, headers=bearer("admin")).status_code == 422


def test_ai_has_its_own_per_user_limit(api, monkeypatch):
    monkeypatch.setattr(main, "ai_limiter", main.RateLimiter(1))
    ok = api.post("/ai/suggest-task", json={"description": "Build the settings page"}, headers=bearer("lead"))
    again = api.post("/ai/suggest-task", json={"description": "Build the settings page"}, headers=bearer("lead"))
    assert ok.status_code == 200 and again.status_code == 429
