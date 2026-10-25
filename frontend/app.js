/* SchemaWise AI - frontend logic
   Sections: helpers | theme | nav drawer & tabs | stat animations
             | review (skeleton placeholders, score ring, render)
             | history | designer | quiz | exam */

const $ = (id) => document.getElementById(id);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[m]));
}

let toastTimer = null;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

async function api(path, options) {
  const res = await fetch(path, options);
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok) {
    const raw = data && (data.detail || data.message);
    const detail = Array.isArray(raw)
      ? raw.map((d) => (d && d.msg) || "").filter(Boolean).join("; ")
      : raw;
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return data;
}

function mdToHtml(md) {
  if (!md) return "";
  if (typeof marked !== "undefined" && typeof DOMPurify !== "undefined") {
    return DOMPurify.sanitize(marked.parse(md));
  }
  return esc(md).replace(/\n/g, "<br>");
}

function renderExplanation(md) {
  const box = $("explanation");
  if (!md) {
    box.textContent = "Run a review to see a student-friendly explanation.";
    return;
  }
  const parts = md.split(/^### /m).filter(Boolean);
  if (parts.length < 2 || typeof marked === "undefined") {
    box.innerHTML = mdToHtml(md);
    return;
  }
  box.innerHTML = parts.map((part) => {
    const [titleLine, ...rest] = part.split("\n");
    return `<div class="explanation-section">
      <h4>${esc(titleLine.trim())}</h4>
      ${mdToHtml(rest.join("\n").trim())}
    </div>`;
  }).join("");
}

/* ------------------------------------------------------------------ */
/* Theme                                                              */
/* ------------------------------------------------------------------ */
function applyTheme(dark) {
  document.body.classList.toggle("dark", dark);
  $("themeBtn").textContent = dark ? "Light" : "Dark";
  localStorage.setItem("schema-theme-v2", dark ? "dark" : "light");
}
$("themeBtn").onclick = () => applyTheme(!document.body.classList.contains("dark"));
applyTheme(localStorage.getItem("schema-theme-v2") === "dark");

/* ------------------------------------------------------------------ */
/* Project name (project_name.txt, served by /api/config)              */
/* ------------------------------------------------------------------ */
let projectName = "SchemaWise AI";

function applyProjectName(name) {
  const clean = String(name || "").trim().slice(0, 60);
  if (!clean) return;
  projectName = clean;

  // Wordmark: the final word keeps the italic accent, whatever the name is.
  const mark = $("mastheadName");
  if (mark) {
    const parts = clean.split(/\s+/);
    const last = parts.pop();
    mark.textContent = parts.length ? `${parts.join(" ")} ` : "";
    const em = document.createElement("em");
    em.textContent = last;
    mark.appendChild(em);
  }

  document.title = `${clean} · Schema Review, Designer, Quiz, Exam & Learn`;
  $$("[data-project-name]").forEach((el) => { el.textContent = clean; });
}

/* ------------------------------------------------------------------ */
/* Nav drawer & tabs                                                   */
/* ------------------------------------------------------------------ */
function setNavOpen(open) {
  document.body.classList.toggle("nav-open", open);
  const toggle = $("navToggle");
  if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
}

const navToggle = $("navToggle");
if (navToggle) {
  navToggle.setAttribute("aria-expanded", "false");
  navToggle.onclick = () => setNavOpen(!document.body.classList.contains("nav-open"));
}
const navBackdrop = $("navBackdrop");
if (navBackdrop) navBackdrop.onclick = () => setNavOpen(false);

function setPageHeading(tab) {
  const title = $("pageTitle");
  const subtitle = $("pageSubtitle");
  if (title && tab.dataset.title !== undefined) title.textContent = tab.dataset.title;
  if (subtitle && tab.dataset.subtitle !== undefined) subtitle.textContent = tab.dataset.subtitle;
}

$$("#tabs .tab").forEach((tab) => {
  tab.onclick = () => {
    $$("#tabs .tab").forEach((t) => t.classList.toggle("active", t === tab));
    $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${tab.dataset.tab}`));
    setPageHeading(tab);
    setNavOpen(false);
  };
});

function openTab(name) {
  const tab = document.querySelector(`#tabs .tab[data-tab="${name}"]`);
  if (tab) tab.click();
}

/* ------------------------------------------------------------------ */
/* Stat animations                                                     */
/* ------------------------------------------------------------------ */
function prefersReducedMotion() {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* Animate a number from 0 up to `target`; `format` builds the text. */
function countUp(el, target, format) {
  if (!el) return;
  const value = Number(target) || 0;
  const fmt = format || ((v) => String(v));
  if (prefersReducedMotion() || typeof window.requestAnimationFrame !== "function") {
    el.textContent = fmt(value);
    return;
  }
  if (el._countRaf) cancelAnimationFrame(el._countRaf);
  const duration = 700;
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = fmt(Math.round(value * eased));
    if (t < 1) {
      el._countRaf = requestAnimationFrame(tick);
    } else {
      el._countRaf = null;
      el.textContent = fmt(value);
    }
  };
  el._countRaf = requestAnimationFrame(tick);
}

/* ------------------------------------------------------------------ */
/* Schema Review                                                      */
/* ------------------------------------------------------------------ */
let latest = null;

const samples = {
  1: `CREATE TABLE department (
  department_id INT PRIMARY KEY,
  department_name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE student (
  student_id INT PRIMARY KEY,
  student_name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE,
  department_id INT NOT NULL,
  FOREIGN KEY (department_id) REFERENCES department(department_id)
);`,
  2: `CREATE TABLE student (
  student_name VARCHAR(100),
  email VARCHAR(100),
  department_id INT
);`,
  3: `CREATE TABLE course (
  course_id INT PRIMARY KEY,
  course_name VARCHAR(120) NOT NULL,
  faculty_id INT,
  FOREIGN KEY (faculty_id) REFERENCES faculty(faculty_id)
);`,
  4: `CREATE TABLE student_record (
  student_id INT PRIMARY KEY,
  student_name VARCHAR(100),
  department_id INT,
  department_name VARCHAR(100),
  department_phone VARCHAR(30)
);

CREATE TABLE department (
  department_id INT PRIMARY KEY,
  department_name VARCHAR(100)
);`,
  5: `CREATE TABLE customer (
  customer_id INT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE
);

CREATE TABLE product (
  product_id INT PRIMARY KEY,
  product_name VARCHAR(150) NOT NULL,
  price DECIMAL(10,2) NOT NULL
);

CREATE TABLE orders (
  order_id INT PRIMARY KEY,
  customer_id INT NOT NULL,
  order_date DATE NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customer(customer_id)
);

CREATE TABLE order_item (
  order_item_id INT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(order_id),
  FOREIGN KEY (product_id) REFERENCES product(product_id)
);

CREATE TABLE payment (
  payment_id INT PRIMARY KEY,
  order_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(order_id)
);`,
};

$("sqlInput").value = samples[1];

$$("[data-sample]").forEach((btn) => {
  btn.onclick = () => {
    const n = btn.dataset.sample;
    $("sqlInput").value = samples[n];
    $("schemaName").value = [
      "Correct Student Schema", "Missing Primary Key", "Invalid Foreign Key",
      "Normalization Example", "E-Commerce Schema",
    ][n - 1];
  };
});

function setSteps(active = -1, allDone = false) {
  Array.from($("steps").children).forEach((el, i) => {
    el.classList.remove("active", "done");
    if (allDone || i < active) el.classList.add("done");
    else if (i === active) el.classList.add("active");
  });
}

async function animateSteps() {
  for (let i = 0; i < 6; i++) {
    setSteps(i);
    await new Promise((r) => setTimeout(r, 90));
  }
}

/* Shimmer placeholders shown inside the output panes while a review runs. */
const reviewSkeletons = { vizHtml: null, vizEmpty: false, findingsHtml: null };

function showReviewSkeletons() {
  const viz = $("visualization");
  const findings = $("findings");
  if (viz) {
    reviewSkeletons.vizHtml = viz.innerHTML;
    reviewSkeletons.vizEmpty = viz.classList.contains("empty");
    viz.classList.remove("empty");
    viz.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>`;
  }
  if (findings) {
    reviewSkeletons.findingsHtml = findings.innerHTML;
    findings.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>`;
  }
}

/* Restore the panes as they were when the review attempt failed. */
function hideReviewSkeletons() {
  const viz = $("visualization");
  const findings = $("findings");
  if (viz && reviewSkeletons.vizHtml !== null) {
    viz.innerHTML = reviewSkeletons.vizHtml;
    viz.classList.toggle("empty", reviewSkeletons.vizEmpty);
  }
  if (findings && reviewSkeletons.findingsHtml !== null) {
    findings.innerHTML = reviewSkeletons.findingsHtml;
  }
  reviewSkeletons.vizHtml = null;
  reviewSkeletons.findingsHtml = null;
}

/* Circumference for the score ring, parsed from its stroke-dasharray. */
function ringCircumference(ring) {
  let raw = "";
  try { raw = window.getComputedStyle(ring).strokeDasharray || ""; } catch { /* ignore */ }
  if (!raw || raw === "none") raw = ring.getAttribute("stroke-dasharray") || "";
  let c = parseFloat(String(raw).split(/[,\s]+/)[0]);
  if (!c && ring.r && ring.r.baseVal) c = 2 * Math.PI * ring.r.baseVal.value;
  return c || 0;
}

function render(data) {
  latest = data;
  countUp($("score"), data.score, (v) => `${v}/100`);
  countUp($("tableCount"), data.tables.length);
  countUp($("errorCount"), data.counts.errors);
  countUp($("warningCount"), data.counts.warnings);
  countUp($("suggestionCount"), data.counts.suggestions);
  $("aiMode").textContent = data.ai_used ? "Online AI Tutor" : "Built-in AI Tutor";
  $("downloadBtn").disabled = false;

  /* Score ring: dashoffset = circumference * (1 - score/100) */
  const ring = $("scoreRingFill");
  if (ring) {
    const c = ringCircumference(ring);
    if (c > 0) {
      const pct = Math.max(0, Math.min(100, Number(data.score) || 0));
      ring.style.setProperty("stroke-dashoffset", String(c * (1 - pct / 100)));
    }
  }

  const viz = $("visualization");
  viz.classList.remove("empty");
  viz.innerHTML = `
    <div class="table-grid">
      ${data.tables.map((t) => `
        <div class="db-table">
          <div class="db-name">${esc(t.name)}</div>
          ${t.columns.map((c) => `
            <div class="db-column">
              <span>${t.primary_key.includes(c.name) ? `<span class="pk-badge">PK</span>` : ""}${esc(c.name)}</span>
              <span>${esc(c.type)}${t.foreign_keys.some((f) => f.column === c.name) ? " · FK" : ""}</span>
            </div>`).join("")}
        </div>`).join("")}
    </div>
    ${data.relationships.length ? `
      <div class="relationships">
        <h3>Relationships</h3>
        ${data.relationships.map((r) => `
          <div class="relationship"><b>${esc(r.from)}</b>.${esc(r.column)}
          → <b>${esc(r.to)}</b>.${esc(r.ref_column)}</div>`).join("")}
      </div>` : ""}`;

  const sevLabels = { error: "Error", warning: "Warning", suggestion: "Suggestion", passed: "Passed" };
  $("findings").innerHTML = data.findings.map((f) => `
    <div class="finding ${f.severity}">
      <span class="sev-label">${sevLabels[f.severity] || "Notice"}</span>
      <strong>${esc(f.title)}</strong>
      <p>${esc(f.message)}</p>
      ${f.fix ? `<p><b>Fix:</b> ${esc(f.fix)}</p>` : ""}
    </div>`).join("");

  renderExplanation(data.explanation);
  setSteps(-1, true);
}

async function fetchAiExplanation(sqlText, data) {
  $("aiMode").textContent = "Checking AI Tutor…";
  try {
    const aiData = await api("/api/ai-explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: sqlText, findings: data.findings, score: data.score }),
    });
    $("aiMode").textContent = aiData.ai_used ? "Online AI Tutor" : "Built-in AI Tutor";
    renderExplanation(aiData.explanation);
  } catch {
    $("aiMode").textContent = "Built-in AI Tutor";
  }
}

$("reviewBtn").onclick = async () => {
  const sql = $("sqlInput").value.trim();
  if (!sql) { toast("Enter SQL first."); return; }

  $("reviewBtn").disabled = true;
  $("reviewBtn").textContent = "Reviewing...";
  $("explanation").textContent = "Analysing schema...";
  showReviewSkeletons();
  await animateSteps();

  try {
    const data = await api("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schema_name: $("schemaName").value || "Untitled Schema", sql }),
    });
    render(data);
    toast("Review completed");
    fetchAiExplanation(sql, data);
  } catch (err) {
    hideReviewSkeletons();
    $("explanation").textContent = err.message;
    setSteps();
    toast(err.message);
  } finally {
    $("reviewBtn").disabled = false;
    $("reviewBtn").textContent = "Review Schema";
  }
};

/* History drawer */
$("historyBtn").onclick = async () => {
  $("historyDrawer").classList.add("open");
  try {
    const data = await api("/api/history");
    $("historyList").innerHTML = data.length ? data.map((x) => `
      <div class="history-item" data-id="${x.id}">
        <b>${esc(x.schema_name)}</b> — ${x.score}/100
        <small>${esc(x.created_at)} · ${x.errors} error(s) · ${x.warnings} warning(s)</small>
      </div>`).join("") : `<div class="empty">No history yet.</div>`;

    $$(".history-item").forEach((item) => {
      item.onclick = async () => {
        const x = await api(`/api/history/${item.dataset.id}`);
        $("schemaName").value = x.schema_name;
        $("sqlInput").value = x.sql;
        render(x);
        $("historyDrawer").classList.remove("open");
        openTab("review");
      };
    });
  } catch (err) { toast(err.message); }
};
$("closeHistory").onclick = () => $("historyDrawer").classList.remove("open");

$("downloadBtn").onclick = () => {
  if (!latest) return;
  const report = `${projectName} — Schema Review Report

Schema: ${latest.schema_name}
Date: ${latest.created_at}
Score: ${latest.score}/100

Errors: ${latest.counts.errors}
Warnings: ${latest.counts.warnings}
Suggestions: ${latest.counts.suggestions}

FINDINGS
========
${latest.findings.map((f) => `${f.severity.toUpperCase()}: ${f.title}
${f.message}
${f.fix ? "Fix: " + f.fix : ""}`).join("\n\n")}

EXPLANATION
===========
${latest.explanation}
`;
  const blob = new Blob([report], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "schema-review-report.txt";
  a.click();
  URL.revokeObjectURL(a.href);
};

/* ------------------------------------------------------------------ */
/* Table Designer                                                     */
/* ------------------------------------------------------------------ */
const COLUMN_TYPES = [
  "INT", "BIGINT", "SMALLINT", "VARCHAR(50)", "VARCHAR(100)", "VARCHAR(150)",
  "VARCHAR(255)", "CHAR(10)", "TEXT", "DECIMAL(10,2)", "FLOAT", "DOUBLE",
  "BOOLEAN", "DATE", "DATETIME", "TIMESTAMP",
];

let designerTables = [];
try { designerTables = JSON.parse(localStorage.getItem("schema-designer") || "[]") || []; }
catch { designerTables = []; }

function saveDesigner() {
  localStorage.setItem("schema-designer", JSON.stringify(designerTables));
}

function fkTargets() {
  const out = [];
  designerTables.forEach((t) => {
    t.columns.forEach((c) => {
      if (c.name) out.push(`${t.name}.${c.name}`);
    });
  });
  return out;
}

function makeColumnRow(col = {}) {
  const row = document.createElement("div");
  row.className = "dt-col-row";
  row.innerHTML = `
    <input class="c-name" placeholder="column_name" value="${esc(col.name || "")}" />
    <select class="c-type">
      ${COLUMN_TYPES.map((t) => `<option ${t === (col.type || "INT") ? "selected" : ""}>${t}</option>`).join("")}
    </select>
    <label class="cb" title="Primary key"><input type="checkbox" class="c-pk" ${col.pk ? "checked" : ""} /></label>
    <label class="cb" title="Not null"><input type="checkbox" class="c-nn" ${col.nn ? "checked" : ""} /></label>
    <label class="cb" title="Unique"><input type="checkbox" class="c-uq" ${col.uq ? "checked" : ""} /></label>
    <select class="c-fk"></select>
    <button class="remove" title="Remove column">✕</button>`;

  const fkSelect = row.querySelector(".c-fk");
  const fillFk = (value) => {
    const targets = fkTargets();
    fkSelect.innerHTML = `<option value="">—</option>` +
      targets.map((t) => `<option ${t === value ? "selected" : ""}>${t}</option>`).join("");
  };
  fillFk(col.fk || "");

  const pk = row.querySelector(".c-pk");
  const nn = row.querySelector(".c-nn");
  pk.onchange = () => { if (pk.checked) nn.checked = true; };

  row.querySelector(".remove").onclick = () => {
    row.remove();
    if (!$("dtColumns").children.length) makeColumnRow();
  };
  return row;
}

function addColumnRow(col) {
  $("dtColumns").appendChild(makeColumnRow(col));
}

function refreshFkSelects() {
  $$("#dtColumns .c-fk").forEach((sel) => {
    const current = sel.value;
    const targets = fkTargets();
    sel.innerHTML = `<option value="">—</option>` +
      targets.map((t) => `<option ${t === current ? "selected" : ""}>${t}</option>`).join("");
  });
}

function readCurrentTable() {
  const name = ($("dtName").value || "").trim().toLowerCase().replace(/\s+/g, "_");
  const columns = [];
  $$("#dtColumns .dt-col-row").forEach((row) => {
    const cname = row.querySelector(".c-name").value.trim();
    if (!cname) return;
    columns.push({
      name: cname,
      type: row.querySelector(".c-type").value,
      pk: row.querySelector(".c-pk").checked,
      nn: row.querySelector(".c-nn").checked,
      uq: row.querySelector(".c-uq").checked,
      fk: row.querySelector(".c-fk").value,
    });
  });
  return { name, columns };
}

function tableToSql(table) {
  const lines = [];
  const pkCols = table.columns.filter((c) => c.pk).map((c) => c.name);
  const singlePk = pkCols.length === 1 ? pkCols[0] : null;

  table.columns.forEach((c) => {
    let def = `  ${c.name} ${c.type}`;
    if (singlePk && c.name === singlePk) def += " PRIMARY KEY";
    if (c.nn || (singlePk && c.name === singlePk)) def += " NOT NULL";
    if (c.uq) def += " UNIQUE";
    lines.push(def);
  });
  if (pkCols.length > 1) lines.push(`  PRIMARY KEY (${pkCols.join(", ")})`);
  table.columns.forEach((c) => {
    if (!c.fk) return;
    const [t, col] = c.fk.split(".");
    lines.push(`  FOREIGN KEY (${c.name}) REFERENCES ${t}(${col})`);
  });
  return `CREATE TABLE ${table.name} (\n${lines.join(",\n")}\n);`;
}

function renderDesigner() {
  const list = $("dtTableList");
  $("dtCount").textContent = `${designerTables.length} table${designerTables.length === 1 ? "" : "s"}`;
  if (!designerTables.length) {
    list.innerHTML = `<div class="empty">No tables designed yet.</div>`;
  } else {
    list.innerHTML = designerTables.map((t, i) => `
      <div class="dt-table-card">
        <div class="row">
          <div>
            <b>${esc(t.name)}</b>
            <small>${t.columns.length} column(s) · ${t.columns.filter((c) => c.pk).length} PK · ${t.columns.filter((c) => c.fk).length} FK</small>
          </div>
          <button class="secondary small" data-remove="${i}">Remove</button>
        </div>
      </div>`).join("");
    $$("[data-remove]").forEach((b) => {
      b.onclick = () => { designerTables.splice(Number(b.dataset.remove), 1); saveDesigner(); renderDesigner(); refreshFkSelects(); };
    });
  }
  $("dtSql").value = designerTables.map(tableToSql).join("\n\n");
  refreshFkSelects();
}

$("dtAddColumn").onclick = () => addColumnRow();

$("dtAddTable").onclick = () => {
  const table = readCurrentTable();
  if (!table.name) { toast("Enter a table name."); return; }
  if (!table.columns.length) { toast("Add at least one column."); return; }
  if (designerTables.some((t) => t.name === table.name)) { toast("That table name already exists."); return; }

  designerTables.push(table);
  saveDesigner();
  $("dtName").value = "";
  $("dtColumns").innerHTML = "";
  addColumnRow({ name: "id", type: "INT", pk: true, nn: true });
  renderDesigner();
  toast(`Table "${table.name}" added`);
};

$("dtClear").onclick = () => {
  if (!designerTables.length) return;
  if (!confirm("Remove all designed tables?")) return;
  designerTables = [];
  saveDesigner();
  renderDesigner();
};

$("dtCopy").onclick = async () => {
  const sql = $("dtSql").value.trim();
  if (!sql) { toast("Nothing to copy yet."); return; }
  try {
    await navigator.clipboard.writeText(sql);
    toast("SQL copied to clipboard");
  } catch {
    $("dtSql").select();
    document.execCommand("copy");
    toast("SQL copied");
  }
};

$("dtSend").onclick = () => {
  const sql = $("dtSql").value.trim();
  if (!sql) { toast("Add a table first."); return; }
  $("sqlInput").value = `${sql}\n`;
  if (!$("schemaName").value.trim() || $("schemaName").value === "Student Database") {
    $("schemaName").value = "Designed Schema";
  }
  openTab("review");
  toast("Sent to the SQL editor");
  $("reviewBtn").scrollIntoView({ behavior: "smooth", block: "center" });
};

/* ------------------------------------------------------------------ */
/* Quiz                                                               */
/* ------------------------------------------------------------------ */
const quizState = {
  questions: [], answers: [], firstTry: [], missed: [], index: 0, score: 0,
  name: "Anonymous", topic: "DBMS", difficulty: "easy", active: false,
};

$$("#quizDifficulty button").forEach((btn) => {
  btn.onclick = () => {
    $$("#quizDifficulty button").forEach((b) => b.classList.toggle("active", b === btn));
  };
});

function selectedDifficulty() {
  const active = document.querySelector("#quizDifficulty button.active");
  return active ? active.dataset.level : "all";
}

function resetQuizPanels() {
  $("quizRunPanel").hidden = true;
  $("quizResultPanel").hidden = true;
  $("quizSetupPanel").hidden = false;
}

$("quizSource").onchange = () => {
  const ai = $("quizSource").value === "ai";
  $("quizDifficulty").parentElement.hidden = ai;
  $("quizCount").max = ai ? "10" : "20";
  if (ai && Number($("quizCount").value) > 10) $("quizCount").value = "10";
  $("quizModeHint").textContent = ai
    ? "Generate up to 10 new questions with Groq. AI answers can be mistaken; these are not official GATE questions."
    : "96 sourced questions across five topics.";
};

$("quizStart").onclick = async () => {
  const source = $("quizSource").value;
  const name = ($("quizName").value || "").trim() || "Anonymous";
  const topic = ($("quizTopic").value || "").trim() || "DBMS (Database Management Systems)";
  const difficulty = selectedDifficulty();
  const count = Math.max(1, Math.min(20, parseInt($("quizCount").value, 10) || 5));

  $("quizStart").disabled = true;
  $("quizStart").textContent = "Loading…";
  $("quizSourceHint").textContent = "Preparing questions…";

  try {
    const data = await api("/api/quiz/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, topic, difficulty, count }),
    });

    const questions = data.questions || [];
    if (!questions.length) { toast("No questions match that topic and mark filter. Try All marks."); return; }

    quizState.questions = questions;
    quizState.answers = new Array(questions.length).fill(null);
    quizState.firstTry = new Array(questions.length).fill(false);
    quizState.missed = new Array(questions.length).fill(false);
    quizState.index = 0;
    quizState.score = 0;
    quizState.name = name;
    quizState.topic = data.topic || topic;
    quizState.difficulty = data.difficulty || difficulty;
    quizState.active = true;

    $("quizSetupPanel").hidden = true;
    $("quizResultPanel").hidden = true;
    $("quizRunPanel").hidden = false;
    $("quizTopicTag").textContent = quizState.topic;
    $("quizDifficultyTag").textContent = quizState.difficulty.toUpperCase();
    $("quizSourceHint").textContent =
      `${questions.length} ${source === "ai" ? "AI-generated practice questions" : "sourced GATE PYQs"} loaded${questions.length < count ? ` (${count} requested)` : ""}.`;
    renderQuestion();
  } catch (err) {
    toast(err.message);
    $("quizSourceHint").textContent = err.message;
  } finally {
    $("quizStart").disabled = false;
    $("quizStart").textContent = "Start Quiz";
  }
};

function answerText(q) {
  return q.answer_type === "choice" ? q.answers.map(i => "ABCD"[i]).join(", ") : q.answer_label;
}

function sourceLinks(q) {
  if (q.source === "ai") return '<p class="hint"><strong>AI-generated practice</strong> · Not an official GATE question. Check important answers against your course material.</p>';
  return `<div class="question-sources"><a href="${esc(q.source_url)}" target="_blank" rel="noopener">Original PDF · Q${q.question_number}</a>
    <a href="${esc(q.answer_key_url)}" target="_blank" rel="noopener">PDF answer key</a>
    ${q.solution_url ? `<a href="${esc(q.solution_url)}" target="_blank" rel="noopener">Worked solution on ExamSIDE</a>` : ""}</div>`;
}

function questionImages(q) {
  return (q.images || []).map((url, i) => `<a href="${esc(url)}" target="_blank" rel="noopener" title="Open full-size question image"><img class="gate-question-image" src="${esc(url)}" alt="${esc(q.question)}${i ? ' — continued' : ''}" loading="lazy"></a>`).join("");
}

function answerControls(q, id) {
  if (q.answer_type === "numerical") return `<label class="label" for="${id}">Numerical answer</label><input id="${id}" class="gate-numeric" type="text" inputmode="decimal" autocomplete="off" placeholder="Enter your answer" />`;
  if (q.answer_type === "written") return `<p class="hint">Written-response question. Compare your working with the source solution.</p>`;
  return `<p class="hint">${q.source === "ai" ? "Select one answer, then check." : "Select your answer(s), then check. Letters refer to the original options above."}</p><div class="gate-choices${q.source === "ai" ? " ai-choices" : ""}">${q.options.map((o,i) => `<button type="button" class="gate-choice" data-idx="${i}" aria-pressed="false">${q.source === "ai" ? "ABCD"[i] + ". " : ""}${esc(o)}</button>`).join("")}</div>`;
}

function bindChoices(box) {
  box.querySelectorAll(".gate-choice").forEach(btn => {
    btn.onclick = () => {
      const selected = btn.getAttribute("aria-pressed") !== "true";
      if (btn.closest(".ai-choices")) {
        box.querySelectorAll(".gate-choice").forEach(other => {
          other.setAttribute("aria-pressed", "false");
          other.classList.remove("picked");
        });
      }
      btn.setAttribute("aria-pressed", String(selected));
      btn.classList.toggle("picked", selected);
    };
  });
}

function gradeResponse(q, box) {
  if (q.answer_type === "numerical") {
    const text = box.querySelector("input").value.trim();
    if (!text || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
    const value = Number(text);
    return Number.isFinite(value) && value >= q.answer_range[0] && value <= q.answer_range[1];
  }
  const selected = Array.from(box.querySelectorAll('[aria-pressed="true"]')).map(b => Number(b.dataset.idx));
  if (!selected.length) return null;
  return selected.length === q.answers.length && q.answers.every(a => selected.includes(a));
}

function renderQuestion() {
  const i = quizState.index;
  const q = quizState.questions[i];
  $("quizProgress").textContent = `Question ${i + 1} of ${quizState.questions.length}`;
  $("quizScoreLive").textContent = `Score: ${quizState.score}`;
  $("quizProgressBar").style.width = `${i / quizState.questions.length * 100}%`;
  $("quizQuestion").textContent = q.question;
  $("quizOptions").innerHTML = questionImages(q) + sourceLinks(q) +
    `<div class="gate-response">${answerControls(q, "quizNumeric")}</div><button id="quizCheck" type="button" class="btn btn-primary">Check answer</button>`;
  bindChoices($("quizOptions"));
  $("quizCheck").onclick = checkQuizAnswer;
  $("quizFeedback").hidden = true;
  $("quizFeedback").innerHTML = "";
  $("quizNext").hidden = true;
  $("quizSubmit").hidden = i !== quizState.questions.length - 1;
  $("quizQuit").hidden = false;
}

function checkQuizAnswer() {
  const i = quizState.index, q = quizState.questions[i];
  if (quizState.answers[i] === true) return;
  const correct = gradeResponse(q, $("quizOptions"));
  if (correct === null) { toast("Enter or select an answer first."); return; }
  quizState.answers[i] = correct;
  const feedback = $("quizFeedback");
  feedback.hidden = false;
  feedback.className = `quiz-feedback ${correct ? "ok" : "bad"}`;
  if (correct) {
    quizState.firstTry[i] = true;
    quizState.score += 1;
    $("quizScoreLive").textContent = `Score: ${quizState.score}`;
    $("quizOptions").querySelectorAll("button, input").forEach(b => b.disabled = true);
    feedback.innerHTML = `<b>Correct — ${esc(answerText(q))}</b>${q.source === "ai" ? esc(q.explanation) : "Matches the supplied PDF answer key."} ${sourceLinks(q)}`;
    $("quizNext").hidden = i === quizState.questions.length - 1;
    $("quizSubmit").hidden = i !== quizState.questions.length - 1;
  } else {
    quizState.missed[i] = true;
    feedback.innerHTML = q.source === "ai" ? "<b>Not correct yet. Try again.</b>Select one answer." : "<b>Not correct yet. Try again.</b>For multiple-answer questions, select every correct option and no others.";
  }
}

$("quizNext").onclick = () => {
  if (quizState.index < quizState.questions.length - 1) {
    quizState.index += 1;
    renderQuestion();
  }
};

$("quizQuit").onclick = () => {
  if (!confirm("Quit the quiz? Your progress on this attempt will be lost.")) return;
  quizState.active = false;
  resetQuizPanels();
};

$("quizSubmit").onclick = async () => {
  const total = quizState.questions.length;
  const score = quizState.score;
  const percent = total ? Math.round((score / total) * 100) : 0;

  try {
    await api("/api/quiz/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player_name: quizState.name,
        topic: quizState.topic,
        difficulty: quizState.difficulty,
        score, total,
      }),
    });
  } catch (err) { toast(err.message); }

  showResult(score, total, percent);
  loadLeaderboard();
};

function showResult(score, total, percent) {
  $("quizRunPanel").hidden = true;
  $("quizSetupPanel").hidden = true;
  $("quizResultPanel").hidden = false;

  const cls = percent >= 70 ? "ok" : percent >= 40 ? "mid" : "bad";
  const verdict = percent >= 90 ? "Distinction"
    : percent >= 70 ? "Merit"
    : percent >= 40 ? "Pass"
    : "Needs revision";
  const grade = percent >= 90 ? "A+"
    : percent >= 80 ? "A"
    : percent >= 70 ? "B"
    : percent >= 60 ? "C"
    : percent >= 50 ? "D"
    : "F";

  const review = quizState.questions.map((q, i) => {
    const ok = answerText(q);
    const label = quizState.firstTry[i]
      ? (quizState.missed[i] ? "Correct after retry" : "Correct")
      : "Not correct";
    return `<div class="rr ${quizState.firstTry[i] ? "ok" : "bad"}">
      <b>${i + 1}. ${label}</b>
      ${esc(q.question)}
      <small>Correct answer: <b>${esc(ok)}</b></small>
    </div>`;
  }).join("");

  $("quizResult").innerHTML = `
    <div class="big ${cls}">${percent}%<span class="grade">${grade}</span></div>
    <div class="who"><b>${esc(quizState.name)}</b> scored ${score} / ${total}</div>
    <div class="sub">${verdict} · ${esc(quizState.topic)} · ${esc(quizState.difficulty)}</div>
    <div class="result-review">${review}</div>`;
}

$("quizRetry").onclick = () => {
  resetQuizPanels();
  quizState.active = false;
};

async function loadLeaderboard() {
  try {
    const rows = await api("/api/quiz/leaderboard?limit=10");
    if (!rows.length) {
      $("leaderboard").innerHTML = `<div class="empty">No scores yet — be the first!</div>`;
      return;
    }
    $("leaderboard").innerHTML = rows.map((r, i) => `
      <div class="leader-row ${i === 0 ? "top1" : i === 1 ? "top2" : i === 2 ? "top3" : ""}">
        <span class="rank">#${i + 1}</span>
        <div>
          <b>${esc(r.player_name)}</b>
          <small>${esc(r.topic)} · ${esc(r.difficulty)} · ${esc(r.created_at)}</small>
        </div>
        <span class="pct">${r.percent}% <small>(${r.score}/${r.total})</small></span>
      </div>`).join("");
  } catch (err) { toast(err.message); }
}
$("leaderRefresh").onclick = loadLeaderboard;

/* ------------------------------------------------------------------ */
/* Competitive Exam Questions                                         */
/* ------------------------------------------------------------------ */
async function loadConfig() {
  try {
    const cfg = await api("/api/config");
    const status = $("aiStatus");
    status.textContent = cfg.ai_available ? "AI: online" : "AI: offline";
    status.className = `chip ${cfg.ai_available ? "ok" : "off"}`;
    const chain = (cfg.ai_models || []).join(" → ");
    status.title = cfg.ai_available
      ? `Groq AI is available${chain ? ` · ${chain}` : ""}`
      : "AI unavailable - using built-in banks";

    applyProjectName(cfg.app);

    const examSel = $("examFilter");
    examSel.innerHTML = `<option value="all">All exams</option>` +
      (cfg.exam_names || []).map((e) => `<option>${esc(e)}</option>`).join("");

    const topicSel = $("examTopicFilter");
    topicSel.innerHTML = `<option value="all">All topics</option>` +
      (cfg.exam_topics || []).map((tp) => `<option>${esc(tp)}</option>`).join("");

    $("quizTopic").innerHTML = `<option value="all">All topics</option>` +
      (cfg.exam_topics || []).map(tp => `<option>${esc(tp)}</option>`).join("");
  } catch { /* non-fatal */ }
}

const examState = { questions: [] };
function renderExamCard(q, index) {
  return `<article class="exam-card" data-index="${index}">
    <div class="top"><span class="tag">${esc(q.tag)}</span><span class="exam-topic">${esc(q.topic)} · ${q.marks} mark${q.marks === 1 ? "" : "s"}</span></div>
    ${questionImages(q)}${sourceLinks(q)}
    <div class="gate-response">${answerControls(q, `exam-numeric-${index}`)}</div>
    ${q.answer_type !== "written" ? '<button class="btn btn-primary check-exam" type="button">Check answer</button>' : ''}
    <p class="exam-feedback" aria-live="polite"></p>
    <button class="secondary toggle-sol" type="button" aria-expanded="false">Show answer</button>
    <div class="exam-solution" hidden><b>Answer: ${esc(answerText(q))}</b><p>${esc(q.solution)}</p>${sourceLinks(q)}</div>
    </article>`;
}
function renderExamList(questions) {
  examState.questions = questions || [];
  $("examList").innerHTML = questions.length ? questions.map(renderExamCard).join("") : '<div class="empty">No questions found for that filter.</div>';
  $$("#examList .exam-card").forEach(card => {
    const q = questions[Number(card.dataset.index)];
    bindChoices(card);
    const check = card.querySelector(".check-exam");
    if (check) check.onclick = () => {
      const result = gradeResponse(q, card);
      const feedback = card.querySelector(".exam-feedback");
      feedback.textContent = result === null ? "Enter or select an answer first." : result ? "Correct — matches the supplied answer key." : "Not correct yet. Try again, or reveal the answer.";
      feedback.className = `exam-feedback ${result === true ? "correct" : ""}`;
    };
    card.querySelector(".toggle-sol").onclick = e => {
      const sol = card.querySelector(".exam-solution");
      sol.hidden = !sol.hidden;
      e.currentTarget.textContent = sol.hidden ? "Show answer" : "Hide answer";
      e.currentTarget.setAttribute("aria-expanded", String(!sol.hidden));
    };
  });
  refreshExportState();
}

$("examLoad").onclick = async () => {
  const exam = $("examFilter").value;
  const topic = $("examTopicFilter").value;
  const limit = $("examLimit").value;
  $("examLoad").disabled = true;
  $("examLoad").textContent = "Loading…";
  try {
    const data = await api(`/api/exam/questions?exam=${encodeURIComponent(exam)}&topic=${encodeURIComponent(topic)}&limit=${limit}`);
    renderExamList(data.questions || []);
    toast(`${(data.questions || []).length} question(s) loaded`);
  } catch (err) { toast(err.message); }
  finally { $("examLoad").disabled = false; $("examLoad").textContent = "Load Questions"; }
};

/* ------------------------------------------------------------------ */
/* Learn · Download · Help                                            */
/* ------------------------------------------------------------------ */

/* Hand a generated file to the browser. Nothing leaves the machine. */
function downloadFile(filename, text, mime) {
  const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const slugify = (s) => String(s || "schema").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "schema";
const isoDate = () => new Date().toISOString().slice(0, 10);

const csvCell = (v) => `"${String(v === null || v === undefined ? "" : v).replace(/"/g, '""')}"`;
const csvRow = (cells) => cells.map(csvCell).join(",");

/* --- report, in Markdown -------------------------------------------- */
function reviewMarkdown(x) {
  const sev = { error: "Error", warning: "Warning", suggestion: "Suggestion", passed: "Passed" };
  const out = [
    `# Schema review — ${x.schema_name}`,
    "",
    `- **Score:** ${x.score}/100`,
    `- **Reviewed:** ${x.created_at}`,
    `- **Tutor:** ${x.ai_used ? "online AI" : "built-in"}`,
    `- **Findings:** ${x.counts.errors} error(s), ${x.counts.warnings} warning(s), ${x.counts.suggestions} suggestion(s), ${x.counts.passed || 0} passed`,
    "",
    "## Tables",
    "",
  ];
  x.tables.forEach((t) => {
    out.push(`### ${t.name}`, "", "| Column | Type | Key |", "| --- | --- | --- |");
    t.columns.forEach((c) => {
      const key = t.primary_key.includes(c.name) ? "PK"
        : t.foreign_keys.some((f) => f.column === c.name) ? "FK" : "";
      out.push(`| ${c.name} | ${c.type} | ${key} |`);
    });
    out.push("");
  });
  if (x.relationships.length) {
    out.push("### Relationships", "");
    x.relationships.forEach((r) => out.push(`- \`${r.from}.${r.column}\` → \`${r.to}.${r.ref_column}\``));
    out.push("");
  }
  out.push("## Findings", "");
  if (!x.findings.length) out.push("_No findings recorded._", "");
  x.findings.forEach((f) => {
    out.push(`### ${sev[f.severity] || "Notice"} — ${f.title}`, "", f.message, "");
    if (f.fix) out.push(`**Fix:** ${f.fix}`, "");
  });
  out.push("## Tutor explanation", "", x.explanation || "_None._", "");
  return out.join("\n");
}

/* --- the current quiz attempt, plus the leaderboard ------------------ */
async function quizCsv() {
  const total = quizState.questions.length;
  const percent = total ? Math.round((quizState.score / total) * 100) : 0;
  const out = [
    `# Quiz attempt — ${quizState.name} · ${quizState.topic} · ${quizState.difficulty} · ${isoDate()}`,
    `# Score ${quizState.score}/${total} (${percent}%) · ${quizState.missed.filter(Boolean).length} answered only after a retry`,
    csvRow(["#", "question", "correct answer", "result"]),
  ];
  quizState.questions.forEach((q, i) => {
    out.push(csvRow([
      i + 1, q.question, answerText(q),
      quizState.firstTry[i]
        ? (quizState.missed[i] ? "correct after retry" : "correct on first try")
        : "not correct",
    ]));
  });
  out.push("", "# Leaderboard (top 10)", csvRow(["rank", "player", "topic", "difficulty", "score", "total", "percent", "when"]));
  try {
    const rows = await api("/api/quiz/leaderboard?limit=10");
    rows.forEach((r, i) => out.push(csvRow([
      i + 1, r.player_name, r.topic, r.difficulty, r.score, r.total, r.percent, r.created_at,
    ])));
  } catch {
    out.push(csvRow(["", "leaderboard unavailable", "", "", "", "", "", ""]));
  }
  return out.join("\r\n");
}

/* --- whatever is loaded in the Exam archive ------------------------- */
function examCsv() {
  const out = [csvRow([
    "#", "exam", "topic", "question", "option A", "option B", "option C", "option D",
    "answer", "citation", "source PDF", "answer key PDF", "question images", "solution URL",
  ])];
  examState.questions.forEach((q, i) => {
    const o = q.options || [];
    out.push(csvRow([
      i + 1, q.exam || "", q.topic || "", q.question,
      o[0] || "", o[1] || "", o[2] || "", o[3] || "",
      answerText(q), q.tag || "", new URL(q.source_url, location.origin).href, new URL(q.answer_key_url, location.origin).href, (q.images || []).map(u => new URL(u, location.origin).href).join(" | "), q.solution_url,
    ]));
  });
  return out.join("\r\n");
}

/* --- the twelve lessons, read back out of the document -------------- */
const cleanText = (el) => el.textContent.replace(/\s+/g, " ").trim();

function lessonsMarkdown() {
  const lessons = $$("#lessonList .lesson");
  const out = [
    `# ${projectName} — DBMS study guide`,
    "",
    `${lessons.length} lessons with worked examples, self-check questions and answers · exported ${isoDate()}`,
    "",
    "How to use it: read a lesson, answer its questions before reading the answers",
    "below them, then rebuild the example in the Table Designer and run it through",
    "the reviewer.",
    "",
    "---",
    "",
  ];
  lessons.forEach((d, i) => {
    const name = d.querySelector(".lesson-name").textContent.trim();
    const tag = d.querySelector(".lesson-tag").textContent.trim();
    out.push(`## ${i + 1}. ${name}${tag ? `  ·  _${tag}_` : ""}`, "");
    [...d.querySelector(".lesson-body").children].forEach((node) => {
      if (node.classList.contains("lesson-goal")) {
        out.push(`**Goal:** ${cleanText(node)}`, "");
      } else if (node.tagName === "P" && node.classList.contains("lesson-note")) {
        out.push(`> ${cleanText(node)}`, "");
      } else if (node.tagName === "P") {
        out.push(cleanText(node), "");
      } else if (node.classList.contains("lesson-points")) {
        node.querySelectorAll("li").forEach((li) => out.push(`- ${cleanText(li)}`));
        out.push("");
      } else if (node.classList.contains("lesson-sql")) {
        out.push("```sql", node.textContent.trim(), "```", "");
      } else if (node.classList.contains("lesson-checks")) {
        const checks = [...node.querySelectorAll(".check")];
        if (!checks.length) return;
        out.push("### Check yourself", "");
        checks.forEach((c, n) => {
          out.push(
            `**${n + 1}.** ${cleanText(c.querySelector("summary"))}`,
            "",
            `> ${cleanText(c.querySelector("p"))}`,
            "",
          );
        });
      }
    });
  });
  return out.join("\n");
}

const designerSql = () => designerTables.map(tableToSql).join("\n\n");

/* ------------------------------------------------------------------ */
/* Study material                                                      */
/* These documents are ready-made: they need nothing from the session  */
/* and are the same for every reader.                                  */
/* ------------------------------------------------------------------ */
function studyPackHeader(title, subtitle) {
  return [
    `# ${projectName} — ${title}`,
    "",
    subtitle,
    "",
    `Exported ${isoDate()} from ${projectName}.`,
    "",
    "---",
    "",
  ].join("\n");
}

function cheatSheetMarkdown() {
  return studyPackHeader(
    "DBMS cheat sheet",
    "Keys, functional dependencies, normal forms, joins, NULL rules, indexes and transactions — the whole subject on a few pages.",
  ) + [
    "## 1 · Keys",
    "",
    "| Term | Meaning |",
    "| --- | --- |",
    "| Superkey | Any column set that identifies a row |",
    "| Candidate key | A superkey with no removable column (minimal) |",
    "| Primary key | The candidate key you nominate — unique, never NULL |",
    "| Alternate key | A candidate key that is not the primary key |",
    "| Foreign key | A column holding another table's candidate key |",
    "",
    "## 2 · Functional dependencies",
    "",
    "- Write `X → Y` when one value of X gives at most one value of Y.",
    "- **Closure** `X⁺`: start with X; whenever some `A → B` has A inside the closure, add B.",
    "- `X⁺` covers every attribute ⇒ X is a **superkey**; minimal such X ⇒ **candidate key**.",
    "- **Armstrong:** reflexivity `X → subset(X)` · augmentation `X → Y` gives `XZ → YZ` · transitivity `X → Y, Y → Z` gives `X → Z`.",
    "- **Partial** dependency: needs only part of a composite key (breaks 2NF). **Transitive**: runs through a non-key column (breaks 3NF).",
    "",
    "## 3 · Normal forms",
    "",
    "| Form | Removes | Test |",
    "| --- | --- | --- |",
    "| 1NF | Repeating groups, non-atomic cells | One value per cell |",
    "| 2NF | Partial dependencies | No non-key column depends on part of the key |",
    "| 3NF | Transitive dependencies | For every `X → A`: X is a superkey, or A is prime |",
    "| BCNF | The remaining anomalies | Every determinant is a superkey |",
    "",
    "- Decompose R into R1, R2 only if `R1 ∩ R2` contains a candidate key of R1 or R2 (**lossless join**).",
    "- 3NF is always reachable losslessly *and* dependency-preserving; BCNF sometimes has to give up a dependency.",
    "",
    "## 4 · Joins",
    "",
    "| Join | Keeps |",
    "| --- | --- |",
    "| INNER | Matching rows from both sides only |",
    "| LEFT | Every left row; missing right columns become NULL |",
    "| RIGHT | Every right row; missing left columns become NULL |",
    "| FULL | Every row from both sides |",
    "| CROSS | Every pair — m × n rows |",
    "",
    "## 5 · NULL and three-valued logic",
    "",
    "- NULL means *unknown*: `NULL = NULL` is UNKNOWN, and `WHERE` keeps only TRUE.",
    "- Use `IS NULL` / `IS NOT NULL`; `x <> 5` silently drops the NULL rows.",
    "- `NOT IN` with a NULL in the list returns **no rows at all** — use `NOT EXISTS`.",
    "- `COUNT(*)` counts rows; `COUNT(col)` and `AVG(col)` skip NULLs; `SUM` over no rows is NULL.",
    "",
    "## 6 · Grouping",
    "",
    "- `WHERE` filters rows before grouping; `HAVING` filters groups afterwards — only HAVING may test an aggregate.",
    "- Every non-aggregated column in the select list must appear in `GROUP BY`.",
    "",
    "## 7 · Constraints",
    "",
    "`PRIMARY KEY` = `UNIQUE` + `NOT NULL` · `UNIQUE` permits NULLs (usually many) · `CHECK` is a per-row rule · `DEFAULT` is not a nullability rule.",
    "",
    "## 8 · Indexes and B+ trees",
    "",
    "- Keys are ordered; all data pointers live in the linked leaves; height ≈ 3–4 for millions of rows, so a lookup is a few page reads.",
    "- An index on `(a, b)` serves `a`, or `a` with `b` — never `b` alone (**left prefix rule**).",
    "- **Covering** index answers the query from the index alone; a **clustered** index sets the row order, and there is only one.",
    "- Every index costs space and slows writes; skip columns with few distinct values.",
    "",
    "## 9 · Transactions",
    "",
    "**ACID** — atomicity, consistency, isolation, durability.",
    "",
    "| Isolation level | Dirty read | Non-repeatable read | Phantom |",
    "| --- | --- | --- | --- |",
    "| READ UNCOMMITTED | possible | possible | possible |",
    "| READ COMMITTED | prevented | possible | possible |",
    "| REPEATABLE READ | prevented | prevented | possible * |",
    "| SERIALIZABLE | prevented | prevented | prevented |",
    "",
    "\\* as the SQL standard defines it; some engines prevent phantoms at REPEATABLE READ too.",
    "",
    "- Two-phase locking — take every lock before releasing any — guarantees serializable schedules, at the cost of blocking and possible deadlock.",
    "",
    "## 10 · Types and habits",
    "",
    "- Money is `DECIMAL(p, s)`, never `FLOAT`; time is `DATE` or `TIMESTAMP`; phone numbers and PINs are text.",
    "- One fact per column; `snake_case`; singular table names; `*_id` for keys; `is_` / `has_` for booleans.",
    "- Prefer a narrow surrogate key and keep the natural key as a `UNIQUE` column.",
    "",
  ].join("\n");
}

function glossaryMarkdown() {
  const terms = [
    ["ACID", "the four guarantees of a transaction: atomicity, consistency, isolation, durability"],
    ["aggregate function", "a function that collapses many rows into one value: COUNT, SUM, AVG, MIN, MAX"],
    ["alternate key", "a candidate key that is not the one chosen as primary"],
    ["anomaly", "a data fault caused by redundancy — insert, update or delete"],
    ["Armstrong's axioms", "reflexivity, augmentation and transitivity: sound and complete for deriving every implied dependency"],
    ["atomicity", "a transaction completes in full or has no effect at all"],
    ["attribute", "a column of a relation; a property of an entity"],
    ["B+ tree", "the usual index structure — ordered keys, data pointers in linked leaves, height O(log n)"],
    ["blocking", "one transaction waiting for a lock held by another"],
    ["candidate key", "a minimal superkey; any candidate key may become the primary key"],
    ["cardinality", "the number of rows in a relation; in ER terms, how many entities sit on each side of a relationship"],
    ["cascade", "a referential action that propagates a delete or update to the child rows"],
    ["CHECK", "a constraint over the values of a single row"],
    ["clustered index", "an index that fixes the physical order of the rows; a table has at most one"],
    ["commit", "the point at which a transaction's changes become permanent"],
    ["composite key", "a key made of more than one column"],
    ["concurrency", "several transactions interleaved — what isolation has to tame"],
    ["consistency", "a transaction moves the database from one valid state to another"],
    ["covering index", "an index holding every column a query needs, so the table is never read"],
    ["data independence", "changing the storage layer without changing the schemas above it"],
    ["deadlock", "two transactions each holding a lock the other wants; the engine breaks it by rolling one back"],
    ["decomposition", "splitting a relation into smaller relations; it must be lossless"],
    ["dependency preservation", "every original dependency still holds inside one of the decomposed relations"],
    ["determinant", "the left-hand side of a functional dependency"],
    ["dirty read", "reading data written by a transaction that has not committed"],
    ["domain", "the set of values an attribute is allowed to take"],
    ["durability", "committed changes survive a crash"],
    ["entity integrity", "the primary key is unique and never NULL"],
    ["ER model", "a diagram of entities, attributes and relationships, drawn before the tables"],
    ["foreign key", "a column, or set of columns, that references a candidate key of another table"],
    ["functional dependency", "X → Y: one value of X determines at most one value of Y"],
    ["HAVING", "the filter applied to groups after GROUP BY; WHERE can only filter rows"],
    ["index", "a sorted structure that speeds up lookups at the cost of writes and space"],
    ["isolation", "concurrent transactions never see each other's partial work"],
    ["junction table", "the table that resolves a many-to-many relationship, keyed by the pair of foreign keys"],
    ["lossless join", "a decomposition that joins back without inventing or losing rows"],
    ["normal form", "a level of normalisation: 1NF, 2NF, 3NF, BCNF, and beyond them 4NF and 5NF"],
    ["NULL", "the absence of a value; comparisons with it are UNKNOWN rather than TRUE"],
    ["phantom read", "seeing rows appear inside a range that was already read"],
    ["primary key", "the candidate key chosen to identify rows; unique and NOT NULL"],
    ["referential integrity", "every foreign key value matches an existing parent key, or is NULL"],
    ["relation", "a table: a set of tuples over named attributes"],
    ["rollback", "undoing a transaction's uncommitted changes"],
    ["schedule", "the interleaved order in which concurrent transactions run their operations"],
    ["selectivity", "how few rows a condition keeps; high selectivity is what earns an index"],
    ["serializable", "a schedule equivalent to running the transactions one after another"],
    ["superkey", "any set of columns that identifies a row"],
    ["three-valued logic", "TRUE, FALSE and UNKNOWN — and WHERE keeps only TRUE"],
    ["transaction", "a unit of work that commits or rolls back as a whole"],
    ["tuple", "a row of a relation"],
    ["two-phase locking", "taking every lock before releasing any, which guarantees serializable schedules"],
    ["view", "a stored query that behaves like a read-only table"],
    ["weak entity", "an entity that cannot be identified without its owner, so its key includes the owner's key"],
  ];
  return studyPackHeader(
    "DBMS glossary",
    `${terms.length} terms, defined one line at a time — the vocabulary examiners use.`,
  ) + terms.map(([term, meaning]) => `- **${term}** — ${meaning}.`).join("\n") + "\n";
}

function revisionMarkdown() {
  return studyPackHeader(
    "DBMS revision checklist",
    "Tick a box only when you can answer the question without notes. Each line points at the matching lesson in the tool.",
  ) + [
    "## Concepts",
    "",
    "- [ ] **The relational model** (lesson 1) — define relation, tuple, domain, and name the four kinds of key.",
    "- [ ] **Entity integrity** (lesson 1) — why is a primary key never NULL, and never optional?",
    "- [ ] **Foreign keys** (lesson 2) — what may a foreign key point at, and what do ON DELETE CASCADE, RESTRICT and SET NULL do?",
    "- [ ] **Constraints** (lesson 3) — when is UNIQUE not enough, and what can a CHECK not see?",
    "- [ ] **Functional dependencies** (lesson 4) — compute a closure and find a candidate key from a set of dependencies.",
    "- [ ] **1NF, 2NF, 3NF** (lesson 5) — spot a repeating group, a partial dependency and a transitive dependency.",
    "- [ ] **BCNF** (lesson 6) — state the definition, test a decomposition for losslessness, and explain the 3NF trade-off.",
    "- [ ] **ER to tables** (lesson 7) — place the key for 1:N, 1:1, M:N and a weak entity.",
    "- [ ] **Joins** (lesson 8) — say what each join keeps, and count the rows a CROSS join returns.",
    "- [ ] **NULL** (lesson 8) — three-valued logic, the NOT IN trap, and why COUNT(col) differs from COUNT(*).",
    "- [ ] **Grouping** (lesson 9) — WHERE versus HAVING, and which columns may appear in the select list.",
    "- [ ] **Indexes** (lesson 10) — the left-prefix rule, covering and clustered indexes, and when an index is wasted.",
    "- [ ] **Transactions** (lesson 11) — ACID, the three read anomalies, isolation levels, two-phase locking.",
    "- [ ] **Design hygiene** (lesson 12) — money, dates, phone numbers, naming, surrogate keys, audit columns.",
    "",
    "## Practice",
    "",
    "- [ ] Rebuild one lesson's schema from memory and score it in the reviewer without looking.",
    "- [ ] Break a schema on purpose in three different ways and predict the findings before pressing Review.",
    "- [ ] Pass a quiz at hard level with at least 80%, with no answer needing a second attempt.",
    "- [ ] Work through the practice paper without notes, then mark it with the answer key.",
    "- [ ] Explain out loud, in two minutes each, normalisation, NULL behaviour and ACID.",
    "",
    "## Before the exam",
    "",
    "- [ ] Export the study guide and the cheat sheet, and read them once on paper.",
    "- [ ] Check any bank question against the official paper — the bank is practice material, not a past paper.",
    "- [ ] Sleep. A schema you can draw from memory is worth more than one you can recognise.",
    "",
  ].join("\n");
}

async function practicePaperMarkdown() {
  let data = null;
  try {
    data = await api("/api/exam/questions?exam=all&topic=all&limit=100");
  } catch {
    return null;
  }
  const questions = (data && data.questions) || [];
  if (!questions.length) return null;
  const letters = ["A", "B", "C", "D", "E"];
  const out = [
    studyPackHeader(
      "DBMS practice paper",
      `${questions.length} GATE PYQs from the supplied PDFs, with the answer key at the end.`,
    ),
    "Work through Part 1 without notes, then mark yourself with Part 2. Each question",
    "uses original question images from the supplied GATE PDFs, with their answer keys.",
    "",
    "## Part 1 · Questions",
    "",
  ];
  questions.forEach((q, i) => {
    const tag = [q.exam, q.topic].filter(Boolean).join(" · ");
    out.push(`**${i + 1}.** ${q.question}${tag ? `  _(${tag})_` : ""}`, "");
    (q.images || []).forEach(url => out.push(`![Original question](${new URL(url, location.origin).href})`, ""));
    out.push(`[Source PDF](${new URL(q.source_url, location.origin).href})`, `[Worked solution](${q.solution_url})`);
    out.push("", "Answer: ______", "");
  });
  out.push("---", "", "## Part 2 · Answer key", "");
  questions.forEach((q, i) => {
    const letter = answerText(q);
    const parts = [`**${i + 1}.** ${letter}`];
    if (q.solution || q.explanation) parts.push(`— ${q.solution || q.explanation}`);
    if (q.tag) parts.push(`_${q.tag}_`);
    out.push(parts.join(" "), "");
  });
  return out.join("\n");
}


/* --- dispatch ------------------------------------------------------- */
const EXPORT_META = {
  "review-md": "review", "review-json": "review",
  "designer-sql": "designer", "quiz-csv": "quiz", "exam-csv": "exam",
  "lessons-md": "guide", "cheatsheet-md": "cheatsheet", "glossary-md": "glossary",
  "revision-md": "revision", "practice-md": "practice",
};
const EXPORTS = {
  "review-md": () => latest && {
    name: `schema-review-${slugify(latest.schema_name)}.md`,
    text: reviewMarkdown(latest), mime: "text/markdown;charset=utf-8",
  },
  "review-json": () => latest && {
    name: `schema-review-${slugify(latest.schema_name)}.json`,
    text: JSON.stringify(latest, null, 2), mime: "application/json;charset=utf-8",
  },
  "designer-sql": () => designerTables.length && {
    name: `schema-${isoDate()}.sql`,
    text: `-- Designed in ${projectName} · ${isoDate()}\n\n${designerSql()}\n`,
    mime: "application/sql;charset=utf-8",
  },
  "quiz-csv": async () => quizState.questions.length && {
    name: `quiz-${slugify(quizState.name)}-${isoDate()}.csv`,
    text: await quizCsv(), mime: "text/csv;charset=utf-8",
  },
  "exam-csv": () => examState.questions.length && {
    name: `exam-questions-${isoDate()}.csv`,
    text: examCsv(), mime: "text/csv;charset=utf-8",
  },
  "lessons-md": () => ({
    name: "dbms-study-guide.md",
    text: lessonsMarkdown(), mime: "text/markdown;charset=utf-8",
  }),
  "cheatsheet-md": () => ({
    name: "dbms-cheatsheet.md",
    text: cheatSheetMarkdown(), mime: "text/markdown;charset=utf-8",
  }),
  "glossary-md": () => ({
    name: "dbms-glossary.md",
    text: glossaryMarkdown(), mime: "text/markdown;charset=utf-8",
  }),
  "revision-md": () => ({
    name: "dbms-revision-checklist.md",
    text: revisionMarkdown(), mime: "text/markdown;charset=utf-8",
  }),
  "practice-md": async () => {
    const text = await practicePaperMarkdown();
    return text && {
      name: "dbms-practice-paper.md",
      text, mime: "text/markdown;charset=utf-8",
    };
  },
};

$$("[data-export]").forEach((btn) => {
  btn.onclick = async () => {
    const build = EXPORTS[btn.dataset.export];
    if (!build) return;
    const spec = await build();
    if (!spec) {
      toast(btn.dataset.export === "practice-md"
        ? "The question bank could not be reached — try again in a moment."
        : "There is nothing to export yet.");
      return;
    }
    downloadFile(spec.name, spec.text, spec.mime);
    toast(`${spec.name} saved`);
  };
});

/* Buttons grey out until there is something behind them. The study
   material is always ready; the results wait for a session. */
function refreshExportState() {
  const states = {
    review: latest
      ? [true, `${latest.score}/100 · ${latest.findings.length} finding(s)`]
      : [false, "Nothing yet — run a review first."],
    designer: designerTables.length
      ? [true, `${designerTables.length} table(s) ready`]
      : [false, "The designer is empty."],
    quiz: (! $("quizResultPanel").hidden && quizState.questions.length)
      ? [true, `${quizState.score}/${quizState.questions.length} · ${quizState.name}`]
      : [false, "No completed quiz yet."],
    exam: examState.questions.length
      ? [true, `${examState.questions.length} question(s) loaded`]
      : [false, "No questions loaded."],
    guide: [true, `${$$("#lessonList .lesson").length} lessons with answers.`],
    cheatsheet: [true, "One-page reference."],
    glossary: [true, "40+ terms defined."],
    revision: [true, "Tick-list ready."],
    practice: [true, "Worksheet and answer key."],
  };
  Object.entries(states).forEach(([key, [ready, text]]) => {
    $$(`[data-meta="${key}"]`).forEach((el) => {
      el.textContent = text;
      el.classList.toggle("is-ready", ready);
    });
    $$("[data-export]")
      .filter((b) => EXPORT_META[b.dataset.export] === key)
      .forEach((b) => { b.disabled = !ready; });
  });
}

/* --- lessons -------------------------------------------------------- */
$$("#lessonList .lesson-open").forEach((btn) => {
  btn.onclick = () => {
    const lesson = btn.closest(".lesson");
    const sql = lesson && lesson.querySelector(".lesson-sql");
    if (!sql) return;
    $("sqlInput").value = sql.textContent.trim();
    $("schemaName").value = lesson.querySelector(".lesson-name").textContent.trim();
    openTab("review");
    $("reviewBtn").click();
  };
});

const lessonToggleAll = $("lessonToggleAll");
if (lessonToggleAll) {
  lessonToggleAll.onclick = () => {
    const lessons = $$("#lessonList .lesson");
    const opening = lessons.some((d) => !d.open);
    lessons.forEach((d) => { d.open = opening; });
    lessonToggleAll.textContent = opening ? "Collapse all" : "Expand all";
  };
}

/* State only changes on the other sections, so refresh on arrival. */
const downloadTab = document.querySelector('#tabs .tab[data-tab="download"]');
if (downloadTab) downloadTab.addEventListener("click", refreshExportState);
refreshExportState();

/* ------------------------------------------------------------------ */
/* Boot                                                               */
/* ------------------------------------------------------------------ */
$("dtColumns").innerHTML = "";
addColumnRow({ name: "id", type: "INT", pk: true, nn: true });
renderDesigner();
loadConfig();
loadLeaderboard();

fetch("/static/gate/sources.json").then(r => r.json()).then(sources => {
  $("gatePdfDownloads").innerHTML = sources.map(s => `<a href="${esc(s.url)}" download>${esc(s.topic)} · ${s.count} selected</a>`).join("");
}).catch(() => { $("gatePdfDownloads").textContent = "PDF list unavailable. Reload to retry."; });
