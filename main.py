"""
Drug Interaction Risk Scorer — FastAPI Backend
Rebuilds SQLite DB from CSV on startup, then serves regime risk queries.
"""

import csv
import itertools
import os
import sqlite3
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

CSV_PATH = os.environ.get("DRUG_CSV", "interactions.csv")
DB_PATH = os.environ.get("DRUG_DB", "interactions.db")

# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def build_database(csv_path: str, db_path: str) -> None:
    """Drop and rebuild the interactions DB from a CSV file.

    Expected CSV columns (no header required, but supported):
        drug_a_id, drug_a_name, drug_b_id, drug_b_name, interaction_strength
    """
    if not Path(csv_path).exists():
        print(f"[warn] CSV not found at '{csv_path}' — starting with empty DB.", file=sys.stderr)
        _init_schema(db_path)
        return

    conn = sqlite3.connect(db_path)
    try:
        _init_schema(db_path, conn=conn)
        cur = conn.cursor()

        with open(csv_path, newline="", encoding="utf-8") as f:
            reader = csv.reader(f)
            first = next(reader, None)
            # Detect header row
            if first and not _is_data_row(first):
                rows = reader
            else:
                rows = itertools.chain([first], reader) if first else reader

            batch = []
            for row in rows:
                if len(row) < 5:
                    continue
                drug_a_id, drug_a_name, drug_b_id, drug_b_name, strength = row[:5]
                try:
                    strength_f = float(strength)
                except ValueError:
                    continue
                batch.append((
                    drug_a_id.strip(), drug_a_name.strip(),
                    drug_b_id.strip(), drug_b_name.strip(),
                    strength_f,
                ))
                if len(batch) >= 10_000:
                    cur.executemany(_INSERT_SQL, batch)
                    batch.clear()

            if batch:
                cur.executemany(_INSERT_SQL, batch)

        conn.commit()
        count = conn.execute("SELECT COUNT(*) FROM interactions").fetchone()[0]
        print(f"[info] Loaded {count:,} interactions into '{db_path}'.")
    finally:
        conn.close()


def _is_data_row(row: list[str]) -> bool:
    try:
        float(row[4])
        return True
    except (ValueError, IndexError):
        return False


_SCHEMA = """
CREATE TABLE IF NOT EXISTS interactions (
    drug_a_id   TEXT NOT NULL,
    drug_a_name TEXT NOT NULL,
    drug_b_id   TEXT NOT NULL,
    drug_b_name TEXT NOT NULL,
    strength    REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_a ON interactions(drug_a_id);
CREATE INDEX IF NOT EXISTS idx_b ON interactions(drug_b_id);
"""

_INSERT_SQL = """
INSERT INTO interactions (drug_a_id, drug_a_name, drug_b_id, drug_b_name, strength)
VALUES (?, ?, ?, ?, ?)
"""


def _init_schema(db_path: str, conn: sqlite3.Connection | None = None) -> None:
    close = conn is None
    if close:
        conn = sqlite3.connect(db_path)
    conn.executescript("DROP TABLE IF EXISTS interactions;" + _SCHEMA)
    conn.commit()
    if close:
        conn.close()


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ---------------------------------------------------------------------------
# Risk calculation
# ---------------------------------------------------------------------------

def drug_avg_strength(conn: sqlite3.Connection, drug_id: str) -> float | None:
    """Average interaction strength for a drug across all its recorded pairs."""
    row = conn.execute(
        """
        SELECT AVG(strength) AS avg_s
        FROM interactions
        WHERE drug_a_id = ? OR drug_b_id = ?
        """,
        (drug_id, drug_id),
    ).fetchone()
    return row["avg_s"]  # None if no rows


def pair_has_interaction(conn: sqlite3.Connection, id_a: str, id_b: str) -> bool:
    row = conn.execute(
        """
        SELECT 1 FROM interactions
        WHERE (drug_a_id = ? AND drug_b_id = ?)
           OR (drug_a_id = ? AND drug_b_id = ?)
        LIMIT 1
        """,
        (id_a, id_b, id_b, id_a),
    ).fetchone()
    return row is not None


def resolve_drug(conn: sqlite3.Connection, query: str) -> dict | None:
    """Find a drug by ID or name (case-insensitive). Returns {id, name} or None."""
    row = conn.execute(
        """
        SELECT drug_a_id AS id, drug_a_name AS name FROM interactions
        WHERE LOWER(drug_a_id) = LOWER(?) OR LOWER(drug_a_name) = LOWER(?)
        LIMIT 1
        """,
        (query, query),
    ).fetchone()
    if row:
        return dict(row)
    row = conn.execute(
        """
        SELECT drug_b_id AS id, drug_b_name AS name FROM interactions
        WHERE LOWER(drug_b_id) = LOWER(?) OR LOWER(drug_b_name) = LOWER(?)
        LIMIT 1
        """,
        (query, query),
    ).fetchone()
    return dict(row) if row else None


def search_drugs(conn: sqlite3.Connection, query: str, limit: int = 10) -> list[dict]:
    """Search drugs by partial name or ID match."""
    pattern = f"%{query}%"
    rows = conn.execute(
        """
        SELECT DISTINCT drug_a_id AS id, drug_a_name AS name FROM interactions
        WHERE LOWER(drug_a_name) LIKE LOWER(?) OR LOWER(drug_a_id) LIKE LOWER(?)
        UNION
        SELECT DISTINCT drug_b_id AS id, drug_b_name AS name FROM interactions
        WHERE LOWER(drug_b_name) LIKE LOWER(?) OR LOWER(drug_b_id) LIKE LOWER(?)
        LIMIT ?
        """,
        (pattern, pattern, pattern, pattern, limit),
    ).fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    build_database(CSV_PATH, DB_PATH)
    yield


app = FastAPI(title="Drug Interaction Risk Scorer", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class RegimeRequest(BaseModel):
    drug_ids: list[str]  # list of drug IDs or names


class DrugRisk(BaseModel):
    id: str
    name: str
    avg_strength: float | None
    risk: float  # same as avg_strength, None treated as 0


class RegimeResponse(BaseModel):
    drugs: list[DrugRisk]
    total_risk: float
    populated_edges: int
    possible_edges: int
    coverage_pct: float
    unknown_drugs: list[str]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    with get_conn() as conn:
        count = conn.execute("SELECT COUNT(*) FROM interactions").fetchone()[0]
    return {"status": "ok", "interactions": count}


@app.get("/search")
def search(q: str, limit: int = 10):
    if len(q) < 2:
        return []
    with get_conn() as conn:
        return search_drugs(conn, q, limit)


@app.post("/regime/risk", response_model=RegimeResponse)
def regime_risk(req: RegimeRequest):
    if not req.drug_ids:
        raise HTTPException(status_code=400, detail="drug_ids must not be empty")

    conn = get_conn()
    try:
        resolved: list[dict] = []
        unknown: list[str] = []

        for q in req.drug_ids:
            drug = resolve_drug(conn, q)
            if drug:
                # Avoid duplicates
                if not any(d["id"] == drug["id"] for d in resolved):
                    resolved.append(drug)
            else:
                unknown.append(q)

        drug_risks: list[DrugRisk] = []
        for drug in resolved:
            avg = drug_avg_strength(conn, drug["id"])
            risk_val = avg if avg is not None else 0.0
            drug_risks.append(DrugRisk(
                id=drug["id"],
                name=drug["name"],
                avg_strength=avg,
                risk=risk_val,
            ))

        total_risk = sum(d.risk for d in drug_risks)

        # Coverage: check all unique pairs
        ids = [d.id for d in drug_risks]
        pairs = list(itertools.combinations(ids, 2))
        possible = len(pairs)
        populated = sum(1 for a, b in pairs if pair_has_interaction(conn, a, b))
        coverage = (populated / possible * 100) if possible > 0 else 0.0

        return RegimeResponse(
            drugs=drug_risks,
            total_risk=total_risk,
            populated_edges=populated,
            possible_edges=possible,
            coverage_pct=round(coverage, 1),
            unknown_drugs=unknown,
        )
    finally:
        conn.close()
