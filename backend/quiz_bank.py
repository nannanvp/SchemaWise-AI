"""Quiz selection uses the same sourced GATE bank as the archive."""
import random
from exam_bank import get_exam_questions

def get_bank_questions(difficulty, count, topic=None):
    pool = [q for q in get_exam_questions(topic=topic) if q["answer_type"] != "written"]
    mark = {"one": 1, "two": 2}.get(difficulty)
    if mark:
        pool = [q for q in pool if q["marks"] == mark]
    return random.sample(pool, min(count, len(pool)))
