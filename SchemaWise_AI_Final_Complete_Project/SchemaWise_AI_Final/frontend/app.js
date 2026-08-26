const $ = id => document.getElementById(id);
let latest = null;

const samples = {
1:`CREATE TABLE department (
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
2:`CREATE TABLE student (
  student_name VARCHAR(100),
  email VARCHAR(100),
  department_id INT
);`,
3:`CREATE TABLE course (
  course_id INT PRIMARY KEY,
  course_name VARCHAR(120) NOT NULL,
  faculty_id INT,
  FOREIGN KEY (faculty_id) REFERENCES faculty(faculty_id)
);`,
4:`CREATE TABLE student_record (
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
5:`CREATE TABLE customer (
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
);`
};

$("sqlInput").value = samples[1];

document.querySelectorAll("[data-sample]").forEach(btn=>{
  btn.onclick=()=>{
    const n=btn.dataset.sample;
    $("sqlInput").value=samples[n];
    $("schemaName").value=["Correct Student Schema","Missing Primary Key","Invalid Foreign Key","Normalization Example","E-Commerce Schema"][n-1];
  };
});

function esc(value){
  return String(value ?? "").replace(/[&<>"']/g, m=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  })[m]);
}

function toast(msg){
  $("toast").textContent=msg;
  $("toast").classList.add("show");
  setTimeout(()=>$("toast").classList.remove("show"),2000);
}

function setSteps(active=-1, allDone=false){
  [...$("steps").children].forEach((el,i)=>{
    el.classList.remove("active","done");
    if(allDone || i<active) el.classList.add("done");
    else if(i===active) el.classList.add("active");
  });
}

async function animateSteps(){
  for(let i=0;i<6;i++){
    setSteps(i);
    await new Promise(r=>setTimeout(r,100));
  }
}

function render(data){
  latest=data;
  $("score").textContent=data.score+"/100";
  $("tableCount").textContent=data.tables.length;
  $("errorCount").textContent=data.counts.errors;
  $("warningCount").textContent=data.counts.warnings;
  $("suggestionCount").textContent=data.counts.suggestions;
  $("aiMode").textContent=data.ai_used ? "Online AI Tutor" : "Built-in AI Tutor";
  $("downloadBtn").disabled=false;

  $("visualization").classList.remove("empty");
  $("visualization").innerHTML=`
    <div class="table-grid">
      ${data.tables.map(t=>`
        <div class="db-table">
          <div class="db-name">${esc(t.name)}</div>
          ${t.columns.map(c=>`
            <div class="db-column">
              <span>${t.primary_key.includes(c.name) ? "🔑 " : ""}${esc(c.name)}</span>
              <span>${esc(c.type)}${t.foreign_keys.some(f=>f.column===c.name) ? " · FK" : ""}</span>
            </div>
          `).join("")}
        </div>
      `).join("")}
    </div>
    ${data.relationships.length ? `
      <div class="relationships">
        <h3>Relationships</h3>
        ${data.relationships.map(r=>`
          <div class="relationship">🔗 <b>${esc(r.from)}</b>.${esc(r.column)}
          → <b>${esc(r.to)}</b>.${esc(r.ref_column)}</div>
        `).join("")}
      </div>` : ""}
  `;

  const icons={error:"🔴",warning:"🟠",suggestion:"🔵",passed:"🟢"};
  $("findings").innerHTML=data.findings.map(f=>`
    <div class="finding ${f.severity}">
      <strong>${icons[f.severity] || "•"} ${esc(f.title)}</strong>
      <p>${esc(f.message)}</p>
      ${f.fix ? `<p><b>Fix:</b> ${esc(f.fix)}</p>` : ""}
    </div>
  `).join("");

  $("explanation").textContent=data.explanation;
  setSteps(-1,true);
}

async function fetchAiExplanation(sqlText, data) {
  document.getElementById("aiMode").textContent = "Checking AI Tutor…";
  try {
    const res = await fetch("/api/ai-explain", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ sql: sqlText, findings: data.findings, score: data.score })
    });
    const aiData = await res.json();
    document.getElementById("aiMode").textContent = aiData.ai_used ? "Online AI Tutor" : "Built-in AI Tutor";
    document.getElementById("explanation").textContent = aiData.explanation;
  } catch {
    document.getElementById("aiMode").textContent = "Built-in AI Tutor";
  }
}

$("reviewBtn").onclick=async()=>{
  const sql=$("sqlInput").value.trim();
  if(!sql){ toast("Enter SQL first."); return; }

  $("reviewBtn").disabled=true;
  $("reviewBtn").textContent="Reviewing...";
  $("explanation").textContent="Analysing schema...";
  await animateSteps();

  try{
    const res=await fetch("/api/review",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        schema_name:$("schemaName").value || "Untitled Schema",
        sql
      })
    });
    const data=await res.json();
    if(!res.ok) throw new Error(data.detail || "Review failed");
    render(data);
    toast("Review completed");
    fetchAiExplanation(sql, data);
  }catch(err){
    $("explanation").textContent=err.message;
    setSteps();
    toast(err.message);
  }finally{
    $("reviewBtn").disabled=false;
    $("reviewBtn").textContent="Review Schema";
  }
};

$("themeBtn").onclick=()=>{
  document.body.classList.toggle("dark");
  const dark=document.body.classList.contains("dark");
  $("themeBtn").textContent=dark ? "☀️ Light" : "🌙 Dark";
  localStorage.setItem("schema-theme",dark?"dark":"light");
};

if(localStorage.getItem("schema-theme")==="dark"){
  document.body.classList.add("dark");
  $("themeBtn").textContent="☀️ Light";
}

$("historyBtn").onclick=async()=>{
  $("historyDrawer").classList.add("open");
  const data=await (await fetch("/api/history")).json();
  $("historyList").innerHTML=data.length ? data.map(x=>`
    <div class="history-item" data-id="${x.id}">
      <b>${esc(x.schema_name)}</b> — ${x.score}/100
      <small>${esc(x.created_at)} · ${x.errors} error(s) · ${x.warnings} warning(s)</small>
    </div>
  `).join("") : `<div class="empty">No history yet.</div>`;

  document.querySelectorAll(".history-item").forEach(item=>{
    item.onclick=async()=>{
      const x=await (await fetch("/api/history/"+item.dataset.id)).json();
      $("schemaName").value=x.schema_name;
      $("sqlInput").value=x.sql;
      render(x);
      $("historyDrawer").classList.remove("open");
    };
  });
};

$("closeHistory").onclick=()=>$("historyDrawer").classList.remove("open");

$("downloadBtn").onclick=()=>{
  if(!latest) return;
  const report=`AI-Based Schema Reviewer Report

Schema: ${latest.schema_name}
Date: ${latest.created_at}
Score: ${latest.score}/100

Errors: ${latest.counts.errors}
Warnings: ${latest.counts.warnings}
Suggestions: ${latest.counts.suggestions}

FINDINGS
========
${latest.findings.map(f=>`${f.severity.toUpperCase()}: ${f.title}
${f.message}
${f.fix ? "Fix: "+f.fix : ""}`).join("\n\n")}

EXPLANATION
===========
${latest.explanation}
`;
  const blob=new Blob([report],{type:"text/plain"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="schema-review-report.txt";
  a.click();
  URL.revokeObjectURL(a.href);
};
