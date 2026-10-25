"""SchemaWise AI - FastAPI backend.

Serves the static frontend and exposes:

* ``/api/review``            - rule-based SQL schema review + history
* ``/api/history``           - saved reviews
* ``/api/ai-explain``        - AI tutor explanation of a review
* ``/api/quiz/*``            - difficulty-based quizzes + scoreboard
* ``/api/exam/*``            - competitive exam (GATE / NET) questions
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

# Make sibling modules importable whether the app is started as
# ``uvicorn backend.main:app`` or ``python backend/main.py``.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from ai_provider import (  # noqa: E402
    active_models,
    ai_available,
    ai_explain,
)
from exam_bank import exam_names, get_exam_questions, topic_names  # noqa: E402
from quiz_bank import get_bank_questions  # noqa: E402
from ai_quiz import generate_practice  # noqa: E402

from fastapi import FastAPI, HTTPException, Query  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

BASE = Path(__file__).resolve().parent.parent
FRONTEND = BASE / "frontend"
DB = Path(os.getenv("SCHEMAWISE_DB", str(BASE / "backend" / "history.db")))
ASSIGNED_TOPIC = os.getenv("ASSIGNED_TOPIC", "DBMS (Database Management Systems)")

# --------------------------------------------------------------------------- #
# Project name
#
# The name shown in the UI comes from ``project_name.txt`` in the repository
# root. Edit that file (and redeploy, when hosted) to rename the site - no code
# change is needed. The ``PROJECT_NAME`` environment variable takes priority, so
# a host such as Render can override the file without a redeploy.
# --------------------------------------------------------------------------- #
PROJECT_NAME_FILE = BASE / "project_name.txt"
DEFAULT_PROJECT_NAME = "SchemaWise AI"
MAX_PROJECT_NAME = 60
_NAME_CACHE = {"mtime": None, "name": DEFAULT_PROJECT_NAME}


def _clean_name(text: str) -> str:
    """Normalise a candidate name: drop BOM/zero-width marks, collapse spaces."""
    cleaned = text.replace("\ufeff", " ").replace("\u200b", " ")
    return " ".join(cleaned.split())[:MAX_PROJECT_NAME]


def project_name() -> str:
    """Return the configured site name (env var, then file, then default)."""
    override = _clean_name(os.getenv("PROJECT_NAME") or "")
    if override:
        return override
    try:
        mtime = PROJECT_NAME_FILE.stat().st_mtime
    except OSError:
        return DEFAULT_PROJECT_NAME
    if mtime != _NAME_CACHE["mtime"]:
        try:
            # utf-8-sig so a BOM written by Notepad or PowerShell never shows up.
            raw = PROJECT_NAME_FILE.read_text(encoding="utf-8-sig", errors="replace")
        except OSError:
            raw = ""
        first = next((ln for ln in raw.splitlines() if ln.strip()), "")
        _NAME_CACHE["mtime"] = mtime
        _NAME_CACHE["name"] = _clean_name(first) or DEFAULT_PROJECT_NAME
    return _NAME_CACHE["name"]


app = FastAPI(title=project_name(), version="2.0")


# --------------------------------------------------------------------------- #
# Request models
# --------------------------------------------------------------------------- #
class ExplainRequest(BaseModel):
    # Caps keep a hostile caller from burning the Groq quota with huge prompts.
    sql: str = Field(max_length=100_000)
    findings: list
    score: int


class ReviewRequest(BaseModel):
    schema_name: str = Field(default="Untitled Schema", max_length=120)
    sql: str = Field(max_length=100_000)


class QuizGenerateRequest(BaseModel):
    source: Literal["gate", "ai"] = "gate"
    topic: str | None = Field(default=None, max_length=200)
    difficulty: str = Field(default="all", max_length=20)
    count: int = Field(default=5, ge=1, le=20)


class QuizSubmitRequest(BaseModel):
    player_name: str = Field(default="Anonymous", max_length=120)
    topic: str = Field(default=ASSIGNED_TOPIC, max_length=200)
    difficulty: str = Field(default="all", max_length=20)
    score: int = Field(default=0, ge=0)
    total: int = Field(default=0, ge=0)


class ExamGenerateRequest(BaseModel):
    topic: str | None = Field(default=None, max_length=200)
    exam: str = Field(default="GATE", max_length=60)
    count: int = Field(default=5, ge=1, le=10)


# --------------------------------------------------------------------------- #
# Database
# --------------------------------------------------------------------------- #
def _ensure_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS review_history(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            schema_name TEXT,
            sql_input TEXT,
            score INTEGER,
            errors INTEGER,
            warnings INTEGER,
            suggestions INTEGER,
            result_json TEXT,
            created_at TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS quiz_scores(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_name TEXT,
            topic TEXT,
            difficulty TEXT,
            score INTEGER,
            total INTEGER,
            percent INTEGER,
            created_at TEXT
        )
        """
    )
    conn.commit()


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    # Self-healing: recreate tables if the file was reset (e.g. ephemeral disk).
    _ensure_schema(conn)
    return conn


def init_db() -> None:
    with db():
        pass


init_db()


# --------------------------------------------------------------------------- #
# SQL parsing + rule-based review (unchanged core logic)
# --------------------------------------------------------------------------- #
def clean(name: str) -> str:
    return name.strip().strip('`"[]')


def split_top_level(text: str):
    parts, cur, depth, quote = [], [], 0, None
    for ch in text:
        if quote:
            cur.append(ch)
            if ch == quote:
                quote = None
            continue
        if ch in "'\"`":
            quote = ch
            cur.append(ch)
        elif ch == "(":
            depth += 1
            cur.append(ch)
        elif ch == ")":
            depth = max(0, depth - 1)
            cur.append(ch)
        elif ch == "," and depth == 0:
            s = "".join(cur).strip()
            if s:
                parts.append(s)
            cur = []
        else:
            cur.append(ch)
    s = "".join(cur).strip()
    if s:
        parts.append(s)
    return parts


def parse_tables(sql: str):
    pattern = re.compile(
        r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`\"\[\]\w.]+)\s*\(", re.I
    )
    tables = []
    for m in pattern.finditer(sql):
        name = clean(m.group(1).split(".")[-1])
        i = m.end()
        depth = 1
        quote = None
        while i < len(sql) and depth:
            ch = sql[i]
            if quote:
                if ch == quote:
                    quote = None
            else:
                if ch in "'\"`":
                    quote = ch
                elif ch == "(":
                    depth += 1
                elif ch == ")":
                    depth -= 1
            i += 1
        if depth:
            continue

        body = sql[m.end() : i - 1]
        table = {
            "name": name,
            "columns": [],
            "primary_key": [],
            "foreign_keys": [],
            "uniques": [],
        }

        for item_text in split_top_level(body):
            s = item_text.strip()
            pk = re.match(
                r"(?:CONSTRAINT\s+\w+\s+)?PRIMARY\s+KEY\s*\(([^)]+)\)", s, re.I
            )
            if pk:
                table["primary_key"] += [clean(x) for x in pk.group(1).split(",")]
                continue

            fk = re.match(
                r"(?:CONSTRAINT\s+\w+\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+([`\"\[\]\w.]+)\s*\(([^)]+)\)",
                s,
                re.I,
            )
            if fk:
                cols = [clean(x) for x in fk.group(1).split(",")]
                rt = clean(fk.group(2).split(".")[-1])
                rcols = [clean(x) for x in fk.group(3).split(",")]
                for c, rc in zip(cols, rcols):
                    table["foreign_keys"].append(
                        {"column": c, "ref_table": rt, "ref_column": rc}
                    )
                continue

            uq = re.match(
                r"(?:CONSTRAINT\s+\w+\s+)?UNIQUE\s*\(([^)]+)\)", s, re.I
            )
            if uq:
                table["uniques"] += [clean(x) for x in uq.group(1).split(",")]
                continue

            cm = re.match(r"([`\"\[\]\w]+)\s+(.+)$", s, re.S)
            if not cm:
                continue

            cname = clean(cm.group(1))
            rest = cm.group(2).strip()
            tm = re.match(
                r"([A-Za-z]+(?:\s+[A-Za-z]+)?(?:\s*\([^)]*\))?)", rest
            )
            ctype = tm.group(1).strip() if tm else "UNKNOWN"
            up = rest.upper()

            col = {
                "name": cname,
                "type": ctype,
                "not_null": "NOT NULL" in up,
                "unique": bool(re.search(r"\bUNIQUE\b", up)),
                "primary_key": "PRIMARY KEY" in up,
            }

            if col["primary_key"]:
                table["primary_key"].append(cname)
            if col["unique"]:
                table["uniques"].append(cname)

            inline = re.search(
                r"REFERENCES\s+([`\"\[\]\w.]+)\s*\(([^)]+)\)", rest, re.I
            )
            if inline:
                table["foreign_keys"].append(
                    {
                        "column": cname,
                        "ref_table": clean(inline.group(1).split(".")[-1]),
                        "ref_column": clean(inline.group(2).split(",")[0]),
                    }
                )

            table["columns"].append(col)

        table["primary_key"] = list(dict.fromkeys(table["primary_key"]))
        table["uniques"] = list(dict.fromkeys(table["uniques"]))
        tables.append(table)
    return tables


def item(severity, title, message, table="", column="", fix=""):
    return {
        "severity": severity,
        "title": title,
        "message": message,
        "table": table,
        "column": column,
        "fix": fix,
    }


def review_sql(sql: str):
    sql = sql.strip()
    if not sql:
        raise HTTPException(400, "Please enter SQL.")

    tables = parse_tables(sql)
    if not tables:
        raise HTTPException(400, "No CREATE TABLE statement detected.")

    names = {t["name"].lower(): t for t in tables}
    findings = []
    reserved = {
        "order", "user", "group", "select", "table", "where",
        "from", "index", "primary", "key",
    }

    for t in tables:
        name = t["name"]

        if not t["primary_key"]:
            findings.append(
                item(
                    "warning",
                    "Missing primary key",
                    f"Table '{name}' has no primary key.",
                    name,
                    fix="Add a stable PRIMARY KEY column.",
                )
            )
        else:
            findings.append(
                item(
                    "passed",
                    "Primary key detected",
                    f"Primary key: {', '.join(t['primary_key'])}.",
                    name,
                )
            )

        seen = set()
        for c in t["columns"]:
            cname = c["name"]
            low = cname.lower()

            if low in seen:
                findings.append(
                    item(
                        "error",
                        "Duplicate column",
                        f"'{cname}' appears more than once.",
                        name,
                        cname,
                        "Remove or rename duplicate columns.",
                    )
                )
            seen.add(low)

            if low in reserved:
                findings.append(
                    item(
                        "warning",
                        "Reserved SQL word",
                        f"'{cname}' can conflict with SQL syntax.",
                        name,
                        cname,
                        "Rename the column.",
                    )
                )

            if re.search(r"[A-Z\s-]", cname):
                findings.append(
                    item(
                        "suggestion",
                        "Naming style",
                        f"'{cname}' is not lower_snake_case.",
                        name,
                        cname,
                        "Use a consistent lower_snake_case naming style.",
                    )
                )

            if (
                low in {"email", "email_address", "username", "user_name"}
                and cname not in t["uniques"]
                and not c["unique"]
            ):
                findings.append(
                    item(
                        "suggestion",
                        "Consider UNIQUE",
                        f"'{name}.{cname}' often should not contain duplicates.",
                        name,
                        cname,
                        f"Consider adding UNIQUE to {cname}.",
                    )
                )

            if low.endswith("_id") and not c["not_null"] and not c["primary_key"]:
                findings.append(
                    item(
                        "suggestion",
                        "Nullable identifier",
                        f"'{name}.{cname}' allows NULL.",
                        name,
                        cname,
                        "Add NOT NULL if this relationship is mandatory.",
                    )
                )

            vm = re.match(r"VARCHAR\s*\((\d+)\)", c["type"].upper())
            if vm and int(vm.group(1)) > 1000:
                findings.append(
                    item(
                        "suggestion",
                        "Large VARCHAR",
                        f"'{name}.{cname}' uses {c['type']}.",
                        name,
                        cname,
                        "Use a smaller VARCHAR or an appropriate text type.",
                    )
                )

        for fk in t["foreign_keys"]:
            ref = names.get(fk["ref_table"].lower())
            if not ref:
                findings.append(
                    item(
                        "error",
                        "Invalid foreign key",
                        f"{name}.{fk['column']} references missing table '{fk['ref_table']}'.",
                        name,
                        fk["column"],
                        "Create or correct the referenced table.",
                    )
                )
                continue

            refcols = {c["name"].lower(): c for c in ref["columns"]}
            if fk["ref_column"].lower() not in refcols:
                findings.append(
                    item(
                        "error",
                        "Invalid referenced column",
                        f"Referenced column '{fk['ref_table']}.{fk['ref_column']}' does not exist.",
                        name,
                        fk["column"],
                        "Correct the referenced column.",
                    )
                )
            else:
                findings.append(
                    item(
                        "passed",
                        "Foreign key valid",
                        f"{name}.{fk['column']} \u2192 {fk['ref_table']}.{fk['ref_column']}.",
                        name,
                        fk["column"],
                    )
                )

            findings.append(
                item(
                    "suggestion",
                    "Index foreign key",
                    f"Joins may frequently use {name}.{fk['column']}.",
                    name,
                    fk["column"],
                    f"Consider an index on {fk['column']}.",
                )
            )

        fkcols = {f["column"].lower() for f in t["foreign_keys"]}
        for c in t["columns"]:
            if (
                c["name"].lower().endswith("_id")
                and c["name"] not in t["primary_key"]
                and c["name"].lower() not in fkcols
            ):
                guess = c["name"][:-3].lower()
                possible = {guess, guess + "s", guess + "es"}
                if possible & set(names):
                    findings.append(
                        item(
                            "warning",
                            "Possible missing foreign key",
                            f"{name}.{c['name']} looks like a relationship column but has no FOREIGN KEY.",
                            name,
                            c["name"],
                            "Add a FOREIGN KEY if it references another table.",
                        )
                    )

    weights = {"error": 18, "warning": 10, "suggestion": 3}
    score = max(0, 100 - sum(weights.get(f["severity"], 0) for f in findings))

    counts = {
        "errors": sum(f["severity"] == "error" for f in findings),
        "warnings": sum(f["severity"] == "warning" for f in findings),
        "suggestions": sum(f["severity"] == "suggestion" for f in findings),
        "passed": sum(f["severity"] == "passed" for f in findings),
    }

    relationships = [
        {
            "from": t["name"],
            "column": f["column"],
            "to": f["ref_table"],
            "ref_column": f["ref_column"],
        }
        for t in tables
        for f in t["foreign_keys"]
    ]

    problems = [f for f in findings if f["severity"] != "passed"]
    explanation = [
        f"Schema score: {score}/100.",
        f"Detected {counts['errors']} error(s), {counts['warnings']} warning(s), and {counts['suggestions']} suggestion(s).",
        "",
        "Main review:",
    ]

    if not problems:
        explanation.append("- No major issues were detected by the built-in checks.")
    else:
        order = {"error": 0, "warning": 1, "suggestion": 2}
        for f in sorted(problems, key=lambda x: order[x["severity"]])[:8]:
            explanation.append(f"- {f['title']}: {f['message']}")
            if f["fix"]:
                explanation.append(f"  Suggested fix: {f['fix']}")

    explanation += [
        "",
        "DBMS note:",
        "Normalization cannot always be fully confirmed from CREATE TABLE SQL alone because functional dependencies and business rules may not be provided.",
    ]

    return {
        "score": score,
        "counts": counts,
        "tables": tables,
        "relationships": relationships,
        "findings": findings,
        "explanation": "\n".join(explanation),
        "ai_used": False,
    }


# --------------------------------------------------------------------------- #
# Review endpoints
# --------------------------------------------------------------------------- #
@app.post("/api/review")
def review(req: ReviewRequest):
    result = review_sql(req.sql)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    name = req.schema_name.strip() or "Untitled Schema"

    with db() as conn:
        cur = conn.execute(
            """
            INSERT INTO review_history
            (schema_name,sql_input,score,errors,warnings,suggestions,result_json,created_at)
            VALUES(?,?,?,?,?,?,?,?)
            """,
            (
                name,
                req.sql,
                result["score"],
                result["counts"]["errors"],
                result["counts"]["warnings"],
                result["counts"]["suggestions"],
                json.dumps(result),
                now,
            ),
        )
        rid = cur.lastrowid

    result.update({"review_id": rid, "created_at": now, "schema_name": name})
    return result


@app.get("/api/history")
def history():
    with db() as conn:
        rows = conn.execute(
            """
            SELECT id,schema_name,score,errors,warnings,suggestions,created_at
            FROM review_history ORDER BY id DESC LIMIT 50
            """
        ).fetchall()
    return [dict(r) for r in rows]


@app.get("/api/history/{rid}")
def history_item(rid: int):
    with db() as conn:
        row = conn.execute(
            "SELECT * FROM review_history WHERE id=?", (rid,)
        ).fetchone()
    if not row:
        raise HTTPException(404, "Review not found")
    result = json.loads(row["result_json"])
    result.update(
        {
            "review_id": row["id"],
            "schema_name": row["schema_name"],
            "created_at": row["created_at"],
            "sql": row["sql_input"],
        }
    )
    return result


# --------------------------------------------------------------------------- #
# Status / config
# --------------------------------------------------------------------------- #
@app.get("/api/status")
async def status():
    return {"ai_available": await ai_available()}


@app.get("/api/project-name")
async def project_name_endpoint():
    """The display name of this site, from project_name.txt or the env var."""
    return {"name": project_name()}


@app.get("/api/config")
async def config():
    return {
        "app": project_name(),
        "version": "2.0",
        "assigned_topic": ASSIGNED_TOPIC,
        "ai_available": await ai_available(),
        "ai_models": active_models(),
        "exam_names": exam_names(),
        "exam_topics": topic_names(),
    }


# --------------------------------------------------------------------------- #
# AI explanation of a schema review
# --------------------------------------------------------------------------- #
@app.post("/api/ai-explain")
async def ai_explain_endpoint(req: ExplainRequest):
    # Findings arrive from the client, so treat every item as untrusted: skip
    # anything that is not a well-formed object and cap each field. (A raw
    # f["severity"] lookup here used to turn malformed items into HTTP 500s.)
    problems: list[str] = []
    for f in req.findings[:50]:
        if not isinstance(f, dict):
            continue
        severity = str(f.get("severity") or "notice")[:20]
        if severity == "passed":
            continue
        table = str(f.get("table") or "")[:60]
        column = str(f.get("column") or "")[:60]
        message = str(f.get("message") or "")[:300]
        problems.append(f"- [{severity}] {table}.{column}: {message}")
    bullet_list = "\n".join(problems[:10])

    # The prompt only needs the head of a very large schema; the full text stays
    # on the review side. This keeps the Groq request bounded.
    sql_text = req.sql
    if len(sql_text) > 12_000:
        sql_text = sql_text[:12_000] + "\n-- ... (schema truncated for the tutor)"

    prompt = f"""You are reviewing a student's SQL database schema. You have two inputs:

1) THE RAW SQL:
{sql_text}

2) THE AUTOMATED (NON-AI) CHECKER'S RESULTS \u2014 score {req.score}/100:
{bullet_list if bullet_list else "No issues flagged."}

Do three things, using these exact section headers:

### Your Independent Review
Read the SQL yourself and evaluate the schema on its own merits \u2014 primary/foreign keys, normalization, naming, nullability, data types. Don't look at the checker's results yet in this section.

### Reviewing the Automated Checker
Now look at the automated checker's findings above. Note anything it correctly caught, anything it missed that you found in your own review, and anything it flagged that you disagree with or think is a false positive.

### Combined Verdict
Give the student one clear, encouraging paragraph combining both reviews: the 2-3 most important fixes to make first, and an honest overall sense of schema quality.

Keep the whole response under 350 words, plain text, no markdown tables."""

    explanation = await ai_explain(prompt)
    if explanation is None:
        return {
            "ai_used": False,
            "explanation": "AI explanation unavailable right now \u2014 showing the built-in review only.",
        }
    return {"ai_used": True, "explanation": explanation}


# --------------------------------------------------------------------------- #
# Quiz
# --------------------------------------------------------------------------- #
@app.post("/api/quiz/generate")
async def quiz_generate(req: QuizGenerateRequest):
    if req.source == "ai":
        topic = (req.topic or "DBMS").strip()
        if topic.lower() == "all":
            topic = "DBMS"
        questions = await generate_practice(topic, req.count)
        if not questions:
            raise HTTPException(status_code=503, detail="AI practice is unavailable. Configure GROQ_API_KEY on the server, or try again later. Official GATE PYQs remain available.")
        return {"topic": topic, "difficulty": "AI practice", "count": len(questions),
                "source": "ai", "questions": questions, "requested_count": req.count}
    difficulty = (req.difficulty or "all").lower()
    if difficulty not in {"all", "one", "two"}:
        difficulty = "all"
    topic = (req.topic or "all").strip()
    questions = get_bank_questions(difficulty, req.count, topic)
    return {"topic": topic, "difficulty": difficulty, "count": len(questions),
            "source": "gate-pyq", "questions": questions,
            "requested_count": req.count}


@app.post("/api/quiz/submit")
def quiz_submit(req: QuizSubmitRequest):
    name = (req.player_name or "Anonymous").strip()[:60] or "Anonymous"
    topic = (req.topic or ASSIGNED_TOPIC).strip()
    difficulty = (req.difficulty or "easy").strip().lower()
    total = max(0, int(req.total))
    score = max(0, min(int(req.score), total))
    percent = round((score / total) * 100) if total else 0
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    with db() as conn:
        cur = conn.execute(
            """
            INSERT INTO quiz_scores
            (player_name,topic,difficulty,score,total,percent,created_at)
            VALUES(?,?,?,?,?,?,?)
            """,
            (name, topic, difficulty, score, total, percent, now),
        )
        new_id = cur.lastrowid

    return {
        "id": new_id,
        "player_name": name,
        "topic": topic,
        "difficulty": difficulty,
        "score": score,
        "total": total,
        "percent": percent,
        "created_at": now,
    }


@app.get("/api/quiz/leaderboard")
def quiz_leaderboard(
    limit: int = Query(default=10, ge=1, le=50),
    topic: str | None = None,
):
    query = """
        SELECT id,player_name,topic,difficulty,score,total,percent,created_at
        FROM quiz_scores
    """
    params: list[Any] = []
    if topic and topic.strip() and topic.strip().lower() != "all":
        query += " WHERE topic = ?"
        params.append(topic.strip())
    query += " ORDER BY percent DESC, score DESC, created_at DESC LIMIT ?"
    params.append(limit)

    with db() as conn:
        rows = conn.execute(query, params).fetchall()
    return [dict(r) for r in rows]


# --------------------------------------------------------------------------- #
# Competitive exam questions
# --------------------------------------------------------------------------- #
@app.get("/api/exam/questions")
def exam_questions(
    exam: str | None = Query(default=None),
    topic: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
):
    questions = get_exam_questions(exam=exam, topic=topic, limit=limit)
    return {"count": len(questions), "source": "gate-pyq", "questions": questions}


@app.post("/api/exam/generate", deprecated=True)
async def exam_generate(req: ExamGenerateRequest):
    raise HTTPException(status_code=410, detail="AI question generation has been removed. Use /api/exam/questions for sourced GATE PYQs.")


# --------------------------------------------------------------------------- #
# Health + static frontend
# --------------------------------------------------------------------------- #
@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/health", include_in_schema=False)
def health_alias():
    """Alias for /api/health (uptime probes often hit /health)."""
    return {"status": "ok"}


app.mount("/static", StaticFiles(directory=FRONTEND), name="static")


@app.get("/")
def home():
    return FileResponse(FRONTEND / "index.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True
    )
