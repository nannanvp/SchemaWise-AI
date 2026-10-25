"""GATE PYQs imported from the user-supplied ExamGOAL chapter PDFs.
The original question images are authoritative; text extraction is search-only.
"""
import json
from pathlib import Path

EXAM_QUESTIONS = json.loads(Path(__file__).with_name("gate_questions.json").read_text(encoding="utf-8"))

def get_exam_questions(exam=None, topic=None, limit=None):
    result = EXAM_QUESTIONS
    if exam and exam.strip().lower() not in {"all", "gate", ""}:
        return []
    if topic and topic.strip().lower() not in {"all", "", "dbms", "dbms (database management systems)"}:
        result = [q for q in result if topic.strip().lower() in q["topic"].lower()]
    return result[:limit] if limit and limit > 0 else result

def exam_names():
    return ["GATE"]

def topic_names():
    return sorted({q["topic"] for q in EXAM_QUESTIONS})
