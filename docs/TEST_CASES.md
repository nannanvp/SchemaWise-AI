# TEST CASES

## Schema Review
### Test 1 — Good schema
Use Sample 1. **Expected:** high score, valid PK and FK.
### Test 2 — Missing primary key
Use Sample 2. **Expected:** "Missing primary key" warning, lower score.
### Test 3 — Invalid foreign key
Use Sample 3. **Expected:** "Invalid foreign key" error (missing `faculty`).
### Test 4 — Normalization example
Use Sample 4. **Expected:** schema visualised; redundancy hinted in suggestions.
### Test 5 — E-commerce schema
Use Sample 5. **Expected:** 5 tables, multiple FK relationships, score and suggestions.
### Test 6 — Empty / non-DDL input
Submit `SELECT 1;`. **Expected:** HTTP 400 "No CREATE TABLE statement detected."

## Table Designer
### Test 7 — Single table
Design `author(author_id INT PK, author_name VARCHAR(100) NN, email VARCHAR(150) UQ)`.
**Expected:** generated SQL is valid and reviews with score 100.
### Test 8 — Foreign key linking
Design `department`, then `student` with `department_id` FK → `department.department_id`.
**Expected:** the FK appears in the generated SQL and the review shows a valid FK.

## Quiz
### Test 9 — Difficulty & count
Choose Medium, 3 questions, name "Ravi", start.
**Expected:** 3 medium questions, progress "Question 1 of 3".
### Test 10 — Correct answer feedback
Click the correct option. **Expected:** "You have answered correctly" + explanation.
### Test 11 — Wrong answer feedback
Click a wrong option. **Expected:** "Yet to choose the correct answer" + explanation;
retry is possible.
### Test 12 — Scoreboard & leaderboard
Submit the quiz, answering at least one question wrongly before getting it right.
**Expected:** scoreboard with name, score, percentage and letter grade; the retried
question reads **Correct after retry**; the entry appears in the leaderboard.

## Competitive Exam Questions
### Test 13 — Load bank
Exam = GATE, Limit 5, Load. **Expected:** 5 cards, each tagged (e.g. `GATE CS 2021`).
### Test 14 — The answer is not given away
Load any exam set and look at the cards before touching anything.
**Expected:** no option carries the "correct" mark — the answer is not visible.
### Test 15 — Self-test and reveal
Click a wrong option, then click **Show Solution**.
**Expected:** the correct option is marked, your pick is marked as your answer, the
worked solution appears, and the button reads **Hide Solution**. Clicking
**Hide Solution** clears both verdicts but keeps your pick.
### Test 16 — Exam filter
Exam = UGC NET. **Expected:** only UGC NET questions (4 in the default bank).
### Test 17 — AI generate fallback
Click **Generate with AI** while AI is offline.
**Expected:** bank questions are returned (no error).

## API (smoke)
### Test 18 — Health/config
`GET /api/health` and `GET /health` → `{"status":"ok"}`; `GET /api/config` returns
exam/topic filters, the site name in `app` and the model chain in `ai_models`.
### Test 19 — AI failover
With a key set the primary model is `qwen/qwen3.8-27b`; if it returns 429 or is
unavailable (it is a Groq *preview* model), `openai/gpt-oss-120b` is tried; if both
fail, offline content is used. (Simulated via unit test.)

## Learn, Download & Help (section V)
### Test 20 — Lessons open and close
Open section V. **Expected:** twelve lessons, all closed. **Expand all** opens every
one and the button flips to **Collapse all**.
### Test 21 — Lesson into the reviewer
Open lesson 2 and press **Open in Reviewer**.
**Expected:** the app switches to Schema Review, `#sqlInput` holds that lesson's own
`CREATE TABLE` script, the schema name is the lesson title, and a scored review runs
(the lesson-2 example scores 97/100 with no errors and no warnings).
### Test 22 — Self-check answers
Expand a lesson and open one of its **Check yourself** questions.
**Expected:** the answer appears in place, the marker flips from `+` to `–`, and
closing it hides the answer again. All twenty-four checks behave the same way.
### Test 23 — Lesson examples audit cleanly
Press **Open in Reviewer** for each of the twelve lessons in turn.
**Expected:** every example scores between 94 and 100 with no errors and no warnings;
the only findings are *Index foreign key* suggestions, which lesson 10 explains.
### Test 24 — Export gating
Open section V with no review, no designed table, no finished quiz and no loaded exam
set. **Expected:** the five *Study material* buttons are enabled and their lines read
as ready; the five *Your results* buttons are disabled and each status line says what
is missing. Run a review, design a table, finish a quiz and load an exam set, then
return: all ten enable.
### Test 25 — Report exports
Complete a review, then export the report as `.md` and as `.json`.
**Expected:** the Markdown names the schema and shows the score, the severity counts
and every finding with its fix; the JSON is the review payload verbatim (`score`,
`counts`, `tables`, `findings`, `explanation`).
### Test 26 — Score sheet export
Finish a quiz in which one question is answered wrongly before being solved, then
export the score sheet.
**Expected:** a CSV whose second line carries the score, whose question rows read
`correct on first try` or `correct after retry`, and which closes with the top ten.
### Test 27 — Study guide export
Export *Study guide*. **Expected:** a single Markdown file beginning
`# <name> — DBMS study guide`, holding all twelve lessons — goals, prose, bullet
points, each lesson's SQL block, every self-check question and its answer.
### Test 28 — Reference exports
Export *Cheat sheet*, *Glossary* and *Revision checklist*.
**Expected:** the cheat sheet carries ten `##` sections including the normal-form
table; the glossary defines 50+ terms as `- **term** — definition`; the checklist
carries 22 `- [ ]` boxes in three sections.
### Test 29 — Practice paper export
With the app using the built-in bank (no Groq key), export *Practice paper*.
**Expected:** a Markdown file whose Part 1 lists the bank's questions with their
options and an answer line each, and whose Part 2 gives the letter and the solution
for every one.
### Test 30 — Help steps read as prose, not one word per line
Open section V and read **Start here** and **A revision routine that works**.
**Expected:** each step is a normal paragraph of two or three lines with its roman
numeral in the left gutter; inline markup (`<b>`, `.mono`) stays on the text line.
The step list must not be a grid: a `display: grid` `<li>` turns every inline element
and text run into its own grid cell, which renders one fragment per line.
### Test 31 — Print
With section V open, open the browser's print preview.
**Expected:** flat ink-on-white output; download buttons and the `+`/`–` marks are
gone; sidebar, command bar and other app furniture removed.

## Naming and models
### Test 32 — Renaming the site
Edit the single line in `project_name.txt` (for example to `Quiz Studio`) and reload
the page.
**Expected:** the masthead wordmark, the browser-tab title and the Help panel show the
new name — its last word keeps the italic accent — with no restart and no code change.
`GET /api/project-name` returns `{"name":"Quiz Studio"}` and `GET /api/config` reports
the same value in `app`. Restore `SchemaWise AI` afterwards.
### Test 33 — Model chain in the status chip
Hover the AI status chip with a Groq key configured.
**Expected:** the tooltip reads
`Groq AI is available · qwen/qwen3.8-27b → openai/gpt-oss-120b`; without a key it reads
`AI unavailable - using built-in banks`.
### Test 34 — Exports carry the site name
Rename the site (as in test 32), then export *Study guide* and the designer `.sql`.
**Expected:** the Markdown starts with `# <name> — DBMS study guide` and the SQL
comment reads `-- Designed in <name> · <date>`.
### Test 35 — Download Report carries the site name
Run a review, then press **Download Report** in the command bar.
**Expected:** the saved `schema-review-report.txt` opens with
`<name> — Schema Review Report`, using the site name from `project_name.txt` — not the
pre-rename title. (Found on the live deployment, where the file still opened with the
old `AI-Based` heading.)
### Test 36 — Malformed findings cannot crash the tutor
POST `/api/ai-explain` with `findings: [{}]` or `findings: ["x"]`.
**Expected:** HTTP 200 with a normal response — invalid items are skipped, never a 500.
### Test 37 — Oversized inputs are refused, not forwarded
POST `/api/quiz/generate` with a 2 000-character topic. **Expected:** HTTP 422.
A schema under 100 KB is still accepted, and the tutor prompt carries at most the
first 12 000 characters of its SQL.
