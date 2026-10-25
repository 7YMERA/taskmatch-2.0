"""Built-in suggestions: skills, hours and severity for a new task, worked out from the team's
own finished tasks. No AI and no API key; this is what runs when ANTHROPIC_API_KEY isn't set.

How it works:
- Find finished tasks whose wording overlaps with the new description, and keep the closest few.
  Rare words count for more than common ones (a shared "webhook" says more than a shared
  "page"), and common short forms are read as the full word ("js" is "javascript").
- Skills: the skills those tasks needed, weighted by how similar each task is, plus any skill
  named in the description itself, plus words the team's history ties to a skill (if most
  finished tasks that mention "login" needed Auth, a new "login" task suggests Auth too).
  The level is the usual level for that skill in the matches.
- Hours: the middle value of the matches' real hours, with their range, and a note when the
  team's finished tasks usually run over (or under) what was planned.
- Severity: words like "urgent" or "typo", and what similar tasks were set to.

Confidence follows the evidence: how many similar tasks there are and how close they are.
Returns the same shape as ai.suggest, so the app shows both the same way.
"""
import math
import re
from collections import Counter

ENGINE = "history"
SEVERITIES = ("Low", "Medium", "Critical")

STOP = set("""a an and are as at be by for from has have in into is it its of on or that the this to
was were will with we our you your can should need needs new add make build create update fix set
up get page task work using use via all any some more less than then also""".split())

URGENT = {"urgent", "asap", "outage", "crash", "crashes", "breach", "security", "vulnerability",
          "critical", "blocker", "blocking", "incident", "leak", "data loss"}
MINOR = {"typo", "typos", "minor", "polish", "cosmetic", "tweak", "rename", "wording",
         "nice to have", "cleanup", "tidy"}


# Short forms and spellings read as one word, so "JS" finds JavaScript and "postgres" finds SQL work.
ALIASES = {"js": "javascript", "ts": "typescript", "py": "python", "db": "database",
           "postgres": "postgresql", "pg": "postgresql", "k8s": "kubernetes", "ml": "machine-learning",
           "signin": "login", "sign-in": "login", "log-in": "login", "auth": "authentication",
           "frontend": "front-end", "backend": "back-end", "ux": "ui/ux", "ui": "ui/ux",
           "doc": "documentation", "docs": "documentation", "spreadsheet": "excel"}


def _stem(w):
    for suf in ("ing", "ies", "es", "ed", "s"):
        if len(w) > len(suf) + 2 and w.endswith(suf):
            return w[: -len(suf)] + ("y" if suf == "ies" else "")
    return w


def words(text):
    out = set()
    for w in re.findall(r"[a-z0-9][a-z0-9+#.\-]*", (text or "").lower()):
        w = w.rstrip(".")
        if w in STOP or len(w) < 2:
            continue
        w = ALIASES.get(w, w)
        out.add(w if w in ALIASES.values() else _stem(w))
    return out


def similarity(a, b, idf=None):
    """Overlap between two word sets, 0..1 (cosine of the sets). With idf, each word counts
    by how rare it is in the team's history."""
    if not a or not b:
        return 0.0
    if idf is None:
        return len(a & b) / math.sqrt(len(a) * len(b))
    top = max(idf.values(), default=1.0)
    wt = lambda ws: sum(idf.get(w, top) for w in ws)
    return wt(a & b) / math.sqrt(wt(a) * wt(b))


def rarity(docs):
    """Inverse document frequency for every word in a list of word sets."""
    n = len(docs)
    df = Counter(w for d in docs for w in d)
    return {w: math.log((n + 1) / (c + 1)) + 1 for w, c in df.items()}


def learned_hints(text_words, docs, skill_sets, min_tasks=2, min_share=0.6):
    """Words in the description that the team's history ties to a skill.

    docs and skill_sets run in parallel (one finished task each). Returns
    {skill_lower: (word, hits, total)} for the strongest word per skill: of the `total` finished
    tasks that used `word`, `hits` needed the skill. Words in more than half of all tasks are
    ignored, since they say nothing."""
    n = len(docs)
    out = {}
    for w in text_words:
        having = [i for i, d in enumerate(docs) if w in d]
        if len(having) < min_tasks or len(having) > max(n / 2, min_tasks):
            continue
        counts = Counter(k for i in having for k in skill_sets[i])
        for k, hits in counts.items():
            share = hits / len(having)
            if share >= min_share and (k not in out or (hits, share) > (out[k][1], out[k][1] / out[k][2])):
                out[k] = (w, hits, len(having))
    return out


def _hours(t):
    real = [a.get("actual_hours") for a in (t.get("assignments") or [])
            if a.get("status") == "Completed" and a.get("actual_hours") is not None]
    if real:
        return sum(real) / len(real)
    return t.get("committed_hours")


def _median(xs):
    xs = sorted(xs)
    n = len(xs)
    return (xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2) if xs else None


def _mentioned(text_lower, text_words, skill_name):
    """Is this skill named in the description? Whole name, or all of its words (after aliases)."""
    name = skill_name.lower()
    if re.search(r"(?<![a-z0-9])" + re.escape(name) + r"(?![a-z0-9])", text_lower):
        return True
    parts = words(name)   # also catches short forms, e.g. "JS" for JavaScript
    return bool(parts) and parts <= text_words


def estimate_bias(tasks, min_tasks=3):
    """How the team's real hours compare with what it planned, as a sentence (or "")."""
    ratios = []
    for t in tasks:
        real = [a.get("actual_hours") for a in (t.get("assignments") or [])
                if a.get("status") == "Completed" and a.get("actual_hours") is not None]
        planned = t.get("committed_hours")
        if real and planned:
            ratios.append((sum(real) / len(real)) / planned)
    if len(ratios) < min_tasks:
        return ""
    r = _median(ratios)
    if r >= 1.15:
        return f"Heads up: finished tasks usually took {round((r - 1) * 100)}% longer than planned, so leave some slack."
    if r <= 0.85:
        return f"Finished tasks usually took {round((1 - r) * 100)}% less time than planned."
    return ""


def suggest(description, notes, skills, tasks, min_similarity=0.2, top=5):
    text = f"{description} {notes or ''}"
    text_lower = text.lower()
    tw = words(text)

    docs = [words(t.get("description")) for t in tasks]
    idf = rarity(docs)
    scored = []
    for t, d in zip(tasks, docs):
        s = similarity(tw, d, idf)
        if s >= min_similarity:
            scored.append((s, t))
    scored.sort(key=lambda x: -x[0])
    similar = scored[:top]
    n = len(similar)
    avg_sim = sum(s for s, _ in similar) / n if n else 0.0

    # ── Skills ──
    by_name = {s["skill_name"].lower(): s for s in skills}
    weight, levels, seen_in = Counter(), {}, Counter()
    for s, t in similar:
        for ts in t.get("task_skills") or []:
            name = ((ts.get("skills") or {}).get("skill_name") or "").lower()
            if name in by_name:
                weight[name] += s
                seen_in[name] += 1
                levels.setdefault(name, []).append(ts.get("min_proficiency") or 1)
    named = {k for k, sk in by_name.items() if _mentioned(text_lower, tw, sk["skill_name"])}
    for k in named:
        weight[k] += 1.0
    skill_sets = [{((ts.get("skills") or {}).get("skill_name") or "").lower() for ts in (t.get("task_skills") or [])}
                  for t in tasks]
    hints = {k: v for k, v in learned_hints(tw, docs, skill_sets).items() if k in by_name}
    for k, (_, hits, total) in hints.items():
        weight[k] += 0.6 * hits / total

    out_skills = []
    for k, w in weight.most_common():
        if len(out_skills) >= 4:
            break
        hits = seen_in[k]
        hint = hints.get(k)
        strong_hint = bool(hint) and hint[1] >= 3 and hint[1] / hint[2] >= 0.75
        if k not in named and not hint and hits < 2 and w < 0.5:
            continue  # one loose match isn't enough to suggest a skill
        if (k in named and (hits >= 1 or hint)) or hits >= 3 or (strong_hint and hits >= 1):
            conf = "high"
        elif k in named or hits >= 2 or strong_hint:
            conf = "medium"
        else:
            conf = "low"
        lvl = round(_median(levels[k])) if k in levels else 2
        parts = []
        if k in named:
            parts.append("Named in the description")
        if hits:
            parts.append(f"needed by {hits} of {n} similar finished task{'s' if n != 1 else ''}")
        if hint:
            parts.append(f"{hint[1]} of {hint[2]} finished tasks that mention \u201c{hint[0]}\u201d needed it")
        reason = "; ".join(parts)
        out_skills.append({"skill_id": by_name[k]["id"], "skill_name": by_name[k]["skill_name"],
                           "min_level": min(max(lvl, 1), 3), "confidence": conf,
                           "reason": reason[:1].upper() + reason[1:] + "."})
    order = {"high": 0, "medium": 1, "low": 2}
    out_skills.sort(key=lambda s: order[s["confidence"]])

    # ── Hours ──
    with_hours = [(s, t, _hours(t)) for s, t in similar if _hours(t)]
    if with_hours:
        hs = [h for _, _, h in with_hours]
        est = _median(hs)
        k = len(with_hours)
        conf = "high" if k >= 3 and avg_sim >= 0.4 else "medium" if k >= 2 else "low"
        reason = (f"Middle of the real hours on {k} similar finished task{'s' if k != 1 else ''}"
                  if k > 1 else "From the one similar finished task")
        based_on = [{"task_id": t.get("id"), "description": (t.get("description") or "")[:200],
                     "actual_hours": round(h, 1)} for _, t, h in with_hours]
        low, high = min(hs), max(hs)
    else:
        every = [h for h in (_hours(t) for t in tasks) if h]
        est = _median(every) if every else 4.0
        conf, based_on = "low", []
        reason = ("No similar finished tasks; this is the team's typical task size"
                  if every else "No finished tasks yet; a placeholder to adjust")
        low, high = (min(every), max(every)) if every else (est, est)
    est = max(round(est * 2) / 2, 0.5)
    hours = {"estimate": est, "low": round(min(low, est), 1), "high": round(max(high, est), 1),
             "confidence": conf, "reason": reason + ".", "based_on": based_on, "note": estimate_bias(tasks)}

    # ── Severity ──
    urgent = sorted(w for w in URGENT if re.search(r"\b" + re.escape(w) + r"\b", text_lower))
    minor = sorted(w for w in MINOR if re.search(r"\b" + re.escape(w) + r"\b", text_lower))
    past = Counter(t.get("severity") for _, t in similar if t.get("severity") in SEVERITIES)
    common, common_n = (past.most_common(1)[0] if past else (None, 0))
    if urgent and not minor:
        value, conf = "Critical", "high" if common == "Critical" else "medium"
        reason = f"The description mentions \"{urgent[0]}\""
    elif minor and not urgent:
        value, conf = "Low", "high" if common == "Low" else "medium"
        reason = f"The description mentions \"{minor[0]}\""
    elif common and common_n >= 2:
        value, conf = common, "medium" if common_n >= 3 else "low"
        reason = f"{common_n} of {n} similar tasks were set to {common}"
    else:
        value, conf = "Medium", "low"
        reason = "Nothing points either way, so the usual default"
    severity = {"value": value, "confidence": conf, "reason": reason + "."}

    question = ""
    if not similar and not named:
        question = ("Nothing like this has been done before and no skills are named. "
                    "Adding the tools or area involved (for example \"React form\" or \"SQL report\") gives better suggestions.")

    return {"skills": out_skills, "hours": hours, "severity": severity, "question": question,
            "model": ENGINE, "engine": ENGINE, "examples_considered": len(tasks)}
