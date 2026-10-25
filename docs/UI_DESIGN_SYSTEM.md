# SchemaWise AI — UI Design System & DOM Contract (v2: "Codex")

> **Supersedes v1 (the "NEXUS console", dark neon glass).** The product identity is
> now **clean, formal and academic**: it should read like a well-set university-press
> publication or a Springer/IEEE paper, not like a hacker dashboard.
>
> Files affected: `frontend/index.html`, `frontend/style.css`, `frontend/app.js`.
> **Backend must not change.** No new runtime dependencies, no build step.

---

## 1. Design direction — "Codex"

The register is **scholarly print**. Think journal article, thesis front-matter,
library catalogue card — not app-store marketing.

**Non-negotiable shifts from v1:**

| v1 (NEXUS) | v2 (Codex) |
| --- | --- |
| Dark-first neon glass | **Light-first** ink on paper |
| Cyan→violet→rose gradients | A **single** restrained accent + semantic inks |
| Glow, blur, luminous borders | Hairline rules, flat fills, no blur, no glow |
| 18–22px radii | **3–5px** radii (near-square) |
| Inter everywhere | **Serif-led** typography |
| Emoji iconography | Formal text labels, small caps, rules |
| Centred pill nav labels | Numbered **table-of-contents** sidebar |
| 1560px max content | ~1180px measure (readable line length) |

**Palette — dark ink on paper (light, default)**

| token | value | use |
| --- | --- | --- |
| paper | `#fbfaf7` | page ground (warm off-white, never pure white) |
| card | `#ffffff` | panels |
| ink | `#16202e` | primary text (near-black navy) |
| ink-2 | `#3c4a5c` | secondary text |
| muted | `#6b7280` | captions, hints |
| faint | `#9aa1ad` | disabled, meta |
| rule | `#ded9d0` | hairlines (1px) |
| rule-strong | `#c3bcae` | section rules, table headers |
| accent | `#1f3a5f` | **Oxford/navy** — links, primary buttons, active state |
| accent-soft | `#eaeef5` | tinted fills, active nav background |
| error | `#8c2f39` | burgundy red |
| warning | `#8a5a12` | dark ochre |
| suggestion | `#1f5f6b` | teal |
| passed | `#2f5d3a` | forest green |

No gradients anywhere. Semantic colours appear as **left rules, small caps labels
and text** — never as glowing fills.

**Dark variant (`body.dark`) — "reading lamp"**: warm dark ground `#15171b`,
card `#1c1f24`, text `#e8e4dc` (cream, not blue-white), rule `#2f333a`, accent
`#8fb0d9`. Formal and quiet. Still no glow, no gradient.

**Typography**

```html
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400..700&display=swap" rel="stylesheet" />
```
(Verified: returns 9 `@font-face` rules.)

- **Display / prose** → `"Source Serif 4", Georgia, "Iowan Old Style", "Times New Roman", serif`
- **UI chrome** (nav, buttons, labels, inputs) → `"Inter", "Segoe UI", system-ui, sans-serif`
- **Code / SQL / numerals** → `"IBM Plex Mono", "Cascadia Mono", Consolas, monospace`

Rules: headings in the serif with tight tracking; eyebrows in Inter, uppercase,
`letter-spacing:.13em`, ~11px, muted; body prose 15–16px with `line-height:1.65`.
Prose panels (`#explanation`, `.finding p`) use
`text-align: justify; hyphens: auto; text-wrap: pretty`.
Numeric readouts (metric tiles, tables, leaderboard, score) use
`font-variant-numeric: tabular-nums`.

**Formal content treatments (required)**

- **Findings** carry a small-caps severity label, not an emoji: `.sev-label`
  rendered inside `.finding`, tinted per `.error/.warning/.suggestion/.passed`.
- **Primary keys** in the schema diagram carry a `.pk-badge` ("PK") instead of 🔑.
- **Exam source tag** reads as a **citation**, in brackets: `[GATE CS 2021]`,
  set in Inter small caps with a hairline border — not a colourful pill.
- **Database tables** are set like journal tables: header rule, bottom rule,
  no vertical lines, tabular numerals.
- **Leaderboard** is a ranked table with rules, not floating rows.
- **Score** is presented as a formal metric: the ring may stay but must be a
  **thin flat stroke** (`stroke-width` ≤ 6) in the accent colour, with the number
  set in the serif beside it.
- **Print stylesheet is required** (`@media print`): hide the sidebar, document header,
  buttons and toasts; print panels flat, full width, black on white.

**Layout**

- Left **table-of-contents** sidebar (288–300px): masthead wordmark in the serif
  with a rule beneath, then `I.`–`IV.` numbered entries with small-caps labels and
  a one-line description. Active entry = `accent-soft` background + left accent rule.
- **Document header** across the content area: serif title, italic muted subtitle,
  and quiet text actions on the right.
- Content constrained to ~1180px, generous margins, panels separated by whitespace
  (spacing does the work, not borders).
- Sidebar becomes a slide-in drawer below 900px (unchanged contract).

**Motion** must be minimal and dignified: 120–180ms ease transitions, no bounce,
no keyframe flourishes. `@media (prefers-reduced-motion: reduce)` must zero them.

---

## 2. Hard rules (unchanged from v1 — breaking any of these breaks the app)

1. **Every ID in §3 must exist verbatim.** `app.js` uses `getElementById`.
2. **`.tab` / `.tab-panel` semantics stay.** `#tabs` holds `.tab[data-tab]`
   (`review` `designer` `quiz` `exam` `learn`); panels are `.tab-panel` with ids
   `tab-review` `tab-designer` `tab-quiz` `tab-exam` `tab-learn`; `app.js` toggles
   `active`.
3. **`[hidden] { display: none !important; }` is mandatory** (quiz panels).
4. **`#steps` must contain exactly 6 element children.**
5. **`#quizFeedback` is reset via `className = "quiz-feedback"`** — all base styling
   hangs off that single class; states off `.quiz-feedback.ok` / `.quiz-feedback.bad`.
6. **`#examList .toggle-sol` is immediately followed by its `.exam-solution` sibling.**
7. **`#visualization` starts with class `empty`.**
8. **Theme = `body.dark`.** v2 ships **light by default**: `<body>` has **no** class
   (or `class=""`); `app.js` adds `dark` only when the user chooses it.
9. **Google Fonts `<link>` is the only external resource.** Icons must be inline SVG.
10. **Do not rename or delete any function, class or ID used by `app.js`.**
11. **`#reviewBtn`, `#quizStart`, `#examLoad`, `#examGenerate`, `#themeBtn` contain
    PLAIN TEXT ONLY** (JS overwrites `textContent`).

---

## 3. Required IDs (exact — unchanged set)

**Shell**: `sidebar`, `tabs`, `navToggle`, `navBackdrop`, `pageTitle`, `pageSubtitle`,
`mastheadName`, `aiStatus`, `themeBtn`, `historyBtn`, `downloadBtn`, `toast`

**Panels**: `tab-review`, `tab-designer`, `tab-quiz`, `tab-exam`, `tab-learn`

**Review**: `score`, `scoreRingFill`, `tableCount`, `errorCount`, `warningCount`,
`suggestionCount`, `schemaName`, `sqlInput`, `reviewBtn`, `steps`, `visualization`,
`findings`, `explanation`, `aiMode`

**History**: `historyDrawer`, `historyList`, `closeHistory`

**Designer**: `dtName`, `dtColumns`, `dtAddColumn`, `dtAddTable`, `dtTableList`,
`dtCount`, `dtSql`, `dtCopy`, `dtSend`, `dtClear`

**Quiz**: `quizSetupPanel`, `quizRunPanel`, `quizResultPanel`, `quizName`, `quizTopic`,
`quizCount`, `quizStart`, `quizSourceHint`, `quizDifficulty`, `quizProgress`,
`quizScoreLive`, `quizProgressBar`, `quizTopicTag`, `quizDifficultyTag`, `quizQuestion`,
`quizOptions`, `quizFeedback`, `quizNext`, `quizSubmit`, `quizQuit`, `quizResult`,
`quizRetry`, `leaderboard`, `leaderRefresh`

**Exam**: `examFilter`, `examTopicFilter`, `examLimit`, `examLoad`, `examGenerate`, `examList`

**Learn / Download / Help**: `learnPanel`, `downloadPanel`, `helpPanel`,
`lessonList`, `lessonToggleAll`

**Attributes**: `[data-sample]="1".."5"`; `#quizDifficulty` 3 buttons
`data-level="easy|medium|hard"`; each `.tab` carries `data-title`/`data-subtitle`;
`datalist#topicOptions`; `#examLimit` options `5|10|20`; `#quizCount` min 1 max 20;
`[data-project-name]` marks every node that displays the site name.
Export buttons carry `data-export="lessons-md|cheatsheet-md|glossary-md|revision-md|practice-md|review-md|review-json|designer-sql|quiz-csv|exam-csv"`
and their status lines carry
`data-meta="guide|cheatsheet|glossary|revision|practice|review|designer|quiz|exam"`.

---

## 4. Class inventory

### 4a. Generated by `app.js` — CSS must style all of these
`empty`, `table-grid`, `db-table`, `db-name`, `db-column`, **`pk-badge`**,
`relationships`, `relationship`, `finding` + `.error/.warning/.suggestion/.passed`,
**`sev-label`**, `explanation-section`, `history-item`, `dt-col-row`, `cb`, `remove`,
`dt-table-card`, `row`, `small`, `quiz-option`, `key`, `quiz-feedback` + `.ok/.bad`,
`result-review`, `rr` + `.ok/.bad`, `big` + `.ok/.mid/.bad`, **`grade`**,
`leader-row` + `.top1/.top2/.top3`, `rank`, `pct`, `exam-card`, `top`, `tag`,
`exam-topic`, `exam-q`, `exam-options` (carries `data-answer`), `exam-option` +
`.picked/.correct/.wrong`, `exam-solution`, `toggle-sol`, `badge`, `chip` + `.ok/.off`,
`skeleton`

JS hooks that need **no** styling of their own (they either carry no look of their
own or are styled via descendants): `c-name`, `c-type`, `c-pk`, `c-nn`, `c-uq`,
`c-fk`, `explanation-panel`, `lesson-open` (an `.btn` hook for the lesson buttons).

### 4b. Markup-owned classes
Nav: `.tab`, `.tab-icon`, `.tab-label`, `.tab-num` (the `I.` numeral), `.tab-go`
Chrome: `.btn` `.btn-primary` `.btn-ghost` `.btn-sm`, `.chip`, `.badge`
Panels: `.panel`, `.panel-head`, `.panel-title`, `.hint`, `.field`, `.label`, `.eyebrow`
Review: `.metric-tile` — slim strip laid out `[icon] LABEL …… value` (value flushed
right, `9px 12px` padding, 38px tall); the tiles stay four-up down to 760px and go
two-up below that. `.score-ring`, `.steps`, `.step`, `.workspace`,
`.editor-dock`, `.output-dock`, `.stream`
Designer: `.grid-sql`, `.cols-head`, `.studio-actions`, `.sql-dock`
Quiz: `.arena`, `.option-tile`, `.rail`, `.segmented`, `.leaderboard`
Exam: `.filter-bar`, `.feed`
Learn/Download/Help (section V): `.lesson-list`, `.lesson` (a `<details>`),
`.lesson-num`, `.lesson-name` (serif), `.lesson-tag`, `.lesson-body`, `.lesson-goal`
(the italic accent-ruled "you will be able to" line), `.lesson-points`,
`.lesson-note`, `.lesson-sql`, `.lesson-checks` with `.lesson-checks-title` and
`.check` (a `<details>` per self-check question, reusing the lesson/FAQ disclosure
mark), `.lesson-actions`, `.dl-group`, `.dl-group-title`, `.dl-group-note`,
`.dl-grid`, `.dl-item`, `.dl-item-head`, `.dl-fmt`, `.dl-desc`, `.dl-meta` (JS
toggles `.is-ready` on it), `.help-block`, `.help-title`, `.help-note`, `.help-table`
(two-column verdict/troubleshooting tables), `.help-steps`, `.faq-list`, `.faq`
(a `<details>`)
Utility: `.muted`, `.mono`, `.sr-only`, `.stack`, `.row-wrap`, `.divider`, `.skeleton`

---

## 5. Behaviour contract for `app.js`

Keep every function, variable, API path, payload and DOM id. Make these changes:

1. **Default theme is light**: `applyTheme(localStorage.getItem("schema-theme") === "dark")`.
   `#themeBtn` label reflects the action (e.g. "Dark" / "Light").
2. **Remove decorative emoji; keep meaning.** Replace with formal marks:
   - `.db-column` primary key: `<span class="pk-badge">PK</span>` instead of `🔑`.
   - `.relationship`: drop `🔗`.
   - findings: emit `<span class="sev-label">Error|Warning|Suggestion|Passed</span>`
     instead of `🔴🟠🔵🟢`. Keep the `finding ${severity}` class.
   - `#examGenerate` finally-text becomes `Generate with AI` (no ✨).
3. **Quiz feedback keeps its exact wording** — `You have answered correctly` and
   `Yet to choose the correct answer` — but **without** the ✅/❌ glyphs; the tick and
   cross are drawn by CSS on `.quiz-feedback.ok` / `.quiz-feedback.bad`.
4. **Formal verdicts** without emoji, e.g. `Distinction` / `Merit` / `Pass` /
   `Needs revision`, and add a `.grade` element (letter grade: A+, A, B, C, D, F)
   into the quiz result markup.
5. **Exam answers stay hidden until revealed.** `renderExamCard` must not emit
   `.correct` at render time; it stores the answer index on `.exam-options` as
   `data-answer`. Options are `role="button"` with `aria-pressed`, and a click
   records only `.picked`. `paintExamOptions(box, revealed)` is what adds `.correct`
   (the answer) or `.wrong` (the reader's divergent pick), and only while the
   solution is open.
6. **Section V reads state; it never owns it.** `renderExamList` also records the
   loaded questions in `examState`, and `chooseOption` records a wrong pick in
   `quizState.missed` (alongside `firstTry`), so the scoreboard and the score sheet
   can distinguish "correct on first try" from "correct after retry".
7. **`refreshExportState()` gates the exports.** Called once at boot and on every
   click of the `learn` tab, it enables a `[data-export]` button only when its
   source has content, writes the matching `[data-meta]` line and toggles
   `.is-ready`. Exports are assembled in the browser (`Blob` + an `<a download>`);
   nothing is uploaded. The five *Study material* sources are constants — the study
   guide is read back out of `#lessonList`, the practice paper is fetched from
   `/api/exam/questions` — so they are always ready; only the *Your results* group
   waits for a session. `#lessonToggleAll` opens or closes every `.lesson` in
   `#lessonList`, and each lesson's **Open in Reviewer** loads its `.lesson-sql`
   into `#sqlInput`, sets `#schemaName` from the lesson title and runs the review.
8. Keep the score ring, count-up, skeletons, nav drawer, page headings and every
   existing flow exactly as they behave now.
9. **The site name is data, not markup.** At boot `loadConfig()` calls
   `applyProjectName(cfg.app)`, so the value that comes back from `GET /api/config`
   (`project_name.txt`, or the `PROJECT_NAME` env var) replaces the text of
   `#mastheadName` — whose final word is wrapped in `<em>` so the accent survives
   any name — plus every `[data-project-name]` node and `document.title`. Only
   `textContent` is written, never `innerHTML`, and the name is clipped to 60
   characters. The HTML ships with the default `SchemaWise AI` hardcoded, so the
   page still reads correctly when JavaScript or the API is unavailable.
10. **Section V is written for students, not for the operator.** Its lessons teach the
    DBMS concepts, its *Help* panel answers a user's questions and its downloads are
    study material; environment variables, hosting and API-key topics belong in
    `README.md` and `docs/DEPLOYMENT.md` and must not appear in the interface.
11. **Never put prose inside a flex or grid row.** A `display: flex/grid` container
    gives every inline child and every text run its own box, so a step with `<b>` and
    `.mono` markup inside a grid renders one fragment per line. `.help-steps li` is a
    block whose roman numeral is absolutely positioned in the left gutter; keep prose
    in block containers (`.lesson-points li`, `.help-table td`, `p`) and reserve flex
    rows for label/value pairs such as `.dl-item-head` and `.dl-group-title`.

---

## 6. Acceptance checks

- All five sections reachable from the numbered sidebar (I–V); one panel visible at a time.
- Editing `project_name.txt` and reloading renames the masthead, the browser tab and
  the Help panel, and the same name heads the exported `.md`/`.sql` files.
- The AI status chip names the model chain that is actually in use
  (`qwen/qwen3.8-27b → openai/gpt-oss-120b` on a fresh Groq setup).
- Send to Review Editor fills `#sqlInput` and switches to Schema Review.
- Section V: the twelve lessons open and close; **Expand all** flips to **Collapse
  all**; every lesson's **Open in Reviewer** loads its own SQL, names the review after
  the lesson and returns an audit of 94–100 with no errors or warnings; every
  self-check answer opens and closes in place.
- On a fresh load the five *Study material* exports are live and the five *Your
  results* exports are disabled; each result enables once its source exists, writing a
  file that matches the state on screen (report `.md`/`.json`, designer `.sql`, quiz
  `.csv`, exam `.csv`).
- Quiz: correct pick shows "You have answered correctly"; wrong shows
  "Yet to choose the correct answer"; submit shows the scoreboard, grade and table.
- Exam cards show bracketed citations, topic labels, and a working solution toggle.
- No exam option is marked correct — or wrong — before **Show Solution** is pressed;
  revealing marks the answer, and the reader's own pick when it differs.
- Zero console errors, zero failed requests, no horizontal overflow at 1440/1000/390px.
- `@media print` produces a clean, flat, ink-on-white document.
- Light is the default on a fresh load; the dark "reading lamp" variant is fully styled.
