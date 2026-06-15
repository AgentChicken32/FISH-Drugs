# Drug Interaction Risk Scorer

## Project Structure

```
drug-risk/
├── backend/
│   ├── main.py            # FastAPI app
│   ├── requirements.txt
│   ├── interactions.csv   # ← drug-drug interaction CSV (or set DRUG_CSV env var)
│   ├── drug_food.csv      # ← drug-food interaction CSV (or set FOOD_CSV env var)
│   └── drug_disease.csv   # ← drug-disease interaction CSV (or set DISEASE_CSV env var)
└── frontend/
    └── App.jsx            # React frontend
```

---

## CSV Format

### Drug-drug interactions

Each row must have **5 columns** (header row is auto-detected and skipped):

```
drug_a_id, drug_a_name, drug_b_id, drug_b_name, interaction_strength
```

Example:
```
D001,Warfarin,D002,Aspirin,0.85
D001,Warfarin,D003,Ibuprofen,0.72
```

- `interaction_strength` is a numeric value (any scale you use consistently).
- Rows with non-numeric strength or fewer than 5 columns are silently skipped.
- The DB is **rebuilt from the CSV on every server start**.

### Drug-food interactions

A CSV with a header row and the following columns:

```
Severity level, Food name, Description, Management, Mechanism, References, drug_id
```

- `Severity level` must be an integer (1–5). Rows where it isn't a valid
  integer (e.g. `"No matching records"`) are skipped.
- `drug_id` should match the drug ID values used in the interactions CSV
  (e.g. `DDInter1075`).
- `References` is read but not currently surfaced by the API.
- The table is rebuilt from this CSV on every server start. If the file is
  missing, food-interaction lookups simply return empty results.

### Drug-disease interactions

A CSV with a header row and the following columns:

```
Severity level, Disease name, Text, drug_id
```

- `Severity level` must be an integer (1–5). Rows where it isn't a valid
  integer (e.g. `"No matching records"`) are skipped.
- `drug_id` should match the drug ID values used in the interactions CSV
  (e.g. `DDInter1075`).
- `Text` describes the risk/contraindication for that disease.
- The table is rebuilt from this CSV on every server start. If the file is
  missing, disease-interaction lookups simply return empty results.

---

## Backend Setup

```bash
cd backend
pip install -r requirements.txt

# Put your CSVs in backend/, OR set env vars:
export DRUG_CSV=/path/to/your/interactions.csv
export FOOD_CSV=/path/to/your/drug_food.csv

uvicorn main:app --reload --port 8000
```

The server will print how many interactions and food interactions were
loaded, then be ready at `http://localhost:8000`.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Returns interaction count |
| GET | `/search?q=warfarin` | Autocomplete drug search |
| POST | `/regime/risk` | Calculate regime risk |

#### POST `/regime/risk`

**Request:**
```json
{ "drug_ids": ["D001", "D002", "D003"] }
```
Drug IDs **or** drug names are accepted (case-insensitive).

**Response (abridged):**
```json
{
  "drugs": [
    { "id": "D001", "name": "Warfarin", "avg_strength": 0.785, "risk": 0.785 },
    { "id": "D002", "name": "Aspirin",  "avg_strength": 0.61,  "risk": 0.61  }
  ],
  "total_risk": 1.395,
  "normalized_risk": 0.6975,
  "populated_edges": 1,
  "possible_edges": 1,
  "coverage_pct": 100.0,
  "unknown_drugs": [],
  "pair_scores": [ ... ],
  "similar_replacements": [ ... ],
  "food_interactions": [
    {
      "drug_id": "D001",
      "drug_name": "Warfarin",
      "foods": [
        {
          "food_name": "leafy greens",
          "severity": 3,
          "description": "Vitamin K-rich foods can reduce the anticoagulant effect of warfarin",
          "management": "Maintain consistent vitamin K intake; avoid sudden changes",
          "mechanism": "Pharmacodynamic"
        }
      ]
    }
  ]
}
```

---

## Risk Model

- **Drug risk** = average interaction strength of that drug across **all** its entries in the database (both as drug_a and drug_b).
- **Regime risk** = sum of individual drug risks.
- **Coverage** = % of unique drug pairs in the regime that have at least one recorded interaction entry.

Drugs with no entries in the database contribute **0** to regime risk and are flagged with `avg_strength: null`.

### Food interactions

For every drug in the regime, the API looks up any known drug-food
interactions and returns them sorted by severity (highest first). Each
entry includes the food name, a severity score (1–5), a description of the
interaction, the recommended management/mitigation, and the underlying
mechanism (e.g. absorption, metabolism). Drugs with no known food
interactions return an empty `foods` list.

### Disease interactions

For every drug in the regime, the API also looks up any known
drug-disease (contraindication) warnings and returns them sorted by
severity (highest first). Each entry includes the disease/condition name,
a severity score (1–5), and a text description of the risk. Drugs with no
known disease interactions return an empty `diseases` list.

---

## Frontend Setup

The frontend is a single React JSX file (`frontend/App.jsx`). You can:

1. Drop it into any Vite/CRA project, **or**
2. Paste it directly into Claude's artifact runner for a live preview.

Set the `API_BASE` constant at the top of the file if your backend runs on a different port.

---

## Performance Notes

- SQLite with indexes on both drug ID columns handles 200k+ rows in milliseconds for typical queries.
- The DB file is written to `interactions.db` next to where you run the server (override with `DRUG_DB` env var).
- For very large CSVs the build step batches inserts in chunks of 10,000 rows.
- If you outgrow SQLite, swapping to PostgreSQL requires only changing the connection string and driver.
