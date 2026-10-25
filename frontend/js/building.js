// Building & pickups: contamination by floor, committing a pickup on chain, claiming once.
import { html, api, short, spring, pill, Count, Ring, Card, LEFT_RECYCLING, statusClass, useState, motion, AnimatePresence, animate } from "./lib.js";
import { Seal } from "./seal.js";

// Contamination by floor: the view a property manager acts on.
export function FloorsCard({ state }) {
  const drops = state.events.filter((e) => e.floor && (e.stream || "RECYCLING") === "RECYCLING");
  const floors = {}; drops.forEach((e) => { const f = floors[e.floor] ||= { n: 0, bad: 0, bags: 0 }; f.n++; if (e.contaminated) f.bad++; if (e.route === "diverted") f.bags++; });
  const rows = Object.entries(floors).map(([f, v]) => [Number(f), v]).sort((a, b) => b[1].bad / b[1].n - a[1].bad / a[1].n).slice(0, 8);
  const bags = drops.filter((e) => e.route === "diverted").length; const food = drops.filter((e) => e.route === "to_organics").length;
  return html`<${Card} i=${2}><h2 id="floors">By floor</h2><p className="hint">Recycling-stream drops per floor. Residents get floor-level feedback; no one is named.</p>
    <div className="row" style=${{ marginTop: 0, marginBottom: 10 }}><span className="pill bad">${bags} black bags diverted</span><span className="pill bad">${food} food drops sent to organics</span><span className="pill warn">${state.events.filter((e) => e.needsReview).length} in review</span></div>
    ${rows.map(([f, v]) => { const pct = 100 * v.bad / v.n; return html`<div key=${f} style=${{ display: "grid", gridTemplateColumns: "64px 1fr 56px", gap: 10, alignItems: "center", margin: "7px 0" }}>
      <b>Floor ${f}</b><div style=${{ height: 10, borderRadius: 6, background: "#eef1f6", overflow: "hidden" }}><${motion.div} initial=${{ width: 0 }} animate=${{ width: pct + "%" }} transition=${{ duration: .8 }}
        style=${{ height: "100%", background: pct > 30 ? "#e5484d" : pct > 0 ? "#f5b942" : "#2fbf7f" }}/></div><span className="mono">${pct.toFixed(0)}%</span></div>`; })}<//>`;
}

export function BuildingTab({ state, refresh }) {
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(""); const [claimMsg, setClaimMsg] = useState({});
  const open = state.events.filter((e) => !e.batchId && !e.needsReview && (e.stream || "RECYCLING") === "RECYCLING" && !LEFT_RECYCLING.includes(e.route)); const dirty = open.filter((e) => e.contaminated).length;
  const pct = open.length ? 100 * dirty / open.length : 0;
  const pickup = async () => { setBusy(true); setMsg("Committing…");
    try { const b = await api("/api/pickup", {}); setMsg(`Pickup #${b.number}: ${b.items} items sealed · root ${short(b.root)} · tx ${short(b.tx.commit)}`); }
    catch (e) { setMsg(e.message); } setBusy(false); refresh(); };
  const claim = async (id) => {
    try { const r = await api(`/api/claim/${id}`, {}); setClaimMsg((m) => ({ ...m, [id]: { ok: true, text: `claimed · tx ${short(r.tx)}` } })); }
    catch (e) { setClaimMsg((m) => ({ ...m, [id]: { ok: false, text: `Refused by the contract: ${e.message}`, t: Date.now() } })); }
    refresh(); };
  const d = state.deployment;
  return html`<div className="grid">
    <${Card} i=${0}><h2>This building's recycling</h2><p className="hint">Recycling drops waiting for the next pickup.</p>
      <div className="gauge"><${Ring} pct=${pct}/><div><div className="bignum" style=${{ color: pct > 20 ? "var(--red)" : "var(--green)" }}><${Count} value=${pct} suffix="%"/></div>
        <div className="hint" style=${{ margin: 0 }}>contamination in ${open.length} items</div></div></div>
      <p className="hint" style=${{ marginTop: 14 }}>Toronto's audited Blue Box contamination in 2025 was <b>35.4%</b>. In a tower, hundreds of units share one chute.</p>
      <div className="row"><button className="btn green" id="pickup" disabled=${busy} onClick=${pickup}>Pickup: commit batch on chain</button></div>
      <${AnimatePresence}>${msg && html`<${motion.div} key=${msg} className="mono" initial=${{ opacity: 0, y: 6 }} animate=${{ opacity: 1, y: 0 }} style=${{ marginTop: 10 }}>${msg}<//>`}<//><//>
    <${Card} i=${1}><h2>How a pickup becomes a claim</h2><p className="hint">Two parties, two keys, one contract.</p>
      ${["Building seals the items into a Merkle tree and signs the root", "Facility measures the load and signs its own number", "Contract compares: within 10 points is Verified", "One verified pickup, one claim. Never two."]
        .map((s, k) => html`<${motion.div} key=${k} initial=${{ opacity: 0, x: 16 }} animate=${{ opacity: 1, x: 0 }} transition=${{ ...spring, delay: .15 + k * .08 }}
          style=${{ display: "flex", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: k < 3 ? "1px solid var(--line)" : 0 }}>
          <span className="pill ok" style=${{ minWidth: 30, justifyContent: "center" }}>${k + 1}</span><span>${s}</span><//>`)}<//>
    <${FloorsCard} state=${state}/>
    <${Card} className="span2" i=${2}><h2>Pickups</h2><p className="hint">${d ? `Contract ${short(d.address)} · building ${short(d.building)} · facility ${short(d.facility)} · tolerance ${d.toleranceBps / 100} points` : "Contract not deployed."}</p>
      <div className="list" id="batches"><${AnimatePresence} initial=${false}>${state.batches.length ? state.batches.slice().reverse().map((b) => {
        const cm = claimMsg[b.batchId];
        return html`<${motion.div} layout key=${b.batchId} className="pickup" initial=${{ opacity: 0, y: -14 }} animate=${{ opacity: 1, y: 0 }} transition=${spring}>
          <div className="num">#${b.number}</div>
          <div><div className="hint" style=${{ margin: 0 }}>Bin AI says</div><b style=${{ fontSize: 22 }}>${b.binPct.toFixed(1)}%</b> <span className="tag">${b.items} items${b.seeded ? `, ${b.seeded} seeded` : ""}</span>
            <div><span className="chip">⛓ ${short(b.tx.commit)}</span></div></div>
          <div><div className="hint" style=${{ margin: 0 }}>Facility measured</div><b style=${{ fontSize: 22 }}>${b.facilityPct === null ? "–" : b.facilityPct.toFixed(1) + "%"}</b>
            ${b.tx.measurement && html`<div><span className="chip">⛓ ${short(b.tx.measurement)}</span></div>`}</div>
          <div><span className=${"pill " + statusClass(b.status)}>${b.status}</span></div>
          <div>${b.status === "Verified" && html`<button className="btn alt" onClick=${() => claim(b.batchId)}>${b.claimed ? "Claim again" : "Issue claim"}</button>`}
            ${cm ? html`<${motion.div} key=${cm.t || "ok"} className="mono" style=${{ marginTop: 6, color: cm.ok ? "var(--green)" : "var(--red)", fontWeight: 600 }}
                initial=${{ x: 0 }} animate=${cm.ok ? { x: 0 } : { x: [0, -10, 10, -8, 8, -4, 0] }} transition=${{ duration: .5 }}>${cm.text}<//>`
              : b.tx.claim && html`<div className="mono" style=${{ marginTop: 6 }}>claimed · tx ${short(b.tx.claim)}</div>`}</div><//>`; })
        : html`<p className="hint">No pickups yet.</p>`}<//></div><//>
    <${Card} className="span2" i=${3}><div className="row" style=${{ marginTop: 0, justifyContent: "space-between" }}>
      <div><h2>The Seal</h2><p className="hint" style=${{ margin: 0 }}>See each pickup as the tree the building signed, in 3D, and test any item against the contract.</p></div>
      <button className="btn green" onClick=${() => { location.hash = "seal"; dispatchEvent(new HashChangeEvent("hashchange")); }}>Open The Seal →</button></div><//>
  </div>`;
}
