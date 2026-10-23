"""Unit tests for TaskMatch's pure logic — no database, no network.

These cover the matcher's banding and the SLA auto-close rule: the parts that
decide *who* gets paired and *when* a task locks. They give us a safety net so
the matching behaviour can't silently change.

Run from taskmatch-api/:  python -m pytest
"""
import os
import sys
import importlib
from datetime import date, datetime, timedelta, timezone

import pytest

# main.py refuses to import without Supabase creds. Tests never touch the DB,
# so we set dummy values just so the module loads, then import it.
os.environ.setdefault("SUPABASE_URL", "https://test.local")
os.environ.setdefault("SUPABASE_KEY", "test-key")

sys.path.insert(0, os.path.dirname(__file__))
main = importlib.import_module("main")


# ─── score_band: avg score + completed count -> band ───

class TestScoreBand:
    def test_no_completed_tasks_is_unrated(self):
        # A student who has finished nothing can't be judged yet -> learner.
        assert main.score_band(0.9, 0) == "unrated"
        assert main.score_band(None, 0) == "unrated"

    def test_none_score_is_unrated(self):
        assert main.score_band(None, 5) == "unrated"

    def test_high_band_at_and_above_threshold(self):
        assert main.score_band(0.6, 3) == "high"
        assert main.score_band(0.95, 10) == "high"

    def test_avg_band_between_thresholds(self):
        assert main.score_band(0.4, 2) == "avg"
        assert main.score_band(0.59, 2) == "avg"

    def test_low_band_below_avg_threshold(self):
        assert main.score_band(0.39, 2) == "low"
        assert main.score_band(0.0, 1) == "low"

    def test_boundaries_are_inclusive_at_lower_edge(self):
        # Exactly 0.6 is 'high', exactly 0.4 is 'avg' — not the band below.
        assert main.score_band(0.6, 1) == "high"
        assert main.score_band(0.4, 1) == "avg"


# ─── is_task_closed: SLA auto-close rule ───

def _iso_days_from_today(delta_days):
    return (datetime.now(timezone.utc).date() + timedelta(days=delta_days)).isoformat()


class TestIsTaskClosed:
    def test_completed_task_never_closed(self):
        assert main.is_task_closed(_iso_days_from_today(-100), "Completed") is False

    def test_missing_due_date_never_closed(self):
        assert main.is_task_closed(None, "In Progress") is False
        assert main.is_task_closed("", "New") is False

    def test_not_yet_past_grace_window(self):
        # Due 3 days ago, grace is 7 -> still open.
        assert main.is_task_closed(_iso_days_from_today(-3), "In Progress") is False

    def test_exactly_at_grace_edge_still_open(self):
        # Rule is "> grace days", so exactly 7 days over is NOT yet closed.
        assert main.is_task_closed(_iso_days_from_today(-main.SLA_GRACE_DAYS), "New") is False

    def test_past_grace_window_is_closed(self):
        assert main.is_task_closed(_iso_days_from_today(-(main.SLA_GRACE_DAYS + 1)), "In Progress") is True
        assert main.is_task_closed(_iso_days_from_today(-30), "New") is True

    def test_future_due_date_is_open(self):
        assert main.is_task_closed(_iso_days_from_today(5), "New") is False

    def test_malformed_due_date_is_open(self):
        assert main.is_task_closed("not-a-date", "In Progress") is False


def test_health_endpoint_exists():
    # Smoke check that the app module exposes its routes.
    paths = {r.path for r in main.app.routes}
    assert "/health" in paths
    assert "/assign" in paths
