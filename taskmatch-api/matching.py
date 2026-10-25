"""The fit score: how well one person suits one piece of work, from 0 to 100, with the reasons.

Pure functions (no database), so the rules are easy to test and to tune. main.py loads the rows
and calls these; /recommend, /auto-assign, /match/people and /people/insights all share them, so
every screen ranks people the same way.

A score is the sum of four parts. Each part is worked out as 0..1 and multiplied by its weight:

  skills        45  Do they have the required skills at the required level? Meeting the minimum
                    is most of it; a higher level adds a little on top.
  experience    20  Have they actually used these skills on finished work (not just declared
                    them)? Older work counts for less: half as much after EVIDENCE_HALF_LIFE_DAYS.
                    Finishing a task with similar wording also counts.
  availability  20  How much room they have: open slots against the WIP limit, and hours on
                    active tasks against CAPACITY_HOURS. Someone away scores 0 here.
  record        15  How they have done before: finished on time, and their average score.
                    Someone with no history gets a neutral half, so new people aren't buried.
"""
import os
from collections import defaultdict
from datetime import date

import suggest_history

WEIGHTS = {"skills": 45, "experience": 20, "availability": 20, "record": 15}
LABELS = {"skills": "Skills", "experience": "Proven experience", "availability": "Availability",
          "record": "Track record"}
CAPACITY_HOURS = float(os.getenv("CAPACITY_HOURS", "20"))       # hours of active work one person can carry
EVIDENCE_HALF_LIFE_DAYS = int(os.getenv("EVIDENCE_HALF_LIFE_DAYS", "180"))
LEVELS = ["", "Beginner", "Intermediate", "Advanced"]
ACTIVE = ("Assigned", "In Progress")


def _day(value):
    """'2026-10-20' or an ISO timestamp -> date (None if missing or unreadable)."""
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def decay(when, today):
    """Weight of a piece of evidence by age: 1 today, 0.5 after one half-life, and so on."""
    if when is None:
        return 0.5
    days = max((today - when).days, 0)
    return 0.5 ** (days / EVIDENCE_HALF_LIFE_DAYS)


def build_profiles(students, student_skills, assignments, today=None):
    """One profile per person: declared skills, proven skills, load and track record.

    assignments rows carry student_id, task_id, status, score, completed_at, assigned_date and
    tasks(description, committed_hours, due_date, task_skills(skill_id, min_proficiency))."""
    today = today or date.today()
    declared = defaultdict(dict)
    for row in student_skills:
        declared[row["student_id"]][row["skill_id"]] = row.get("proficiency") or 0

    profiles = {}
    for s in students:
        away_until = s.get("away_until")
        profiles[s["id"]] = {
            "student_id": s["id"], "name": s.get("name"),
            "declared": declared.get(s["id"], {}),
            "evidence": {},           # skill_id -> {count, weight, last, level}
            "finished": [],           # word sets of finished task descriptions
            "active_count": 0, "active_hours": 0.0,
            "scores": [], "on_time": 0, "dated": 0, "completed": 0,
            "last_assigned": None, "total_assigned": 0,
            "away": bool(away_until) and str(away_until) >= str(today),
            "away_until": away_until,
        }

    for a in assignments:
        p = profiles.get(a.get("student_id"))
        if p is None:
            continue
        task = a.get("tasks") or {}
        p["total_assigned"] += 1
        d = a.get("assigned_date")
        if d and (p["last_assigned"] is None or d > p["last_assigned"]):
            p["last_assigned"] = d
        if a.get("status") in ACTIVE:
            p["active_count"] += 1
            p["active_hours"] += task.get("committed_hours") or 0
            continue
        if a.get("status") != "Completed":
            continue
        p["completed"] += 1
        if a.get("score") is not None:
            p["scores"].append(a["score"])
        done, due = _day(a.get("completed_at")), _day(task.get("due_date"))
        if done and due:
            p["dated"] += 1
            p["on_time"] += done <= due
        if task.get("description"):
            p["finished"].append(suggest_history.words(task["description"]))
        w = decay(done, today)
        for ts in task.get("task_skills") or []:
            ev = p["evidence"].setdefault(ts["skill_id"], {"count": 0, "weight": 0.0, "last": None, "level": 0})
            ev["count"] += 1
            ev["weight"] += w
            ev["level"] = max(ev["level"], ts.get("min_proficiency") or 1)
            if done and (ev["last"] is None or done > ev["last"]):
                ev["last"] = done
    for p in profiles.values():
        p["active_hours"] = round(p["active_hours"], 1)
    return profiles


def avg_score(p):
    return round(sum(p["scores"]) / len(p["scores"]), 3) if p["scores"] else None


def _fmt_day(d):
    return f"{d.day} {d.strftime('%b')}" if d else ""


def fit(p, required, skill_names, task_words=None, wip_limit=3, capacity=None):
    """Score one profile against required {skill_id: min_level}. Returns (score 0..100, factors),
    where each factor is {key, label, points, max, detail} so the app can show why."""
    capacity = capacity or CAPACITY_HOURS
    names = lambda ids: ", ".join(skill_names.get(i, "a skill") for i in ids)

    # Skills: meeting the minimum is 80% of each skill's credit, the level itself the other 20%.
    per, missing = [], []
    for sid, need in required.items():
        have = p["declared"].get(sid, 0)
        per.append(0.8 * min(have / need, 1.0) + 0.2 * have / 3 if need else 1.0)
        if have < (need or 0):
            missing.append(sid)
    skills = sum(per) / len(per) if per else 1.0
    met = len(required) - len(missing)
    skills_detail = (f"Meets all {len(required)} required skill{'s' if len(required) != 1 else ''}"
                     if not missing else f"Meets {met} of {len(required)}; below the level for {names(missing)}")

    # Experience: decayed count of finished tasks per required skill (1 task = 0.5, 2 = 0.75 ...),
    # plus the closest finished task by wording.
    per_exp, proven, last = [], [], None
    for sid in required:
        ev = p["evidence"].get(sid)
        per_exp.append(1 - 0.5 ** ev["weight"] if ev else 0.0)
        if ev:
            proven.append(sid)
            if ev["last"] and (last is None or ev["last"] > last):
                last = ev["last"]
    skill_exp = sum(per_exp) / len(per_exp) if per_exp else 0.0
    similar = 0.0
    if task_words:
        similar = max((suggest_history.similarity(task_words, w) for w in p["finished"]), default=0.0)
        similar = min(similar / 0.5, 1.0)
    experience = 0.75 * skill_exp + 0.25 * similar
    if proven:
        n_done = sum(p["evidence"][sid]["count"] for sid in proven)
        exp_detail = (f"Used {names(proven)} on {n_done} finished task{'s' if n_done != 1 else ''}"
                      + (f", last on {_fmt_day(last)}" if last else ""))
    elif similar >= 0.5:
        exp_detail = "Has finished similar work, but not with these skills on record"
    else:
        exp_detail = "No finished work with these skills yet"

    # Availability: whichever is tighter, task slots or hours.
    if p["away"]:
        availability, avail_detail = 0.0, f"Away until {p['away_until']}"
    else:
        used = max(p["active_count"] / wip_limit if wip_limit else 0, p["active_hours"] / capacity if capacity else 0)
        availability = max(0.0, 1.0 - used)
        avail_detail = (f"{p['active_count']} of {wip_limit} slots, "
                        f"{p['active_hours']:g}h of {capacity:g}h in use")

    # Track record: on time (60%) and average score (40%; 0.6 or better counts as full marks).
    score = avg_score(p)
    if not p["dated"] and score is None:
        record, rec_detail = 0.5, "No finished work yet, so neutral"
    else:
        parts, bits = [], []
        if p["dated"]:
            parts.append((0.6, p["on_time"] / p["dated"]))
            bits.append(f"{p['on_time']} of {p['dated']} on time")
        if score is not None:
            parts.append((0.4, min(score / 0.6, 1.0)))
            bits.append(f"avg score {score:.2f}")
        record = sum(w * v for w, v in parts) / sum(w for w, _ in parts)
        rec_detail = ", ".join(bits).capitalize()

    values = {"skills": skills, "experience": experience, "availability": availability, "record": record}
    details = {"skills": skills_detail, "experience": exp_detail, "availability": avail_detail, "record": rec_detail}
    factors = [{"key": k, "label": LABELS[k], "points": round(WEIGHTS[k] * values[k], 1), "max": WEIGHTS[k],
                "detail": details[k]} for k in WEIGHTS]
    total = round(sum(f["points"] for f in factors))
    return total, factors


def mentor_for(skill_id, profiles, exclude=()):
    """The best person to learn a skill from: highest declared level (Intermediate at least),
    then the most proven use of it, then the most room. None if nobody fits."""
    best, best_key = None, None
    for p in profiles.values():
        if p["student_id"] in exclude or p["away"]:
            continue
        level = p["declared"].get(skill_id, 0)
        if level < 2:
            continue
        ev = p["evidence"].get(skill_id)
        key = (level, ev["weight"] if ev else 0, -p["active_count"])
        if best_key is None or key > best_key:
            best, best_key = p, key
    return best


def proven_skills(p, skill_names):
    """Skills backed by finished work, most recent first."""
    out = []
    for sid, ev in p["evidence"].items():
        out.append({"skill_id": sid, "skill_name": skill_names.get(sid), "count": ev["count"],
                    "level": ev["level"], "last": ev["last"].isoformat() if ev["last"] else None,
                    "strength": round(1 - 0.5 ** ev["weight"], 2)})
    out.sort(key=lambda x: (x["last"] or "", x["count"]), reverse=True)
    return out


def skill_health(skills, profiles, open_task_skills, wip_limit=3):
    """For each skill: who has it, who has proven it, how much open work needs it, and the risk.

    open_task_skills: [{task_id, skill_id, min_proficiency}] for tasks still open.
    risk is 'gap' (open work needs it and nobody available meets the level), 'single' (only one
    person meets the level), 'thin' (nobody at Advanced) or 'ok'."""
    demand = defaultdict(lambda: {"tasks": set(), "level": 1})
    for row in open_task_skills:
        d = demand[row["skill_id"]]
        d["tasks"].add(row["task_id"])
        d["level"] = max(d["level"], row.get("min_proficiency") or 1)

    out = []
    for sk in skills:
        sid = sk["id"]
        holders = [p for p in profiles.values() if p["declared"].get(sid, 0) > 0]
        need = demand[sid]["level"] if sid in demand else 1
        able = [p for p in holders if p["declared"][sid] >= need]
        free = [p for p in able if not p["away"] and p["active_count"] < wip_limit]
        n_tasks = len(demand[sid]["tasks"]) if sid in demand else 0
        if n_tasks and not free:
            risk = "gap"
        elif len(able) == 1:
            risk = "single"
        elif holders and not any(p["declared"][sid] >= 3 for p in holders):
            risk = "thin"
        elif not holders:
            risk = "none"
        else:
            risk = "ok"
        m = mentor_for(sid, profiles)
        out.append({
            "skill_id": sid, "skill_name": sk.get("skill_name"),
            "holders": len(holders),
            "advanced": sum(1 for p in holders if p["declared"][sid] >= 3),
            "proven": sum(1 for p in holders if sid in p["evidence"]),
            "open_tasks": n_tasks, "needed_level": need if n_tasks else None,
            "able": len(able), "available": len(free),
            "risk": risk,
            "mentor": {"student_id": m["student_id"], "name": m["name"]} if m else None,
        })
    order = {"gap": 0, "single": 1, "thin": 2, "ok": 3, "none": 4}
    out.sort(key=lambda s: (order[s["risk"]], -s["open_tasks"], -s["holders"], s["skill_name"] or ""))
    return out
