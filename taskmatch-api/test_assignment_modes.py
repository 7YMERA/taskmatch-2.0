"""Tests for the assignment modes (best match, round robin, least loaded) and the
/auto-assign endpoint. No database, no network — Supabase is swapped for a fake.

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


def cand(sid, name, qualified=True, match=2.0, wip=0):
    return {"student_id": sid, "name": name, "qualified": qualified, "match_score": match,
            "wip": wip, "met_count": 1, "total_required": 1}


# ─── pick_assignee: pure logic ───

class TestPickAssignee:
    def test_nobody_qualified_returns_none_with_reason(self):
        chosen, reason = main.pick_assignee([cand("a", "Ann", qualified=False)], "best_match")
        assert chosen is None
        assert "Nobody qualifies" in reason

    def test_unqualified_people_are_never_picked(self):
        pool = [cand("a", "Ann", qualified=False, match=3), cand("b", "Ben", match=1)]
        for mode in main.ASSIGNMENT_MODES:
            chosen, _ = main.pick_assignee(pool, mode)
            assert chosen["student_id"] == "b", mode

    def test_best_match_takes_top_of_ranked_list(self):
        pool = [cand("a", "Ann", match=3), cand("b", "Ben", match=2)]
        chosen, reason = main.pick_assignee(pool, "best_match")
        assert chosen["student_id"] == "a"
        assert reason.startswith("Best match")

    def test_round_robin_prefers_never_assigned(self):
        pool = [cand("a", "Ann"), cand("b", "Ben")]
        chosen, reason = main.pick_assignee(pool, "round_robin", last_assigned={"a": "2026-10-01"})
        assert chosen["student_id"] == "b"
        assert "has not been given a task yet" in reason

    def test_round_robin_picks_longest_since_last_assignment(self):
        pool = [cand("a", "Ann"), cand("b", "Ben"), cand("c", "Cat")]
        last = {"a": "2026-10-20", "b": "2026-10-02", "c": "2026-10-11"}
        chosen, reason = main.pick_assignee(pool, "round_robin", last_assigned=last)
        assert chosen["student_id"] == "b"
        assert "2026-10-02" in reason

    def test_round_robin_tie_goes_to_fewest_total_assignments(self):
        pool = [cand("a", "Ann"), cand("b", "Ben")]
        last = {"a": "2026-10-05", "b": "2026-10-05"}
        chosen, _ = main.pick_assignee(pool, "round_robin", last_assigned=last,
                                       total_assigned={"a": 4, "b": 1})
        assert chosen["student_id"] == "b"

    def test_round_robin_rotates_across_repeated_picks(self):
        # Simulate three tasks handed out one after another on the same rotation.
        pool = [cand("a", "Ann"), cand("b", "Ben"), cand("c", "Cat")]
        last, total, picked = {}, {}, []
        for day in ("2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"):
            chosen, _ = main.pick_assignee(pool, "round_robin", last, total)
            picked.append(chosen["student_id"])
            last[chosen["student_id"]] = day
            total[chosen["student_id"]] = total.get(chosen["student_id"], 0) + 1
        assert picked == ["a", "b", "c", "a"]

    def test_least_loaded_uses_committed_hours(self):
        pool = [cand("a", "Ann", wip=1), cand("b", "Ben", wip=2)]
        chosen, reason = main.pick_assignee(pool, "least_loaded", active_hours={"a": 20, "b": 6})
        assert chosen["student_id"] == "b"
        assert "6h" in reason

    def test_least_loaded_tie_goes_to_fewer_active_tasks(self):
        pool = [cand("a", "Ann", wip=2), cand("b", "Ben", wip=1)]
        chosen, _ = main.pick_assignee(pool, "least_loaded", active_hours={"a": 5, "b": 5})
        assert chosen["student_id"] == "b"

    def test_unknown_mode_raises(self):
        with pytest.raises(ValueError):
            main.pick_assignee([cand("a", "Ann")], "random")


# ─── /auto-assign endpoint ───

class FakeQuery:
    def __init__(self, store, name):
        self._store, self._name = store, name

    def select(self, *a, **k): return self
    def eq(self, *a, **k): return self
    def in_(self, *a, **k): return self

    def insert(self, row):
        self._store.inserted.append((self._name, row))
        return self

    def execute(self):
        return SimpleNamespace(data=self._store.TABLES.get(self._name, []))


class FakeAuth:
    def get_user(self, token):
        roles = {"leader-token": "lead", "student-token": "member"}
        if token not in roles:
            raise Exception("invalid JWT")
        return SimpleNamespace(user=SimpleNamespace(email=f"{roles[token]}@example.com",
                                                    app_metadata={"role": roles[token]}, user_metadata={}))


class FakeSupabase:
    TABLES = {
        "task_skills": [{"task_id": "t1", "skill_id": "k1", "min_proficiency": 2}],
        "student_skills": [
            {"student_id": "s1", "skill_id": "k1", "proficiency": 3},
            {"student_id": "s2", "skill_id": "k1", "proficiency": 2},
        ],
        # s1 was given a task more recently than s2, so round robin should pick s2.
        "assignments": [
            {"task_id": "t9", "student_id": "s1", "status": "Completed",
             "assigned_date": "2026-10-20", "tasks": {"committed_hours": 4}},
            {"task_id": "t8", "student_id": "s2", "status": "Completed",
             "assigned_date": "2026-10-01", "tasks": {"committed_hours": 4}},
        ],
        "skills": [{"id": "k1", "skill_name": "Python"}],
        "students": [
            {"id": "s1", "name": "Ali", "matric": "1", "programme": "CS"},
            {"id": "s2", "name": "Siti", "matric": "2", "programme": "IT"},
        ],
        "tasks": [{"id": "t1", "description": "Build API", "status": "New", "due_date": None}],
    }

    def __init__(self):
        self.auth = FakeAuth()
        self.inserted = []

    def table(self, name):
        return FakeQuery(self, name)


@pytest.fixture
def fake(monkeypatch):
    f = FakeSupabase()
    monkeypatch.setattr(main, "supabase", f)
    monkeypatch.setattr(main, "admin", None)
    monkeypatch.setattr(main, "rate_limiter", main.RateLimiter(1000))
    return f


LEADER = {"Authorization": "Bearer leader-token"}


def test_auto_assign_requires_leader(fake):
    client = TestClient(main.app)
    body = {"task_id": "t1", "mode": "best_match"}
    assert client.post("/auto-assign", json=body).status_code == 401
    r = client.post("/auto-assign", json=body, headers={"Authorization": "Bearer student-token"})
    assert r.status_code == 403


def test_auto_assign_rejects_unknown_mode(fake):
    r = TestClient(main.app).post("/auto-assign", json={"task_id": "t1", "mode": "random"}, headers=LEADER)
    assert r.status_code == 422


def test_dry_run_previews_without_assigning(fake):
    r = TestClient(main.app).post("/auto-assign", headers=LEADER,
                                  json={"task_id": "t1", "mode": "round_robin", "dry_run": True})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["student_id"] == "s2"
    assert body["reason"].startswith("Round robin")
    assert not [t for t, _ in fake.inserted if t == "assignments"]


def test_best_match_picks_the_stronger_skill(fake):
    body = TestClient(main.app).post("/auto-assign", headers=LEADER,
                                     json={"task_id": "t1", "mode": "best_match", "dry_run": True}).json()
    assert body["student_id"] == "s1"


def test_away_people_are_skipped_by_every_mode(fake, monkeypatch):
    students = [dict(s) for s in FakeSupabase.TABLES["students"]]
    students[0]["away_until"] = "2999-01-01"   # Ali is the best match but on leave
    monkeypatch.setitem(FakeSupabase.TABLES, "students", students)
    for mode in ("best_match", "round_robin", "least_loaded"):
        body = TestClient(main.app).post("/auto-assign", headers=LEADER,
                                         json={"task_id": "t1", "mode": mode, "dry_run": True}).json()
        assert body["student_id"] == "s2", mode


def test_away_shows_in_the_ranked_list(fake, monkeypatch):
    students = [dict(s) for s in FakeSupabase.TABLES["students"]]
    students[0]["away_until"] = "2999-01-01"
    monkeypatch.setitem(FakeSupabase.TABLES, "students", students)
    ali = next(c for c in main.score_candidates("t1") if c["student_id"] == "s1")
    assert ali["away"] and not ali["qualified"]
    assert ali["justification"].startswith("Away until")


def test_past_away_date_counts_as_back(fake, monkeypatch):
    students = [dict(s) for s in FakeSupabase.TABLES["students"]]
    students[0]["away_until"] = "2000-01-01"
    monkeypatch.setitem(FakeSupabase.TABLES, "students", students)
    ali = next(c for c in main.score_candidates("t1") if c["student_id"] == "s1")
    assert not ali["away"] and ali["qualified"]
