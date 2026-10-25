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
    assert set(out["hours"]) == {"estimate", "low", "high", "confidence", "reason", "based_on"}
