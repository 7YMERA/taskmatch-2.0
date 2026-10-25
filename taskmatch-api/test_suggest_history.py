"""Tests for the built-in suggestion engine (no AI): it works only from the team's finished tasks,
and its confidence follows how much evidence it found.

Run from taskmatch-api/:  python -m pytest
"""
import importlib
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
sh = importlib.import_module("suggest_history")

SKILLS = [{"id": "k1", "skill_name": "React"}, {"id": "k2", "skill_name": "Python"},
          {"id": "k3", "skill_name": "SQL"}, {"id": "k4", "skill_name": "UI/UX"}]


def task(i, desc, skills, hours, severity="Medium"):
    return {"id": f"t{i}", "description": desc, "committed_hours": 99, "severity": severity,
            "task_skills": [{"min_proficiency": lvl, "skills": {"skill_name": n}} for n, lvl in skills],
            "assignments": [{"actual_hours": hours, "status": "Completed"}]}


TASKS = [
    task(1, "Login page form validation", [("React", 2), ("UI/UX", 1)], 6),
    task(2, "Signup page form layout", [("React", 2)], 8),
    task(3, "Profile page form with photo upload", [("React", 3), ("UI/UX", 2)], 10),
    task(4, "Monthly sales SQL report", [("SQL", 2), ("Python", 1)], 4, "Low"),
    task(5, "Fix crash in payment webhook", [("Python", 3)], 3, "Critical"),
]


def test_words_drop_filler_and_stem():
    assert sh.words("Building the login forms") == {"build", "login", "form"}


def test_similar_pages_give_confident_react_and_hours():
    out = sh.suggest("Settings page form", "", SKILLS, TASKS)
    react = out["skills"][0]
    assert react["skill_name"] == "React" and react["confidence"] == "high" and react["min_level"] == 2
    assert out["hours"]["estimate"] == 8 and out["hours"]["low"] == 6 and out["hours"]["high"] == 10
    assert {b["task_id"] for b in out["hours"]["based_on"]} == {"t1", "t2", "t3"}
    assert all(s["skill_name"] != "SQL" for s in out["skills"])


def test_real_hours_beat_planned_hours():
    out = sh.suggest("Signup page form", "", SKILLS, TASKS)
    assert 99 not in [b["actual_hours"] for b in out["hours"]["based_on"]]


def test_named_skill_is_suggested_even_without_history():
    out = sh.suggest("Write a SQL query for churn", "", SKILLS, [])
    assert [(s["skill_name"], s["confidence"]) for s in out["skills"]] == [("SQL", "medium")]
    assert out["hours"]["confidence"] == "low"


def test_nothing_similar_asks_for_detail():
    out = sh.suggest("Organise the team offsite", "", SKILLS, TASKS)
    assert out["skills"] == [] and out["question"]
    assert out["hours"]["confidence"] == "low" and out["hours"]["based_on"] == []


def test_urgent_words_mean_critical():
    out = sh.suggest("Payment webhook crash in checkout", "", SKILLS, TASKS)
    assert out["severity"]["value"] == "Critical" and out["severity"]["confidence"] == "high"


def test_minor_words_mean_low():
    out = sh.suggest("Typo on the pricing page", "", SKILLS, TASKS)
    assert out["severity"]["value"] == "Low"


def test_one_loose_match_is_not_enough_for_a_skill():
    out = sh.suggest("Photo upload limits", "", SKILLS, TASKS)
    # only t3 is similar: one match, so its skills are suggested with low confidence or not at all
    assert all(s["confidence"] == "low" for s in out["skills"])


def test_same_shape_as_the_ai():
    out = sh.suggest("Settings page form", "", SKILLS, TASKS)
    assert set(out) >= {"skills", "hours", "severity", "question", "model", "examples_considered"}
    assert set(out["hours"]) >= {"estimate", "low", "high", "confidence", "reason", "based_on"}


# ─── Smarter matching: rare words, short forms, learned hints, estimate bias ───

def test_short_forms_read_as_the_full_word():
    assert sh.words("Fix the JS bundle and the db index") >= {"javascript", "database"}
    out = sh.suggest("Speed up the JS bundle", "", SKILLS + [{"id": "k5", "skill_name": "JavaScript"}], [])
    assert [s["skill_name"] for s in out["skills"]] == ["JavaScript"]


def test_rare_shared_words_count_for_more():
    docs = [sh.words(t["description"]) for t in TASKS]
    idf = sh.rarity(docs)
    form = sh.similarity({"form", "x"}, {"form", "y"}, idf)        # "form" is in 3 of 5 tasks
    webhook = sh.similarity({"webhook", "x"}, {"webhook", "y"}, idf)  # "webhook" is in 1
    assert webhook > form


def test_history_ties_a_word_to_a_skill():
    hist = [task(i, f"{d} login", [("Python", 2)], 4) for i, d in enumerate(["Audit", "Throttle", "Lock out", "Reset"])]
    hist += [task(9, "Billing export", [("SQL", 2)], 4), task(10, "Invoice table", [("SQL", 2)], 4),
             task(11, "Chart colours", [("UI/UX", 1)], 2), task(12, "Footer links", [("React", 1)], 2)]
    out = sh.suggest("Login rate limits", "", SKILLS, hist)
    py = next(s for s in out["skills"] if s["skill_name"] == "Python")
    assert "mention \u201clogin\u201d" in py["reason"] and py["confidence"] in ("high", "medium")


def test_note_when_the_team_runs_over_its_estimates():
    over = [dict(task(i, f"Thing {i}", [], 15), committed_hours=10) for i in range(4)]
    assert "longer than planned" in sh.estimate_bias(over)
    on = [dict(task(i, f"Thing {i}", [], 10), committed_hours=10) for i in range(4)]
    assert sh.estimate_bias(on) == ""
    assert sh.estimate_bias(over[:2]) == ""   # too few to say
