"""Tests for the fit score (matching.py) and the endpoints built on it: /match/people and
/people/insights. No database, no network.

Run from taskmatch-api/:  python -m pytest
"""
import importlib
import os
import sys
from datetime import date
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(__file__))
matching = importlib.import_module("matching")
main = importlib.import_module("main")

TODAY = date(2026, 10, 25)
NAMES = {"k1": "React", "k2": "SQL"}


def done(sid, skills, completed="2026-10-01", due="2026-10-05", score=0.6, desc="Login page form"):
    return {"student_id": sid, "task_id": f"t-{sid}-{completed}", "status": "Completed", "score": score,
            "completed_at": completed + "T10:00:00+00:00", "assigned_date": completed,
            "tasks": {"description": desc, "committed_hours": 4, "due_date": due,
                      "task_skills": [{"skill_id": k, "min_proficiency": lvl} for k, lvl in skills]}}


def active(sid, hours=5):
    return {"student_id": sid, "task_id": f"a-{sid}-{hours}", "status": "In Progress", "assigned_date": "2026-10-20",
            "tasks": {"description": "Something", "committed_hours": hours, "due_date": None, "task_skills": []}}


def profiles(students, skills, assignments):
    return matching.build_profiles(students, skills, assignments, today=TODAY)


PEOPLE = [{"id": "a", "name": "Ann"}, {"id": "b", "name": "Ben"}, {"id": "c", "name": "Cat", "away_until": "2999-01-01"}]
DECLARED = [{"student_id": "a", "skill_id": "k1", "proficiency": 3},
            {"student_id": "b", "skill_id": "k1", "proficiency": 3},
            {"student_id": "c", "skill_id": "k1", "proficiency": 3}]


class TestFit:
    def test_score_is_explained_and_adds_up(self):
        p = profiles(PEOPLE, DECLARED, [])["a"]
        score, factors = matching.fit(p, {"k1": 2}, NAMES)
        assert [f["key"] for f in factors] == ["skills", "experience", "availability", "record"]
        assert score == round(sum(f["points"] for f in factors))
        assert all(0 <= f["points"] <= f["max"] for f in factors)
        assert sum(f["max"] for f in factors) == 100

    def test_proven_experience_beats_a_bare_claim(self):
        ps = profiles(PEOPLE, DECLARED, [done("a", [("k1", 2)])])
        a, _ = matching.fit(ps["a"], {"k1": 2}, NAMES)
        b, _ = matching.fit(ps["b"], {"k1": 2}, NAMES)
        assert a > b

    def test_old_evidence_fades(self):
        assert matching.decay(TODAY, TODAY) == 1
        half = date.fromordinal(TODAY.toordinal() - matching.EVIDENCE_HALF_LIFE_DAYS)
        assert matching.decay(half, TODAY) == pytest.approx(0.5)

    def test_busy_people_score_lower_on_availability(self):
        ps = profiles(PEOPLE, DECLARED, [active("a", 15), active("a", 4)])
        _, fa = matching.fit(ps["a"], {"k1": 2}, NAMES)
        _, fb = matching.fit(ps["b"], {"k1": 2}, NAMES)
        avail = lambda fs: next(f for f in fs if f["key"] == "availability")
        assert avail(fa)["points"] < avail(fb)["points"]
        assert "19h of 20h" in avail(fa)["detail"]

    def test_missing_a_skill_caps_the_score(self):
        p = profiles(PEOPLE, DECLARED, [done("a", [], completed="2026-10-01", due="2026-10-05")] * 4)["a"]
        score, _ = matching.fit(p, {"k1": 2, "k2": 1}, NAMES)
        assert score <= matching.MISSING_CAP

    def test_away_gets_no_availability(self):
        _, f = matching.fit(profiles(PEOPLE, DECLARED, [])["c"], {"k1": 2}, NAMES)
        assert next(x for x in f if x["key"] == "availability")["points"] == 0

    def test_late_work_lowers_the_track_record(self):
        ps = profiles(PEOPLE, DECLARED, [done("a", [], completed="2026-10-01", due="2026-10-05"),
                                         done("b", [], completed="2026-10-09", due="2026-10-05")])
        rec = lambda sid: next(f for f in matching.fit(ps[sid], {"k1": 2}, NAMES)[1] if f["key"] == "record")
        assert rec("a")["points"] > rec("b")["points"]
        assert rec("a")["detail"].startswith("1 of 1 on time")

    def test_no_history_is_neutral_not_zero(self):
        rec = next(f for f in matching.fit(profiles(PEOPLE, DECLARED, [])["a"], {"k1": 2}, NAMES)[1] if f["key"] == "record")
        assert rec["points"] == pytest.approx(7.5)

    def test_similar_wording_counts_as_experience(self):
        ps = profiles(PEOPLE, DECLARED, [done("a", [], desc="Checkout payment webhook")])
        words = matching.suggest_history.words("Payment webhook retries")
        exp = lambda sid: next(f for f in matching.fit(ps[sid], {"k1": 2}, NAMES, words)[1] if f["key"] == "experience")
        assert exp("a")["points"] > exp("b")["points"] == 0


class TestTeamViews:
    def test_mentor_is_the_strongest_available_holder(self):
        ps = profiles(PEOPLE, DECLARED, [done("b", [("k1", 3)])])
        assert matching.mentor_for("k1", ps)["student_id"] == "b"         # proven beats bare claim
        assert matching.mentor_for("k1", ps, exclude={"b"})["student_id"] == "a"
        assert matching.mentor_for("k2", ps) is None

    def test_skill_risk(self):
        skills = [{"id": "k1", "skill_name": "React"}, {"id": "k2", "skill_name": "SQL"}, {"id": "k3", "skill_name": "Go"}]
        declared = DECLARED + [{"student_id": "a", "skill_id": "k2", "proficiency": 2}]
        demand = [{"task_id": "t1", "skill_id": "k2", "min_proficiency": 2},
                  {"task_id": "t2", "skill_id": "k3", "min_proficiency": 1}]
        health = {h["skill_name"]: h for h in matching.skill_health(skills, profiles(PEOPLE, declared, []), demand)}
        assert health["Go"]["risk"] == "gap" and health["Go"]["open_tasks"] == 1
        assert health["SQL"]["risk"] == "single"
        assert health["React"]["risk"] == "ok" and health["React"]["advanced"] == 3

    def test_proven_skills_list(self):
        p = profiles(PEOPLE, DECLARED, [done("a", [("k1", 2)]), done("a", [("k1", 3)], completed="2026-10-10")])["a"]
        [r] = matching.proven_skills(p, NAMES)
        assert (r["skill_name"], r["count"], r["level"], r["last"]) == ("React", 2, 3, "2026-10-10")


# ─── Endpoints ───

class FakeQuery:
    def __init__(self, rows): self._rows = rows
    def select(self, *a, **k): return self
    def eq(self, *a, **k): return self
    def in_(self, *a, **k): return self
    def execute(self): return SimpleNamespace(data=self._rows)


class FakeSupabase:
    TABLES = {
        "students": [{"id": "a", "name": "Ann"}, {"id": "b", "name": "Ben"}],
        "student_skills": [{"student_id": "a", "skill_id": "k1", "proficiency": 3},
                           {"student_id": "b", "skill_id": "k1", "proficiency": 1}],
        "skills": [{"id": "k1", "skill_name": "React"}, {"id": "k2", "skill_name": "SQL"}],
        "assignments": [done("a", [("k1", 2)])],
        "tasks": [{"id": "t1", "description": "SQL report", "status": "New", "due_date": None,
                   "task_skills": [{"skill_id": "k2", "min_proficiency": 2}]}],
    }

    def __init__(self):
        self.auth = SimpleNamespace(get_user=lambda t: SimpleNamespace(
            user=SimpleNamespace(email="lead@example.com", app_metadata={"role": "lead"}, user_metadata={})))

    def table(self, name):
        return FakeQuery(self.TABLES.get(name, []))


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(main, "supabase", FakeSupabase())
    monkeypatch.setattr(main, "admin", None)
    monkeypatch.setattr(main, "rate_limiter", main.RateLimiter(1000))
    return TestClient(main.app)


AUTH = {"Authorization": "Bearer t"}


def test_match_people_ranks_by_fit(client):
    r = client.post("/match/people", headers=AUTH, json={"skills": [{"skill_id": "k1", "min_level": 2}]})
    assert r.status_code == 200, r.text
    recs = r.json()["recommendations"]
    assert [x["student_id"] for x in recs] == ["a", "b"]
    assert recs[0]["qualified"] and not recs[1]["qualified"]
    assert recs[0]["fit_score"] > recs[1]["fit_score"]
    assert recs[0]["proven"] == ["React"]
    assert recs[1]["mentor"]["name"] == "Ann"            # Ben is below the level; Ann can teach it
    assert "Ann as a mentor" in recs[1]["justification"]


def test_match_people_needs_a_skill_and_a_login(client):
    assert client.post("/match/people", headers=AUTH, json={"skills": []}).status_code == 422
    assert client.post("/match/people", json={"skills": [{"skill_id": "k1"}]}).status_code == 401


def test_insights_find_the_gap(client):
    body = client.get("/people/insights", headers=AUTH).json()
    assert body["summary"]["gaps"] == 1 and body["summary"]["hard_to_staff"] == 1
    assert body["hard_to_staff"][0]["missing"] == ["SQL"]
    sql = next(s for s in body["skills"] if s["skill_name"] == "SQL")
    assert sql["risk"] == "gap"
    ann = next(p for p in body["people"] if p["name"] == "Ann")
    assert ann["proven"][0]["skill_name"] == "React"
    assert body["summary"]["proven_share"] == 0.5
