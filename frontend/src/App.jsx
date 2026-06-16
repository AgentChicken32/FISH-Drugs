import { useState, useEffect, useRef, useCallback } from "react";

const API_BASE = "http://localhost:8000";

const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400&family=Syne:wght@400;500;600;700;800&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:       #0d0f14;
    --surface:  #13161e;
    --border:   #222635;
    --accent:   #4ade80;
    --blue:     #60a5fa;
    --warn:     #fb923c;
    --danger:   #f87171;
    --purple:   #c084fc;
    --muted:    #6b7280;
    --text:     #e5e7eb;
    --subtext:  #9ca3af;
    --radius:   6px;
    --mono:     'DM Mono', monospace;
    --sans:     'Syne', sans-serif;
  }

  body { background: var(--bg); color: var(--text); font-family: var(--sans); min-height: 100vh; }

  .app { max-width: 860px; margin: 0 auto; padding: 48px 24px 80px; }

  .header { margin-bottom: 48px; }
  .header h1 { font-size: 2rem; font-weight: 800; letter-spacing: -0.03em; line-height: 1.1; color: #fff; }
  .header h1 span { color: var(--accent); }
  .header p { margin-top: 8px; color: var(--subtext); font-size: 0.875rem; font-family: var(--mono); }
  .header-status {
    display: inline-flex; align-items: center; gap: 6px;
    font-family: var(--mono); font-size: 0.7rem; color: var(--muted);
    margin-top: 14px; border: 1px solid var(--border); border-radius: 99px; padding: 4px 12px;
  }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); }
  .dot.online { background: var(--accent); box-shadow: 0 0 8px var(--accent); }

  .input-area {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 12px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
    transition: border-color 0.15s; position: relative;
  }
  .input-area:focus-within { border-color: var(--accent); }

  .tag {
    display: inline-flex; align-items: center; gap: 6px;
    background: #1a2e1a; border: 1px solid #2d5a2d; color: var(--accent);
    font-family: var(--mono); font-size: 0.75rem; border-radius: 4px; padding: 4px 8px;
    animation: tagIn 0.15s ease;
  }
  @keyframes tagIn { from { transform: scale(0.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  .tag button {
    background: none; border: none; cursor: pointer; color: #4b7c4b;
    font-size: 0.9rem; line-height: 1; padding: 0; display: flex; align-items: center;
    transition: color 0.1s;
  }
  .tag button:hover { color: var(--accent); }

  .search-input {
    background: none; border: none; outline: none; color: var(--text);
    font-family: var(--mono); font-size: 0.875rem; min-width: 180px; flex: 1;
  }
  .search-input::placeholder { color: var(--muted); }

  .dropdown {
    position: absolute; top: calc(100% + 4px); left: 0; right: 0;
    background: #191c26; border: 1px solid var(--border); border-radius: var(--radius);
    z-index: 100; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  }
  .dropdown-item {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 14px; cursor: pointer; transition: background 0.1s; font-size: 0.875rem;
  }
  .dropdown-item:hover, .dropdown-item.active { background: #222635; }
  .dropdown-item .drug-name { font-weight: 600; }
  .dropdown-item .drug-id { font-family: var(--mono); font-size: 0.7rem; color: var(--muted); }

  .actions { display: flex; gap: 10px; margin-top: 14px; align-items: center; }
  .btn {
    font-family: var(--sans); font-weight: 600; font-size: 0.8rem;
    letter-spacing: 0.06em; text-transform: uppercase; border: none;
    border-radius: var(--radius); padding: 10px 20px; cursor: pointer; transition: all 0.15s;
  }
  .btn-primary { background: var(--accent); color: #0a1a0a; }
  .btn-primary:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); }
  .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-ghost { background: transparent; color: var(--muted); border: 1px solid var(--border); }
  .btn-ghost:hover { color: var(--text); border-color: var(--muted); }

  .hint { font-family: var(--mono); font-size: 0.7rem; color: var(--muted); margin-left: auto; }

  .results { margin-top: 36px; animation: fadeUp 0.3s ease; }
  @keyframes fadeUp { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

  .results-header {
    display: flex; justify-content: space-between; align-items: baseline;
    margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid var(--border);
  }
  .results-header h2 { font-size: 0.7rem; font-weight: 500; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }

  .score-banner { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 24px; }
  .score-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 20px; }
  .score-card.primary { border-color: var(--accent); background: #0d1f0d; }
  .score-card label { font-family: var(--sans); font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--subtext); display: block; margin-bottom: 10px; }
  .score-card .value { font-family: var(--mono); font-size: 1.75rem; font-weight: 500; line-height: 1; color: var(--accent); letter-spacing: -0.02em; }
  .score-card.primary .value { font-size: 2.2rem; }
  .score-card .value.warn { color: var(--warn); }
  .score-card .sub { font-family: var(--sans); font-size: 0.72rem; font-weight: 500; color: var(--muted); margin-top: 6px; }

  .section-title {
    font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em;
    color: var(--muted); margin: 28px 0 14px; padding-bottom: 8px; border-bottom: 1px solid var(--border);
  }

  .data-table { width: 100%; border-collapse: collapse; }
  .data-table th {
    font-family: var(--mono); font-size: 0.65rem; text-transform: uppercase;
    letter-spacing: 0.1em; color: var(--muted); text-align: left;
    padding: 8px 12px; border-bottom: 1px solid var(--border);
  }
  .data-table th.right { text-align: right; }
  .data-table td { padding: 11px 12px; border-bottom: 1px solid var(--border); font-size: 0.875rem; }
  .data-table tr:last-child td { border-bottom: none; }
  .data-table tr:hover td { background: #15181f; }

  .drug-id-cell { font-family: var(--mono); font-size: 0.75rem; color: var(--muted); }
  .drug-name-cell { font-weight: 600; }
  .no-data { font-family: var(--mono); font-size: 0.75rem; color: var(--muted); font-style: italic; }

  .bar-wrap { display: flex; align-items: center; gap: 10px; justify-content: flex-end; }
  .bar { width: 80px; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 2px; transition: width 0.4s ease; }
  .bar-label { font-family: var(--mono); font-size: 0.8rem; min-width: 44px; text-align: right; }

  .pair-names { display: flex; align-items: center; gap: 8px; font-weight: 600; }
  .pair-sep { color: var(--muted); font-size: 0.75rem; font-weight: 400; }

  .replacements-grid { display: flex; flex-direction: column; gap: 20px; }

  .replacement-group {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); overflow: hidden;
  }
  .replacement-group-header {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 16px; background: #0f1218; border-bottom: 1px solid var(--border);
  }
  .replacement-group-header .drug-label { font-weight: 700; font-size: 0.9rem; color: var(--text); }
  .replacement-group-header .drug-id-badge {
    font-family: var(--mono); font-size: 0.68rem; color: var(--muted);
    background: var(--border); border-radius: 3px; padding: 2px 6px;
  }
  .replacement-group-header .count-badge {
    margin-left: auto; font-family: var(--mono); font-size: 0.68rem;
    color: var(--blue); background: #0d1a2e; border: 1px solid #1e3a5f;
    border-radius: 99px; padding: 2px 8px;
  }
  .no-replacements {
    padding: 14px 16px; font-family: var(--mono); font-size: 0.75rem;
    color: var(--muted); font-style: italic;
  }

  .repl-table { width: 100%; border-collapse: collapse; }
  .repl-table th {
    font-family: var(--mono); font-size: 0.62rem; text-transform: uppercase;
    letter-spacing: 0.09em; color: var(--muted); text-align: left;
    padding: 7px 16px; border-bottom: 1px solid var(--border); background: #0f1218;
  }
  .repl-table th.right { text-align: right; }
  .repl-table td { padding: 10px 16px; border-bottom: 1px solid var(--border); font-size: 0.85rem; }
  .repl-table tr:last-child td { border-bottom: none; }
  .repl-table tr:hover td { background: #15181f; }
  .repl-name { font-weight: 600; }
  .repl-id { font-family: var(--mono); font-size: 0.7rem; color: var(--muted); }
  .repl-count { font-family: var(--mono); font-size: 0.8rem; color: var(--subtext); text-align: right; }
  .repl-score-cell { text-align: right; white-space: nowrap; }

  .mech-badge {
    display: inline-block; font-family: var(--mono); font-size: 0.65rem;
    background: #0d1a2e; border: 1px solid #1e3a5f;
    color: var(--blue); border-radius: 4px; padding: 2px 7px; white-space: nowrap;
  }

  /* ---- Drug row with popup buttons ---- */
  .drug-row-buttons {
    display: flex; gap: 6px; align-items: center;
  }
  .btn-pill {
    font-family: var(--mono); font-size: 0.62rem; font-weight: 500;
    border: 1px solid; border-radius: 99px; padding: 2px 9px;
    cursor: pointer; transition: all 0.15s; background: transparent;
    white-space: nowrap;
  }
  .btn-pill.food {
    color: var(--warn); border-color: #7a4512;
  }
  .btn-pill.food:hover, .btn-pill.food.active {
    background: #2a1a08; border-color: var(--warn);
  }
  .btn-pill.disease {
    color: var(--purple); border-color: #5a2a7a;
  }
  .btn-pill.disease:hover, .btn-pill.disease.active {
    background: #1e0f2e; border-color: var(--purple);
  }
  .btn-pill.none-badge {
    color: var(--muted); border-color: var(--border); cursor: default; opacity: 0.5;
  }

  /* ---- Modal / popup overlay ---- */
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.65);
    display: flex; align-items: center; justify-content: center;
    z-index: 500; animation: fadeIn 0.15s ease;
    padding: 24px;
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

  .modal {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 10px; width: 100%; max-width: 620px;
    max-height: 80vh; display: flex; flex-direction: column;
    box-shadow: 0 24px 80px rgba(0,0,0,0.7);
    animation: slideUp 0.2s ease;
  }
  @keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

  .modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px; border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .modal-title { display: flex; align-items: center; gap: 10px; }
  .modal-title h3 { font-size: 0.95rem; font-weight: 700; color: var(--text); }
  .modal-title .modal-drug-id {
    font-family: var(--mono); font-size: 0.68rem; color: var(--muted);
    background: var(--border); border-radius: 3px; padding: 2px 6px;
  }
  .modal-close {
    background: none; border: none; color: var(--muted); font-size: 1.2rem;
    cursor: pointer; line-height: 1; padding: 4px; transition: color 0.1s;
  }
  .modal-close:hover { color: var(--text); }

  .modal-body {
    overflow-y: auto; flex: 1; padding: 0;
  }

  /* Food items inside modal */
  .modal-food-item {
    padding: 14px 20px; border-bottom: 1px solid var(--border);
  }
  .modal-food-item:last-child { border-bottom: none; }
  .modal-item-header {
    display: flex; align-items: center; justify-content: space-between;
    gap: 10px; margin-bottom: 6px;
  }
  .modal-item-name { font-weight: 600; font-size: 0.9rem; text-transform: capitalize; }
  .severity-badge {
    font-family: var(--mono); font-size: 0.65rem; letter-spacing: 0.04em;
    border: 1px solid currentColor; border-radius: 99px; padding: 2px 8px; white-space: nowrap;
  }
  .modal-item-desc { font-size: 0.8rem; color: var(--subtext); line-height: 1.5; margin-bottom: 5px; }
  .modal-item-mgmt { font-size: 0.8rem; color: var(--text); line-height: 1.5; }
  .modal-item-mgmt strong {
    color: var(--blue); font-weight: 600; text-transform: uppercase;
    font-size: 0.65rem; letter-spacing: 0.06em; margin-right: 6px;
  }

  /* Disease items inside modal */
  .modal-disease-item {
    padding: 14px 20px; border-bottom: 1px solid var(--border);
  }
  .modal-disease-item:last-child { border-bottom: none; }
  .modal-disease-text { font-size: 0.8rem; color: var(--subtext); line-height: 1.55; }

  .modal-empty {
    padding: 32px 20px; font-family: var(--mono); font-size: 0.8rem;
    color: var(--muted); text-align: center; font-style: italic;
  }

  .unknown-box {
    margin-top: 16px; background: #1f1210; border: 1px solid #4a1a1a;
    border-radius: var(--radius); padding: 12px 16px;
    font-family: var(--mono); font-size: 0.75rem; color: var(--danger);
  }
  .unknown-box strong { display: block; margin-bottom: 4px; }

  .error-box {
    background: #1f1210; border: 1px solid #4a1a1a; border-radius: var(--radius);
    padding: 16px 20px; font-family: var(--mono); font-size: 0.8rem; color: var(--danger); margin-top: 24px;
  }
  .loading { display: flex; align-items: center; gap: 10px; font-family: var(--mono); font-size: 0.8rem; color: var(--muted); margin-top: 24px; }
  .spinner {
    width: 16px; height: 16px; border: 2px solid var(--border);
    border-top-color: var(--accent); border-radius: 50%; animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
`;

function riskColor(val, max) {
  const r = max > 0 ? val / max : 0;
  return r < 0.33 ? "#4ade80" : r < 0.66 ? "#fb923c" : "#f87171";
}

function scoreColor(s) {
  return s >= 0.66 ? "#4ade80" : s >= 0.33 ? "#fb923c" : "#f87171";
}

function severityColor(sev) {
  if (sev >= 4) return "#f87171";
  if (sev >= 3) return "#fb923c";
  return "#4ade80";
}

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// Modal component
function InteractionModal({ drug, type, foodData, diseaseData, onClose }) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const isFood = type === "food";
  const items = isFood ? (foodData?.foods ?? []) : (diseaseData?.diseases ?? []);
  const accentColor = isFood ? "var(--warn)" : "var(--purple)";
  const title = isFood ? "Food Interactions" : "Disease Interactions";

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">
            <span style={{ fontSize: "1rem" }}>{isFood ? "🍽️" : "🩺"}</span>
            <h3 style={{ color: accentColor }}>{title}</h3>
            <span style={{ fontWeight: 700, color: "var(--text)" }}>{drug.name}</span>
            <span className="modal-drug-id">{drug.id}</span>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">
          {items.length === 0 ? (
            <p className="modal-empty">No known {isFood ? "food" : "disease"} interactions for this drug.</p>
          ) : isFood ? (
            items.map((f, i) => (
              <div key={i} className="modal-food-item">
                <div className="modal-item-header">
                  <span className="modal-item-name">{f.food_name}</span>
                  <span className="severity-badge" style={{ color: severityColor(f.severity) }}>
                    Severity {f.severity}/5
                  </span>
                </div>
                {f.description && <p className="modal-item-desc">{f.description}</p>}
                {f.management && (
                  <p className="modal-item-mgmt"><strong>Management</strong>{f.management}</p>
                )}
              </div>
            ))
          ) : (
            items.map((d, i) => (
              <div key={i} className="modal-disease-item">
                <div className="modal-item-header">
                  <span className="modal-item-name">{d.disease_name}</span>
                  <span className="severity-badge" style={{ color: severityColor(d.severity) }}>
                    Severity {d.severity}/5
                  </span>
                </div>
                {d.text && <p className="modal-disease-text">{d.text}</p>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [drugs, setDrugs]         = useState([]);
  const [query, setQuery]         = useState("");
  const [suggestions, setSuggs]   = useState([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [result, setResult]       = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [online, setOnline]       = useState(null);
  const [dbCount, setDbCount]     = useState(null);

  // Modal state: { drug: {id, name}, type: 'food'|'disease' } or null
  const [modal, setModal] = useState(null);

  const inputRef     = useRef(null);
  const inputAreaRef = useRef(null);
  const debouncedQ   = useDebounce(query, 200);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      fetch(`${API_BASE}/health`)
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(d => { if (!cancelled) { setOnline(true); setDbCount(d.interactions); } })
        .catch(() => { if (!cancelled) { setOnline(false); setTimeout(check, 3000); } });
    };
    check();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (debouncedQ.length < 2) { setSuggs([]); return; }
    fetch(`${API_BASE}/search?q=${encodeURIComponent(debouncedQ)}&limit=8`)
      .then(r => r.json())
      .then(data => { setSuggs(data.filter(s => !drugs.some(d => d.id === s.id))); setActiveIdx(-1); })
      .catch(() => setSuggs([]));
  }, [debouncedQ, drugs]);

  const addDrug = useCallback((drug) => {
    if (drugs.some(d => d.id === drug.id)) return;
    setDrugs(prev => [...prev, drug]);
    setQuery(""); setSuggs([]); setResult(null);
    inputRef.current?.focus();
  }, [drugs]);

  const removeDrug = id => { setDrugs(prev => prev.filter(d => d.id !== id)); setResult(null); };

  const handleKeyDown = e => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, -1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx >= 0 && suggestions[activeIdx]) addDrug(suggestions[activeIdx]);
      else if (query.trim()) addDrug({ id: query.trim(), name: query.trim() });
    }
    else if (e.key === "Backspace" && query === "" && drugs.length) removeDrug(drugs[drugs.length - 1].id);
  };

  const calculate = async () => {
    if (!drugs.length) return;
    setLoading(true); setError(null); setResult(null); setModal(null);
    try {
      const res = await fetch(`${API_BASE}/regime/risk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drug_ids: drugs.map(d => d.id) }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setResult(await res.json());
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const handleMouseDown = (e) => {
      if (inputAreaRef.current && !inputAreaRef.current.contains(e.target)) {
        setSuggs([]);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  const clear = () => { setDrugs([]); setResult(null); setError(null); setQuery(""); setModal(null); };

  const maxRisk = result ? Math.max(...result.drugs.map(d => d.risk), 0.001) : 1;

  // Build lookup maps from result for modal
  const foodMap    = result ? Object.fromEntries(result.food_interactions?.map(g => [g.drug_id, g]) ?? []) : {};
  const diseaseMap = result ? Object.fromEntries(result.disease_interactions?.map(g => [g.drug_id, g]) ?? []) : {};

  const openModal = (drug, type) => setModal({ drug, type });
  const closeModal = () => setModal(null);

  return (
    <>
      <style>{css}</style>
      <div className="app">
        <div className="header">
          <h1>Drug Regime<br /><span>Risk Scorer</span></h1>
          <p>Add drugs to a regime and assess interaction risk</p>
          <div className="header-status">
            <span className={`dot${online ? " online" : ""}`} />
            {online === null ? "connecting…"
              : online ? `${dbCount?.toLocaleString() ?? "…"} interactions loaded`
              : "backend offline — start uvicorn on :8000"}
          </div>
        </div>

        <div className="input-area" ref={inputAreaRef} onClick={() => inputRef.current?.focus()}>
          {drugs.map(d => (
            <span key={d.id} className="tag">
              {d.name}
              <button onClick={e => { e.stopPropagation(); removeDrug(d.id); }} aria-label="remove">✕</button>
            </span>
          ))}
          <input
            ref={inputRef}
            className="search-input"
            placeholder={drugs.length ? "Add another drug…" : "Search by drug name or ID…"}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
          />
          {suggestions.length > 0 && (
            <div className="dropdown">
              {suggestions.map((s, i) => (
                <div key={s.id} className={`dropdown-item${i === activeIdx ? " active" : ""}`} onMouseDown={() => addDrug(s)}>
                  <span className="drug-name">{s.name}</span>
                  <span className="drug-id">{s.id}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="actions">
          <button className="btn btn-primary" onClick={calculate} disabled={!drugs.length || loading}>
            {loading ? "Calculating…" : "Calculate Risk"}
          </button>
          {(drugs.length > 0 || result) && <button className="btn btn-ghost" onClick={clear}>Clear</button>}
          <span className="hint">
            {drugs.length === 0 ? "Add ≥ 1 drug" : `${drugs.length} drug${drugs.length > 1 ? "s" : ""} in regime`}
          </span>
        </div>

        {loading && <div className="loading"><div className="spinner" />Scoring {drugs.length} drug{drugs.length > 1 ? "s" : ""}…</div>}
        {error && <div className="error-box">⚠ {error}</div>}

        {result && (
          <div className="results">
            <div className="results-header"><h2>Results</h2></div>

            {/* Summary cards */}
            <div className="score-banner">
              <div className="score-card primary">
                <label>Regime Risk</label>
                <div className="value">{result.normalized_risk.toFixed(3)}</div>
                <div className="sub">avg drug risk · {result.drugs.length} drugs</div>
              </div>
              <div className="score-card">
                <label>DB Coverage</label>
                <div className={`value${result.coverage_pct < 30 ? " warn" : ""}`}>{result.coverage_pct}%</div>
                <div className="sub">{result.populated_edges} / {result.possible_edges} pairs</div>
              </div>
              <div className="score-card">
                <label>Drugs Scored</label>
                <div className="value">{result.drugs.length}</div>
                <div className="sub">{result.unknown_drugs.length} unrecognised</div>
              </div>
            </div>

            {/* Individual drug risk with food/disease buttons */}
            <p className="section-title">Individual Drug Risk</p>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Drug</th>
                  <th>ID</th>
                  <th>Interactions</th>
                  <th className="right">Risk (avg strength)</th>
                </tr>
              </thead>
              <tbody>
                {result.drugs.map(d => {
                  const foodCount    = foodMap[d.id]?.foods?.length ?? 0;
                  const diseaseCount = diseaseMap[d.id]?.diseases?.length ?? 0;
                  return (
                    <tr key={d.id}>
                      <td className="drug-name-cell">{d.name}</td>
                      <td className="drug-id-cell">{d.id}</td>
                      <td>
                        <div className="drug-row-buttons">
                          {foodCount > 0 ? (
                            <button
                              className={`btn-pill food${modal?.drug.id === d.id && modal?.type === "food" ? " active" : ""}`}
                              onClick={() => openModal(d, "food")}
                            >
                              🍽 {foodCount} food
                            </button>
                          ) : (
                            <span className="btn-pill none-badge">🍽 none</span>
                          )}
                          {diseaseCount > 0 ? (
                            <button
                              className={`btn-pill disease${modal?.drug.id === d.id && modal?.type === "disease" ? " active" : ""}`}
                              onClick={() => openModal(d, "disease")}
                            >
                              🩺 {diseaseCount} disease
                            </button>
                          ) : (
                            <span className="btn-pill none-badge">🩺 none</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="bar-wrap">
                          <div className="bar">
                            <div className="bar-fill" style={{ width: `${(d.risk / maxRisk) * 100}%`, background: riskColor(d.risk, maxRisk) }} />
                          </div>
                          {d.avg_strength !== null ? d.risk.toFixed(4) : <span className="no-data">no data</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pairwise matching scores */}
            {result.pair_scores?.length > 0 && (
              <>
                <p className="section-title">Pairwise Matching Scores</p>
                <table className="data-table">
                  <thead>
                    <tr><th>Drug Pair</th><th>Mechanism</th><th className="right">Matching Score</th></tr>
                  </thead>
                  <tbody>
                    {result.pair_scores.map((ps, i) => {
                      const s = ps.score;
                      const color = s !== null ? scoreColor(s) : "var(--muted)";
                      return (
                        <tr key={i}>
                          <td>
                            <div className="pair-names">
                              <span>{ps.drug_a_name}</span>
                              <span className="pair-sep">↔</span>
                              <span>{ps.drug_b_name}</span>
                            </div>
                          </td>
                          <td>
                            {ps.mechanism
                              ? <span className="mech-badge">{ps.mechanism}</span>
                              : <span className="no-data">—</span>}
                          </td>
                          <td className="repl-score-cell">
                            {s !== null ? (
                              <div className="bar-wrap">
                                <div className="bar">
                                  <div className="bar-fill" style={{ width: `${s * 100}%`, background: color }} />
                                </div>
                                <span className="bar-label" style={{ color }}>{(s * 100).toFixed(1)}%</span>
                              </div>
                            ) : <span className="no-data">no data</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}

            {/* Similar replacement suggestions */}
            {result.similar_replacements?.length > 0 && (
              <>
                <p className="section-title">Similar Drug Replacements <span style={{color:"var(--blue)",marginLeft:6,fontSize:"0.65rem",fontFamily:"var(--mono)"}}>matching score &gt; 90%</span></p>
                <div className="replacements-grid">
                  {result.similar_replacements.map(group => (
                    <div key={group.drug_id} className="replacement-group">
                      <div className="replacement-group-header">
                        <span className="drug-label">{group.drug_name}</span>
                        <span className="drug-id-badge">{group.drug_id}</span>
                        {group.replacements.length > 0
                          ? <span className="count-badge">{group.replacements.length} similar drug{group.replacements.length !== 1 ? "s" : ""}</span>
                          : <span className="count-badge" style={{color:"var(--muted)",borderColor:"var(--border)",background:"transparent"}}>none found</span>
                        }
                      </div>
                      {group.replacements.length === 0 ? (
                        <p className="no-replacements">No drugs outside the regime exceed the 90% similarity threshold.</p>
                      ) : (
                        <table className="repl-table">
                          <thead>
                            <tr>
                              <th>Replacement Drug</th>
                              <th>ID</th>
                              <th className="right">Interactions (original: {group.original_interaction_count.toLocaleString()})</th>
                              <th className="right">Match Score</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.replacements.map(r => (
                              <tr key={r.id}>
                                <td className="repl-name">{r.name}</td>
                                <td className="repl-id">{r.id}</td>
                                <td className="repl-count">{r.interaction_count.toLocaleString()}</td>
                                <td className="repl-score-cell">
                                  <div className="bar-wrap">
                                    <div className="bar" style={{width:50}}>
                                      <div className="bar-fill" style={{ width: `${r.score * 100}%`, background: scoreColor(r.score) }} />
                                    </div>
                                    <span className="bar-label" style={{ color: scoreColor(r.score) }}>{(r.score * 100).toFixed(1)}%</span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {result.unknown_drugs.length > 0 && (
              <div className="unknown-box">
                <strong>⚠ Not found in database:</strong>
                {result.unknown_drugs.join(", ")}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <InteractionModal
          drug={modal.drug}
          type={modal.type}
          foodData={foodMap[modal.drug.id]}
          diseaseData={diseaseMap[modal.drug.id]}
          onClose={closeModal}
        />
      )}
    </>
  );
}
