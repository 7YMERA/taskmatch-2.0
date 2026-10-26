"""Unit tests for the matcher auto-tune (pure functions, no DB)."""
import os
import sys

os.environ.setdefault("SUPABASE_URL", "https://test.local")
os.environ.setdefault("SUPABASE_KEY", "test")
sys.path.insert(0, os.path.dirname(__file__))

import matching


def _pairs(skills_corr=True, n=12):
    """Build factor pairs where 'skills' tracks the score and the others don't."""
    out = {"skills": [], "experience": [], "availability": [], "record": []}
    for i in range(n):
        score = i / (n - 1)            # 0 .. 1
        out["skills"].append((score if skills_corr else 0.5, score))   # tracks (or flat)
        out["experience"].append((0.5, score))   # flat -> no correlation
        out["availability"].append((0.5, score))
        out["record"].append((0.5, score))
    return out


def test_not_enough_data_keeps_base():
    r = matching.suggest_weights({"skills": [(0.8, 0.9)]})
    assert r["tunable"] is False
    assert r["suggested"] == matching.WEIGHTS


def test_suggestion_preserves_total_and_floor():
    r = matching.suggest_weights(_pairs())
    assert r["tunable"] is True
    assert sum(r["suggested"].values()) == sum(matching.WEIGHTS.values())   # still sums to 100
    assert all(v >= matching.WEIGHT_FLOOR for v in r["suggested"].values())  # nothing zeroed


def test_predictive_factor_gains_weight():
    # 'skills' tracks the outcome; the others are flat -> skills should not lose weight.
    r = matching.suggest_weights(_pairs(skills_corr=True))
    assert r["suggested"]["skills"] >= matching.WEIGHTS["skills"] - 2   # retained or grown


def test_validate_weights_checks_input():
    # wrong total
    try:
        matching.validate_weights({"skills": 10, "experience": 10, "availability": 10, "record": 10})
        assert False, "should reject a total != 100"
    except ValueError:
        pass
    # missing a key
    try:
        matching.validate_weights({"skills": 100})
        assert False, "should reject missing keys"
    except ValueError:
        pass
    # valid
    clean = matching.validate_weights({"skills": 40, "experience": 25, "availability": 20, "record": 15})
    assert clean["skills"] == 40 and sum(clean.values()) == 100


def test_validate_weights_leaves_shared_defaults_alone():
    # The defaults are shared by every workspace on the server, so validating (or applying) one
    # workspace's weights must never change them.
    original = dict(matching.WEIGHTS)
    matching.validate_weights({"skills": 30, "experience": 30, "availability": 20, "record": 20})
    assert matching.WEIGHTS == original
