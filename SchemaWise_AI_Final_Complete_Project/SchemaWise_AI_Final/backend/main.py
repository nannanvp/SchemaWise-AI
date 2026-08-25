from __future__ import annotations

import json
import re
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

BASE = Path(__file__).resolve().parent.parent
FRONTEND = BASE / "frontend"
DB = BASE / "backend" / "history.db"

app = FastAPI(title="SchemaWise AI")

class ReviewRequest(BaseModel):
    schema_name: str = "Untitled Schema"
    sql: str

def db():
    conn=sqlite3.connect(DB)
    conn.row_factory=sqlite3.Row
    return conn

with db() as conn:
    conn.execute("""
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
    """)

def clean(name:str)->str:
    return name.strip().strip('`"[]')

def split_top_level(text:str):
    parts=[]; cur=[]; depth=0; quote=None
    for ch in text:
        if quote:
            cur.append(ch)
            if ch==quote: quote=None
            continue
        if ch in "'\"`":
            quote=ch; cur.append(ch)
        elif ch=="(":
            depth+=1; cur.append(ch)
        elif ch==")":
            depth=max(0,depth-1); cur.append(ch)
        elif ch=="," and depth==0:
            s="".join(cur).strip()
            if s: parts.append(s)
            cur=[]
        else:
            cur.append(ch)
    s="".join(cur).strip()
    if s: parts.append(s)
    return parts

def parse_tables(sql:str):
    pattern=re.compile(r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`\"\[\]\w.]+)\s*\(",re.I)
    tables=[]
    for m in pattern.finditer(sql):
        name=clean(m.group(1).split(".")[-1])
        i=m.end(); depth=1; quote=None
        while i<len(sql) and depth:
            ch=sql[i]
            if quote:
                if ch==quote: quote=None
            else:
                if ch in "'\"`": quote=ch
                elif ch=="(": depth+=1
                elif ch==")": depth-=1
            i+=1
        if depth: continue

        body=sql[m.end():i-1]
        table={"name":name,"columns":[],"primary_key":[],"foreign_keys":[],"uniques":[]}

        for item in split_top_level(body):
            s=item.strip()
            pk=re.match(r"(?:CONSTRAINT\s+\w+\s+)?PRIMARY\s+KEY\s*\(([^)]+)\)",s,re.I)
            if pk:
                table["primary_key"] += [clean(x) for x in pk.group(1).split(",")]
                continue

            fk=re.match(
                r"(?:CONSTRAINT\s+\w+\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+([`\"\[\]\w.]+)\s*\(([^)]+)\)",
                s,re.I)
            if fk:
                cols=[clean(x) for x in fk.group(1).split(",")]
                rt=clean(fk.group(2).split(".")[-1])
                rcols=[clean(x) for x in fk.group(3).split(",")]
                for c,rc in zip(cols,rcols):
                    table["foreign_keys"].append({"column":c,"ref_table":rt,"ref_column":rc})
                continue

            uq=re.match(r"(?:CONSTRAINT\s+\w+\s+)?UNIQUE\s*\(([^)]+)\)",s,re.I)
            if uq:
                table["uniques"] += [clean(x) for x in uq.group(1).split(",")]
                continue

            cm=re.match(r"([`\"\[\]\w]+)\s+(.+)$",s,re.S)
            if not cm: continue

            cname=clean(cm.group(1))
            rest=cm.group(2).strip()
            tm=re.match(r"([A-Za-z]+(?:\s+[A-Za-z]+)?(?:\s*\([^)]*\))?)",rest)
            ctype=tm.group(1).strip() if tm else "UNKNOWN"
            up=rest.upper()

            col={
                "name":cname,
                "type":ctype,
                "not_null":"NOT NULL" in up,
                "unique":bool(re.search(r"\bUNIQUE\b",up)),
                "primary_key":"PRIMARY KEY" in up,
            }

            if col["primary_key"]: table["primary_key"].append(cname)
            if col["unique"]: table["uniques"].append(cname)

            inline=re.search(r"REFERENCES\s+([`\"\[\]\w.]+)\s*\(([^)]+)\)",rest,re.I)
            if inline:
                table["foreign_keys"].append({
                    "column":cname,
                    "ref_table":clean(inline.group(1).split(".")[-1]),
                    "ref_column":clean(inline.group(2).split(",")[0])
                })

            table["columns"].append(col)

        table["primary_key"]=list(dict.fromkeys(table["primary_key"]))
        table["uniques"]=list(dict.fromkeys(table["uniques"]))
        tables.append(table)
    return tables

def item(severity,title,message,table="",column="",fix=""):
    return {
        "severity":severity,
        "title":title,
        "message":message,
        "table":table,
        "column":column,
        "fix":fix
    }

def review_sql(sql:str):
    sql=sql.strip()
    if not sql:
        raise HTTPException(400,"Please enter SQL.")

    tables=parse_tables(sql)
    if not tables:
        raise HTTPException(400,"No CREATE TABLE statement detected.")

    names={t["name"].lower():t for t in tables}
    findings=[]
    reserved={"order","user","group","select","table","where","from","index","primary","key"}

    for t in tables:
        name=t["name"]

        if not t["primary_key"]:
            findings.append(item(
                "warning","Missing primary key",
                f"Table '{name}' has no primary key.",
                name,fix="Add a stable PRIMARY KEY column."
            ))
        else:
            findings.append(item(
                "passed","Primary key detected",
                f"Primary key: {', '.join(t['primary_key'])}.",name
            ))

        seen=set()
        for c in t["columns"]:
            cname=c["name"]
            low=cname.lower()

            if low in seen:
                findings.append(item("error","Duplicate column",f"'{cname}' appears more than once.",name,cname,"Remove or rename duplicate columns."))
            seen.add(low)

            if low in reserved:
                findings.append(item("warning","Reserved SQL word",f"'{cname}' can conflict with SQL syntax.",name,cname,"Rename the column."))

            if re.search(r"[A-Z\s-]",cname):
                findings.append(item("suggestion","Naming style",f"'{cname}' is not lower_snake_case.",name,cname,"Use a consistent lower_snake_case naming style."))

            if low in {"email","email_address","username","user_name"} and cname not in t["uniques"] and not c["unique"]:
                findings.append(item("suggestion","Consider UNIQUE",f"'{name}.{cname}' often should not contain duplicates.",name,cname,f"Consider adding UNIQUE to {cname}."))

            if low.endswith("_id") and not c["not_null"] and not c["primary_key"]:
                findings.append(item("suggestion","Nullable identifier",f"'{name}.{cname}' allows NULL.",name,cname,"Add NOT NULL if this relationship is mandatory."))

            vm=re.match(r"VARCHAR\s*\((\d+)\)",c["type"].upper())
            if vm and int(vm.group(1))>1000:
                findings.append(item("suggestion","Large VARCHAR",f"'{name}.{cname}' uses {c['type']}.",name,cname,"Use a smaller VARCHAR or an appropriate text type."))

        for fk in t["foreign_keys"]:
            ref=names.get(fk["ref_table"].lower())
            if not ref:
                findings.append(item("error","Invalid foreign key",f"{name}.{fk['column']} references missing table '{fk['ref_table']}'.",name,fk["column"],"Create or correct the referenced table."))
                continue

            refcols={c["name"].lower():c for c in ref["columns"]}
            if fk["ref_column"].lower() not in refcols:
                findings.append(item("error","Invalid referenced column",f"Referenced column '{fk['ref_table']}.{fk['ref_column']}' does not exist.",name,fk["column"],"Correct the referenced column."))
            else:
                findings.append(item("passed","Foreign key valid",f"{name}.{fk['column']} → {fk['ref_table']}.{fk['ref_column']}.",name,fk["column"]))

            findings.append(item("suggestion","Index foreign key",f"Joins may frequently use {name}.{fk['column']}.",name,fk["column"],f"Consider an index on {fk['column']}."))

        fkcols={f["column"].lower() for f in t["foreign_keys"]}
        for c in t["columns"]:
            if c["name"].lower().endswith("_id") and c["name"] not in t["primary_key"] and c["name"].lower() not in fkcols:
                guess=c["name"][:-3].lower()
                possible={guess,guess+"s",guess+"es"}
                if possible & set(names):
                    findings.append(item("warning","Possible missing foreign key",f"{name}.{c['name']} looks like a relationship column but has no FOREIGN KEY.",name,c["name"],"Add a FOREIGN KEY if it references another table."))

    weights={"error":18,"warning":10,"suggestion":3}
    score=max(0,100-sum(weights.get(f["severity"],0) for f in findings))

    counts={
        "errors":sum(f["severity"]=="error" for f in findings),
        "warnings":sum(f["severity"]=="warning" for f in findings),
        "suggestions":sum(f["severity"]=="suggestion" for f in findings),
        "passed":sum(f["severity"]=="passed" for f in findings)
    }

    relationships=[
        {"from":t["name"],"column":f["column"],"to":f["ref_table"],"ref_column":f["ref_column"]}
        for t in tables for f in t["foreign_keys"]
    ]

    problems=[f for f in findings if f["severity"]!="passed"]
    explanation=[
        f"Schema score: {score}/100.",
        f"Detected {counts['errors']} error(s), {counts['warnings']} warning(s), and {counts['suggestions']} suggestion(s).",
        "",
        "Main review:"
    ]

    if not problems:
        explanation.append("- No major issues were detected by the built-in checks.")
    else:
        order={"error":0,"warning":1,"suggestion":2}
        for f in sorted(problems,key=lambda x:order[x["severity"]])[:8]:
            explanation.append(f"- {f['title']}: {f['message']}")
            if f["fix"]:
                explanation.append(f"  Suggested fix: {f['fix']}")

    explanation += [
        "",
        "DBMS note:",
        "Normalization cannot always be fully confirmed from CREATE TABLE SQL alone because functional dependencies and business rules may not be provided."
    ]

    return {
        "score":score,
        "counts":counts,
        "tables":tables,
        "relationships":relationships,
        "findings":findings,
        "explanation":"\n".join(explanation),
        "ai_used":False
    }

@app.post("/api/review")
def review(req:ReviewRequest):
    result=review_sql(req.sql)
    now=datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    name=req.schema_name.strip() or "Untitled Schema"

    with db() as conn:
        cur=conn.execute("""
            INSERT INTO review_history
            (schema_name,sql_input,score,errors,warnings,suggestions,result_json,created_at)
            VALUES(?,?,?,?,?,?,?,?)
        """,(
            name,req.sql,result["score"],
            result["counts"]["errors"],
            result["counts"]["warnings"],
            result["counts"]["suggestions"],
            json.dumps(result),now
        ))
        rid=cur.lastrowid

    result.update({"review_id":rid,"created_at":now,"schema_name":name})
    return result

@app.get("/api/history")
def history():
    with db() as conn:
        rows=conn.execute("""
            SELECT id,schema_name,score,errors,warnings,suggestions,created_at
            FROM review_history ORDER BY id DESC LIMIT 50
        """).fetchall()
    return [dict(r) for r in rows]

@app.get("/api/history/{rid}")
def history_item(rid:int):
    with db() as conn:
        row=conn.execute("SELECT * FROM review_history WHERE id=?",(rid,)).fetchone()
    if not row:
        raise HTTPException(404,"Review not found")
    result=json.loads(row["result_json"])
    result.update({
        "review_id":row["id"],
        "schema_name":row["schema_name"],
        "created_at":row["created_at"],
        "sql":row["sql_input"]
    })
    return result

app.mount("/static",StaticFiles(directory=FRONTEND),name="static")

@app.get("/")
def home():
    return FileResponse(FRONTEND/"index.html")
