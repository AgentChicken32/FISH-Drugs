"""
Drug Interaction Risk Scorer — FastAPI Backend
Rebuilds SQLite DB from CSV on startup, then serves regime risk queries.
Computes and persists pairwise drug matching scores on first run.
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

CSV_PATH          = os.environ.get("DRUG_CSV",           "interactions.csv")
FOOD_CSV_PATH     = os.environ.get("FOOD_CSV",           "drug_food.csv")
DB_PATH           = os.environ.get("DRUG_DB",            "interactions.db")
SIMILARITY_CUTOFF = float(os.environ.get("SIM_CUTOFF",   "0.90"))

# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def build_database(csv_path: str, db_path: str) -> None:
    """Drop and rebuild the interactions DB from a CSV file."""
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

_MATCHING_SCHEMA = """
CREATE TABLE IF NOT EXISTS matching_scores (
    drug_a_id TEXT NOT NULL,
    drug_b_id TEXT NOT NULL,
    score     REAL NOT NULL,
    PRIMARY KEY (drug_a_id, drug_b_id)
);
CREATE INDEX IF NOT EXISTS idx_ms_a ON matching_scores(drug_a_id);
CREATE INDEX IF NOT EXISTS idx_ms_b ON matching_scores(drug_b_id);
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
# Drug-food interaction loading
# ---------------------------------------------------------------------------

_FOOD_SCHEMA = """
CREATE TABLE IF NOT EXISTS food_interactions (
    drug_id     TEXT NOT NULL,
    food_name   TEXT NOT NULL,
    severity    INTEGER NOT NULL,
    description TEXT NOT NULL,
    management  TEXT NOT NULL,
    mechanism   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_food_drug ON food_interactions(drug_id);
"""

_FOOD_INSERT_SQL = """
INSERT INTO food_interactions (drug_id, food_name, severity, description, management, mechanism)
VALUES (?, ?, ?, ?, ?, ?)
"""


def build_food_database(csv_path: str, db_path: str) -> None:
    """
    Load drug-food interactions from CSV into the food_interactions table.
    Rows whose 'Severity level' is not a valid integer (e.g. "No matching
    records") are skipped. Drops and rebuilds the table on every run.
    """
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript("DROP TABLE IF EXISTS food_interactions;" + _FOOD_SCHEMA)
        conn.commit()

        if not Path(csv_path).exists():
            print(f"[warn] Food CSV not found at '{csv_path}' — food interactions disabled.", file=sys.stderr)
            return

        cur = conn.cursor()
        with open(csv_path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            batch = []
            skipped = 0
            for row in reader:
                sev_raw = (row.get("Severity level") or "").strip()
                try:
                    severity = int(sev_raw)
                except ValueError:
                    skipped += 1
                    continue
                drug_id = (row.get("drug_id") or "").strip()
                if not drug_id:
                    continue
                batch.append((
                    drug_id,
                    (row.get("Food name") or "").strip(),
                    severity,
                    (row.get("Description") or "").strip(),
                    (row.get("Management") or "").strip(),
                    (row.get("Mechanism") or "").strip(),
                ))
            if batch:
                cur.executemany(_FOOD_INSERT_SQL, batch)

        conn.commit()
        count = conn.execute("SELECT COUNT(*) FROM food_interactions").fetchone()[0]
        print(f"[info] Loaded {count:,} drug-food interactions into '{db_path}' ({skipped:,} rows skipped).")
    finally:
        conn.close()


def get_food_interactions(conn: sqlite3.Connection, drug_id: str) -> list[dict]:
    rows = conn.execute(
        """
        SELECT food_name, severity, description, management, mechanism
        FROM food_interactions
        WHERE drug_id = ?
        ORDER BY severity DESC, food_name ASC
        """,
        (drug_id,),
    ).fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Matching score computation
# ---------------------------------------------------------------------------

def build_matching_scores(db_path: str) -> None:
    """
    Compute Sørensen-Dice matching scores for every pair of drugs and persist
    them into matching_scores.  Skipped if the table already has rows.

    Score(A, B) = 2 * |neighbors(A) ∩ neighbors(B)| / (|neighbors(A)| + |neighbors(B)|)
    """
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(_MATCHING_SCHEMA)
        conn.commit()

        existing = conn.execute("SELECT COUNT(*) FROM matching_scores").fetchone()[0]
        if existing > 0:
            print(f"[info] Matching scores already present ({existing:,} rows) — skipping rebuild.")
            return

        print("[info] Building matching score lookup table…")

        rows = conn.execute(
            """
            SELECT drug_a_id AS id, drug_b_id AS neighbor FROM interactions
            UNION ALL
            SELECT drug_b_id AS id, drug_a_id AS neighbor FROM interactions
            """
        ).fetchall()

        neighbors: dict[str, set[str]] = {}
        for row in rows:
            drug_id, neighbor = row[0], row[1]
            if drug_id not in neighbors:
                neighbors[drug_id] = set()
            neighbors[drug_id].add(neighbor)

        drugs = list(neighbors.keys())
        total_pairs = len(drugs) * (len(drugs) - 1) // 2
        print(f"[info] {len(drugs):,} drugs → {total_pairs:,} pairs to score.")

        batch = []
        BATCH_SIZE = 50_000

        for drug_a, drug_b in itertools.combinations(drugs, 2):
            na = neighbors[drug_a]
            nb = neighbors[drug_b]
            denom = len(na) + len(nb)
            score = (2 * len(na & nb) / denom) if denom > 0 else 0.0
            batch.append((drug_a, drug_b, score))
            batch.append((drug_b, drug_a, score))
            if len(batch) >= BATCH_SIZE:
                conn.executemany(
                    "INSERT OR IGNORE INTO matching_scores VALUES (?, ?, ?)", batch
                )
                conn.commit()
                batch.clear()

        if batch:
            conn.executemany(
                "INSERT OR IGNORE INTO matching_scores VALUES (?, ?, ?)", batch
            )
            conn.commit()

        final = conn.execute("SELECT COUNT(*) FROM matching_scores").fetchone()[0]
        print(f"[info] Matching score table built: {final:,} rows.")
    finally:
        conn.close()


def get_matching_score(conn: sqlite3.Connection, id_a: str, id_b: str) -> float | None:
    row = conn.execute(
        "SELECT score FROM matching_scores WHERE drug_a_id = ? AND drug_b_id = ?",
        (id_a, id_b),
    ).fetchone()
    if row:
        return row["score"]
    row = conn.execute(
        "SELECT score FROM matching_scores WHERE drug_a_id = ? AND drug_b_id = ?",
        (id_b, id_a),
    ).fetchone()
    return row["score"] if row else None


# ---------------------------------------------------------------------------
# Similarity-based replacement suggestions
# ---------------------------------------------------------------------------

def find_similar_replacements(
    conn: sqlite3.Connection,
    drug_id: str,
    regime_ids: set[str],
    cutoff: float = SIMILARITY_CUTOFF,
) -> list[dict]:
    """
    Return all drugs outside the regime whose matching score with `drug_id`
    is >= cutoff, sorted by their total interaction count (descending).

    Each result dict: {id, name, score, interaction_count}
    """
    rows = conn.execute(
        """
        SELECT
            ms.drug_b_id  AS id,
            ms.score      AS score,
            (
                SELECT COUNT(*)
                FROM interactions i
                WHERE i.drug_a_id = ms.drug_b_id OR i.drug_b_id = ms.drug_b_id
            ) AS interaction_count
        FROM matching_scores ms
        WHERE ms.drug_a_id = ?
          AND ms.score >= ?
        ORDER BY interaction_count DESC
        """,
        (drug_id, cutoff),
    ).fetchall()

    regime_set = regime_ids  # already a set
    results = []
    for row in rows:
        cand_id = row["id"]
        if cand_id in regime_set:
            continue
        # Resolve the candidate's display name
        name_row = conn.execute(
            """
            SELECT COALESCE(
                MAX(CASE WHEN drug_a_id = ? THEN drug_a_name END),
                MAX(CASE WHEN drug_b_id = ? THEN drug_b_name END)
            ) AS name
            FROM interactions
            WHERE drug_a_id = ? OR drug_b_id = ?
            """,
            (cand_id, cand_id, cand_id, cand_id),
        ).fetchone()
        name = name_row["name"] if name_row else cand_id
        results.append({
            "id":                cand_id,
            "name":              name,
            "score":             row["score"],
            "interaction_count": row["interaction_count"],
        })

    return results


# ---------------------------------------------------------------------------
# Risk calculation helpers
# ---------------------------------------------------------------------------

def drug_avg_strength(conn: sqlite3.Connection, drug_id: str) -> float | None:
    row = conn.execute(
        """
        SELECT AVG(strength) AS avg_s
        FROM interactions
        WHERE drug_a_id = ? OR drug_b_id = ?
        """,
        (drug_id, drug_id),
    ).fetchone()
    return row["avg_s"]


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
    build_matching_scores(DB_PATH)
    build_food_database(FOOD_CSV_PATH, DB_PATH)
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
    drug_ids: list[str]


class DrugRisk(BaseModel):
    id: str
    name: str
    avg_strength: float | None
    risk: float


class PairScore(BaseModel):
    drug_a_id:   str
    drug_a_name: str
    drug_b_id:   str
    drug_b_name: str
    score:       float | None


class ReplacementCandidate(BaseModel):
    id:                str
    name:              str
    score:             float   # matching score vs the original drug
    interaction_count: int     # total interactions in the DB


class DrugReplacements(BaseModel):
    drug_id:      str
    drug_name:    str
    replacements: list[ReplacementCandidate]   # sorted by interaction_count desc


class FoodInteraction(BaseModel):
    food_name:   str
    severity:    int     # 1 (lowest) – 5 (highest)
    description: str
    management:  str
    mechanism:   str


class DrugFoodInteractions(BaseModel):
    drug_id:   str
    drug_name: str
    foods:     list[FoodInteraction]   # sorted by severity desc


class RegimeResponse(BaseModel):
    drugs: list[DrugRisk]
    total_risk: float
    normalized_risk: float
    populated_edges: int
    possible_edges: int
    coverage_pct: float
    unknown_drugs: list[str]
    pair_scores: list[PairScore]
    similar_replacements: list[DrugReplacements]   # ← new
    food_interactions: list[DrugFoodInteractions]  # ← new


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
        n = len(drug_risks)
        normalized_risk = total_risk / n if n > 0 else 0.0

        ids   = [d.id   for d in drug_risks]
        names = {d.id: d.name for d in drug_risks}
        regime_set = set(ids)
        pairs = list(itertools.combinations(ids, 2))
        possible  = len(pairs)
        populated = sum(1 for a, b in pairs if pair_has_interaction(conn, a, b))
        coverage  = (populated / possible * 100) if possible > 0 else 0.0

        # Pairwise matching scores within the regime
        pair_scores: list[PairScore] = []
        for id_a, id_b in pairs:
            score = get_matching_score(conn, id_a, id_b)
            pair_scores.append(PairScore(
                drug_a_id=id_a,
                drug_a_name=names[id_a],
                drug_b_id=id_b,
                drug_b_name=names[id_b],
                score=score,
            ))

        # Similar-drug replacement suggestions (outside the regime)
        similar_replacements: list[DrugReplacements] = []
        for drug in resolved:
            candidates = find_similar_replacements(conn, drug["id"], regime_set)
            similar_replacements.append(DrugReplacements(
                drug_id=drug["id"],
                drug_name=drug["name"],
                replacements=[
                    ReplacementCandidate(**c) for c in candidates
                ],
            ))

        # Drug-food interaction warnings
        food_interactions: list[DrugFoodInteractions] = []
        for drug in resolved:
            foods = get_food_interactions(conn, drug["id"])
            food_interactions.append(DrugFoodInteractions(
                drug_id=drug["id"],
                drug_name=drug["name"],
                foods=[FoodInteraction(**f) for f in foods],
            ))

        return RegimeResponse(
            drugs=drug_risks,
            total_risk=total_risk,
            normalized_risk=round(normalized_risk, 6),
            populated_edges=populated,
            possible_edges=possible,
            coverage_pct=round(coverage, 1),
            unknown_drugs=unknown,
            pair_scores=pair_scores,
            similar_replacements=similar_replacements,
            food_interactions=food_interactions,
        )
    finally:
        conn.close()