// Facility: the recycling facility signs its own measurement of a pickup.
import { html, api, short, spring, Icon, Card, useState, motion, AnimatePresence, animate } from "./lib.js";

export function FacilityTab({ state, refresh }) {
  const waiting = state.batches.filter((b) => b.status === "Committed");
  const [sel, setSel] = useState(""); const [pct, setPct] = useState("36"); const [out, setOut] = useState(null);
  const current = waiting.find((b) => b.batchId === sel) || waiting[0];
  const tol = (state.deployment?.toleranceBps || 1000) / 100; const bin = current?.binPct ?? 0; const fac = Number(pct) || 0;
  const report = async () => { if (!current) return;
    try { const r = await api(`/api/facility/${current.batchId}`, { contaminationPct: Number(pct) }); setOut({ ...r, n: current.number }); }
    catch (e) { setOut({ status: "Refused", error: e.message }); } refresh(); };
  const x = (v) => `${Math.max(0, Math.min(100, v))}%`;
  return html`<div className="grid">
    <${Card} i=${0}><h2>Recycling facility audit</h2><p className="hint">The facility samples the load and signs its own measurement with its own key.</p>
      <label className="f" htmlFor="batchSel">Pickup</label>
      <select id="batchSel" value=${current?.batchId || ""} onChange=${(e) => setSel(e.target.value)}>
        ${waiting.length ? waiting.map((b) => html`<option key=${b.batchId} value=${b.batchId}>Pickup #${b.number}: building says ${b.binPct.toFixed(1)}%</option>`)
          : html`<option value="">No pickups waiting for a measurement</option>`}</select>
      <label className="f" htmlFor="pct">Measured contamination (%)</label>
      <input id="pct" type="number" min="0" max="100" step="0.1" value=${pct} onInput=${(e) => setPct(e.target.value)}/>
      <div className="row"><button className="btn green" id="report" onClick=${report}>Sign measurement</button></div>
      <${AnimatePresence} mode="wait">${out && html`<${motion.div} key=${out.tx || out.error} className=${"verdict " + (out.status === "Verified" ? "ok" : "bad")} style=${{ marginTop: 16 }}
        initial=${{ opacity: 0, scale: .95 }} animate=${{ opacity: 1, scale: 1 }} transition=${spring}>
        <div className="badge"><${Icon} kind=${out.status === "Verified" ? "ok" : "bad"}/></div>
        <div><b>${out.status === "Verified" ? "Verified: the building and the facility agree" : out.status === "Flagged" ? "Flagged: the building and the facility disagree" : "Refused"}</b>
          <small>${out.status === "Verified" ? "One diversion claim can now be issued for this pickup." : out.status === "Flagged" ? "No claim can be issued. Someone has to look at this load." : out.error}</small>
          ${out.tx && html`<div className="mono" style=${{ marginTop: 6 }}>⛓ tx ${short(out.tx)}</div>`}</div><//>`}<//><//>
    <${Card} i=${1}><h2>Do they agree?</h2><p className="hint">Within ${tol} points of the building's own record, the contract verifies the pickup.</p>
      <div className="compare">
        <${motion.div} className="band" animate=${{ left: x(bin - tol), width: `${2 * tol}%` }} transition=${spring}/>
        <${motion.div} className="mark" style=${{ background: "#0d1b2e" }} animate=${{ left: x(bin) }} transition=${spring}><span>building ${bin.toFixed(1)}%</span><//>
        <${motion.div} className="mark" style=${{ background: Math.abs(fac - bin) <= tol ? "#1c9a63" : "#d93d42", top: 30 }} animate=${{ left: x(fac) }} transition=${spring}>
          <span style=${{ color: Math.abs(fac - bin) <= tol ? "#1c9a63" : "#d93d42" }}>facility ${fac.toFixed(1)}%</span><//>
      </div>
      <div className="row" style=${{ justifyContent: "space-between" }}><span className="mono">0%</span><span className="mono">100%</span></div><//>
  </div>`;
}
