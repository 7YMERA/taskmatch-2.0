"""Unit tests for the outcome-feedback calibration (pure function, no DB)."""
import os
import sys

os.environ.setdefault("SUPABASE_URL", "https://test.local")
os.environ.setdefault("SUPABASE_KEY", "test")
sys.path.insert(0, os.path.dirname(__file__))

import matching


def _a(score, level, status="Completed"):
    return {"status": status, "score": score, "tasks": {"task_skills": [{"skill_id": "k1", "min_proficiency": level}]}}


def test_too_little_data_is_honest():
    r = matching.calibration([_a(0.8, 2)], {"k1": "Python"})
    assert r["overall"]["n"] == 1
    assert "Not enough" in r["verdict"]


def test_positive_correlation_reads_well():
    # higher required level -> higher score: strong positive correlation
    rows = [_a(0.5, 1), _a(0.7, 2), _a(0.9, 3), _a(0.6, 1), _a(0.95, 3)]
    r = matching.calibration(rows, {"k1": "Python"})
    assert r["overall"]["correlation"] is not None and r["overall"]["correlation"] > 0.3
    assert "line up well" in r["verdict"]


def test_skips_unscored_and_incomplete():
    rows = [_a(None, 2), _a(0.8, 2, status="In Progress"), _a(0.8, 2)]
    r = matching.calibration(rows, {"k1": "Python"})
    assert r["overall"]["n"] == 1   # only the one completed, scored row counts


def test_per_skill_breakdown_present():
    rows = [_a(0.8, 2), _a(0.6, 2), _a(0.7, 2)]
    r = matching.calibration(rows, {"k1": "Python"})
    assert any(s["skill_id"] == "k1" and s["n"] == 3 for s in r["skills"])
