// Verify a receipt: check one drop against the pickup's Merkle root on chain.
import { html, api, short, Icon, Card, useState, motion, AnimatePresence, animate } from "./lib.js";

export const FIELDS = ["eventId", "unitTag", "imageSha256", "category", "contaminated", "confidenceBps", "model", "timestamp", "seeded"];
export function VerifyTab({ state, lastEventId }) {
  const [text, setText] = useState(""); const [out, setOut] = useState(null); const [orig, setOrig] = useState(null);
  let parsed = null; try { parsed = JSON.parse(text); } catch { parsed = null; }
  const load = async () => {
    const last = state.events.find((e) => e.eventId === lastEventId);
    const mine = last?.batchId ? last.eventId : state.events.find((e) => e.batchId)?.eventId;
    if (!mine) { setText(""); return; }
    const r = await api(`/api/receipt/${mine}`); setOut(null);
    if (r.pending) { setText("This item is waiting for pickup. Its receipt exists once the pickup is committed."); return; }
    const t = JSON.stringify({ batchId: r.batchId, fields: r.leafFields, values: r.values, proof: r.proof }, null, 2); setText(t); setOrig(r.values);
  };
  const check = async () => { try { const r = JSON.parse(text); const o = await api("/api/verify", { batchId: r.batchId, values: r.values, proof: r.proof }); setOut({ ...o, t: Date.now() }); }
    catch (e) { setOut({ ok: false, error: e.message, t: Date.now() }); } };
  const tamper = () => { try { const r = JSON.parse(text); r.values[4] = !r.values[4]; setText(JSON.stringify(r, null, 2)); setOut(null); } catch {} };
  const levels = parsed?.proof ? parsed.proof.length + 1 : 0;
  return html`<div className="grid">
    <${Card} i=${0}><h2>A resident's receipt</h2><p className="hint">Their own event plus a Merkle proof. Nobody else's items are revealed.</p>
      <div className="row" style=${{ marginTop: 0 }}><button className="btn alt" id="lastReceipt" onClick=${load}>Load my latest receipt</button></div>
      ${parsed?.values ? html`<div className="ticket" style=${{ marginTop: 14 }}>${FIELDS.map((f, k) => {
          const changed = orig && JSON.stringify(orig[k]) !== JSON.stringify(parsed.values[k]);
          return html`<div key=${f} className=${changed ? "changed" : ""}><span>${f}${changed ? " · changed" : ""}</span><div className="mono" style=${{ color: changed ? "var(--red)" : undefined, fontWeight: changed ? 700 : 400 }}>${String(parsed.values[k]).length > 26 ? short(String(parsed.values[k])) : String(parsed.values[k])}</div></div>`; })}</div>` : null}
      <textarea id="receipt" value=${text} onInput=${(e) => setText(e.target.value)} placeholder='{"batchId": "...", "values": [...], "proof": [...]}'></textarea>
      <div className="row"><button className="btn green" id="check" onClick=${check}>Verify on chain</button><button className="btn alt" id="tamper" onClick=${tamper}>Tamper with it</button></div><//>
    <${Card} i=${1}><h2>The check, against the contract</h2><p className="hint">The proof climbs from this item to the root the building signed.</p>
      <div className="tree">${Array.from({ length: levels }).map((_, lv) => {
          const n = levels - lv; const lit = out && out.ok; const failed = out && !out.ok;
          return html`<div key=${lv} className="lvl">${Array.from({ length: Math.min(4, 2 ** Math.max(0, n - 1)) }).map((__, k) => html`<${motion.div} key=${k} className="node"
            animate=${{ background: lit && k === 0 ? "#d9f5e5" : failed && k === 0 ? "#fde9e8" : "#eef1f6", borderColor: lit && k === 0 ? "#1c9a63" : failed && k === 0 ? "#d93d42" : "#dfe4ec" }}
            transition=${{ delay: lit || failed ? (levels - lv) * .18 : 0 }}>${lv === 0 ? "root" : k === 0 ? (lv === levels - 1 ? "you" : "h") : "·"}<//>`)}</div>`; })}</div>
      <div id="verifyMsg" style=${{ marginTop: 16 }}><${AnimatePresence} mode="wait">${out && html`<${motion.div} key=${out.t} className=${"verdict " + (out.ok ? "ok" : "bad")}
        initial=${{ opacity: 0, y: 10 }} animate=${out.ok ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, x: [0, -10, 10, -6, 6, 0] }} transition=${{ duration: .5 }}>
        <div className="badge"><${Icon} kind=${out.ok ? "ok" : "bad"}/></div>
        <div><b>${out.ok ? "Found in the committed pickup" : "Not in the pickup"}</b><small>${out.ok ? "The contract confirmed this exact event is inside the batch root." : out.error || "Either the receipt was changed or the item was never committed."}</small>
          ${out.leaf && html`<div className="mono" style=${{ marginTop: 6 }}>leaf ${short(out.leaf)}</div>`}</div><//>`}<//></div><//>
  </div>`;
}
