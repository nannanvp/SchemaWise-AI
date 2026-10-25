"""Import user-supplied ExamGOAL PDFs without retyping mathematical content.

Build dependency: PyMuPDF. Runtime uses only the generated JSON and PNGs.
Usage: python scripts/import_gate_pdfs.py SOURCE_DIRECTORY
"""
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'frontend' / 'gate'
CHAPTERS = {
    'Er Diagrams': 'er-diagrams',
    'File Structures and Indexing': 'file-structures-and-indexing',
    'Functional Dependencies and Normalization': 'functional-dependencies-and-normalization',
    'Relational Algebra': 'relational-algebra',
    'Transactions and Concurrency': 'transactions-and-concurrency',
}


def build(source):
    OUT.mkdir(parents=True, exist_ok=True)
    questions, sources = [], []
    for chapter, slug in CHAPTERS.items():
        path = source / f'GATE CSE {chapter} Previous Year Questions with Answer Key.pdf'
        doc = pymupdf.open(path)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        shutil.copyfile(path, OUT / f'{slug}.pdf')
        keys = {}
        key_page = None
        for pi, page in enumerate(doc):
            if 'Answer Key' not in page.get_text() or pi == 0:
                continue
            key_page = pi
            for line in page.get_text().splitlines():
                m = re.match(r'^(\d+)\.\s+(.+)$', line.strip())
                if m:
                    keys[int(m[1])] = m[2].strip()
        assert key_page is not None, chapter
        starts = []
        marks = 1
        for pi in range(1, key_page):
            page = doc[pi]
            for block in page.get_text('blocks'):
                txt = block[4].strip()
                if txt.startswith('Marks 2'):
                    marks = 2
                m = re.match(r'^Q(\d+)\.\s*\n(GATE CSE[^\n]*)', txt)
                if m:
                    starts.append((pi, block[1] - 4, int(m[1]), m[2], marks))
        assert len(starts) == len(keys), (chapter, len(starts), len(keys))
        assert {q[2] for q in starts} == set(keys), chapter
        selected = {q[2] for q in sorted(starts, key=lambda q: -int(re.search(r"\d{4}", q[3])[0]))[:20]}
        for si, (pi, y, number, tag, marks) in enumerate(starts):
            if number not in selected:
                continue
            next_pi, next_y = (starts[si+1][0], starts[si+1][1]) if si+1 < len(starts) else (key_page, 0)
            qid = f'{slug}-{number}'
            images, texts, solution_url = [], [], ''
            for part_pi in range(pi, min(next_pi + 1, key_page)):
                page = doc[part_pi]
                top = y if part_pi == pi else 68
                ads = [b[1] - 15 for b in page.get_text('blocks') if 'Keep practising' in b[4] and b[1] > page.rect.height / 2]
                bottom = min(ads) if ads else page.rect.height - 85
                if part_pi == next_pi:
                    bottom = min(bottom, next_y - 4)
                if bottom <= top + 8:
                    continue
                rect = pymupdf.Rect(30, top, page.rect.width - 30, bottom)
                text = page.get_text(clip=rect).strip()
                # No continuation content: do not add an empty page-header crop.
                if part_pi != pi and not text.replace('Marks 1', '').replace('Marks 2', '').strip():
                    continue
                filename = f'{qid}-{len(images)+1}.png'
                page.get_pixmap(matrix=pymupdf.Matrix(2, 2), clip=rect).save(OUT / filename)
                images.append('/static/gate/' + filename)
                texts.append(text)
                for link in page.get_links():
                    uri = link.get('uri', '')
                    if 'questions.examside.com/past-years/gate/question/' in uri and top <= link['from'].y0 < bottom:
                        solution_url = solution_url or uri.split('?')[0]
            raw_key = keys[number]
            if re.fullmatch(r'[A-D](?:,\s*[A-D])*', raw_key):
                answers = [ord(a)-65 for a in re.findall(r'[A-D]', raw_key)]
                kind = 'choice'
                numeric_range = None
            elif re.fullmatch(r'\(?-?\d+(?:\.\d+)?\)?(?: to -?\d+(?:\.\d+)?)?', raw_key):
                values = [float(v) for v in re.findall(r'-?\d+(?:\.\d+)?', raw_key)]
                numeric_range = [values[0], values[-1]]
                answers, kind = [], 'numerical'
            else:
                answers, kind, numeric_range = [], 'written', None
            questions.append(dict(
                id=qid, tag=tag, exam='GATE', year=int(re.search(r'\d{4}', tag)[0]),
                topic=chapter, source=f'{chapter} · PDF Q{number}', question_number=number,
                question=f'{tag} — {chapter}, Q{number}', question_text='\n'.join(texts),
                images=images, options=['A', 'B', 'C', 'D'] if kind == 'choice' else [],
                answer_type=kind, answers=answers, answer=answers[0] if len(answers)==1 else None,
                answer_range=numeric_range, answer_label=raw_key, marks=marks,
                solution='Answer from the supplied PDF answer key. Open the source solution for the worked explanation.',
                source_url=f'/static/gate/{slug}.pdf#page={pi+1}',
                answer_key_url=f'/static/gate/{slug}.pdf#page={key_page+1}',
                solution_url=solution_url, source_sha256=digest,
            ))
        sources.append(dict(topic=chapter, count=len(selected), available_count=len(starts), sha256=digest,
                            url=f'/static/gate/{slug}.pdf', filename=path.name))
        print(f'{chapter}: {len(starts)} questions')
    questions.sort(key=lambda q: (-q['year'], q['topic'], q['question_number']))
    (ROOT / 'backend' / 'gate_questions.json').write_text(json.dumps(questions, ensure_ascii=False, indent=2), encoding='utf-8')
    (OUT / 'sources.json').write_text(json.dumps(sources, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Total: {len(questions)}; quiz eligible: {sum(q["answer_type"] != "written" for q in questions)}')


if __name__ == '__main__':
    build(Path(sys.argv[1]))
