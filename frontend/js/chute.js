// The chute: fob, floor, stream button, simulated sensors, the sorter camera and its verdict.
import { html, api, spring, pill, Icon, Card, LEFT_RECYCLING, routeOf, STREAMS, Verdict, Sim, useState, useEffect, useRef, motion, AnimatePresence, animate } from "./lib.js";

export function BinTab({ state, refresh, onDisposed }) {
  const video = useRef(null); const [cam, setCam] = useState(false); const [still, setStill] = useState(null);
  const [unit, setUnit] = useState("1203"); const [floor, setFloor] = useState(12); const [stream, setStream] = useState("RECYCLING");
  const [metal, setMetal] = useState(0); const [weight, setWeight] = useState(0.05);
  const [busy, setBusy] = useState(false); const [res, setRes] = useState(null); const [err, setErr] = useState("");
  useEffect(() => { navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment" } })
    .then((s) => { if (video.current) { video.current.srcObject = s; setCam(true); } }).catch(() => setCam(false)); }, []);
  const toJpeg = (src, w, h) => { const k = Math.min(1, 1024 / Math.max(w, h)); const c = document.createElement("canvas");
    c.width = Math.round(w * k); c.height = Math.round(h * k); c.getContext("2d").drawImage(src, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", .85); };
  const dispose = async (image) => {
    setStill(image); setBusy(true); setErr("");
    try { const r = await api("/api/dispose", { unit, floor, stream, metal, weightKg: weight, image }); setRes(r); onDisposed(r.event.eventId); }
    catch (e) { setErr(e.message); } setBusy(false); refresh();
  };
  const snap = () => { const v = video.current; if (v?.videoWidth) dispose(toJpeg(v, v.videoWidth, v.videoHeight)); };
  const file = (e) => { const f = e.target.files[0]; if (!f) return; const img = new Image();
    img.onload = () => { dispose(toJpeg(img, img.naturalWidth, img.naturalHeight)); URL.revokeObjectURL(img.src); }; img.src = URL.createObjectURL(f); e.target.value = ""; };
  const open = state.events.filter((e) => !e.batchId && (e.stream || "RECYCLING") === "RECYCLING" && !LEFT_RECYCLING.includes(e.route)).length;
  const review = state.events.filter((e) => e.needsReview);
  return html`<div className="grid">
    <${Card} i=${0}><h2>The chute, floor by floor</h2>
      <p className="hint">At the chute door: the resident's fob and the stream button. At the bottom: the sorter camera.</p>
      <div className="row" style=${{ marginTop: 0 }}>
        <div style=${{ flex: 1, minWidth: 120 }}><label className="f" htmlFor="unit">Fob tap (unit)</label><input id="unit" value=${unit} onInput=${(e) => setUnit(e.target.value)}/></div>
        <div style=${{ width: 110 }}><label className="f" htmlFor="floor">Floor</label><input id="floor" type="number" min="1" max="60" value=${floor} onInput=${(e) => setFloor(Number(e.target.value) || 1)}/></div>
      </div>
      <label className="f">Stream button</label>
      <div className="row" style=${{ marginTop: 0 }} id="streams">${STREAMS.map(([id, label, c]) => html`<button key=${id} data-stream=${id}
        className=${"btn " + (stream === id ? "green" : "alt")} style=${stream === id ? { background: c } : {}} onClick=${() => setStream(id)}>${label}</button>`)}</div>
      <div className="cam" style=${{ marginTop: 14 }}>
        <video ref=${video} autoPlay playsInline muted style=${{ display: still || !cam ? "none" : "block" }}></video>
        ${still && html`<img src=${still} alt="drop"/>`}
        ${!still && !cam && html`<div className="empty">No camera here: use a photo instead.</div>`}
        ${busy && html`<${motion.div} className="scan" initial=${{ top: "0%" }} animate=${{ top: ["0%", "97%", "0%"] }} transition=${{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}/>`}
        <div style=${{ position: "absolute", left: 12, top: 10, color: "#fff", font: '600 12px "Inter Tight"', opacity: .8 }}>Sorter camera · floor ${floor} chute</div>
      </div>
      <${Sim} label=${`Metal detector: ${metal.toFixed(2)}`}><input type="range" id="metal" min="0" max="1" step="0.05" value=${metal} onInput=${(e) => setMetal(Number(e.target.value))} style=${{ width: "100%", padding: 0 }}/><//>
      <${Sim} label=${`Weight on the catch flap: ${weight.toFixed(2)} kg`}><input type="range" id="weight" min="0" max="5" step="0.01" value=${weight} onInput=${(e) => setWeight(Number(e.target.value))} style=${{ width: "100%", padding: 0 }}/><//>
      <div className="row">
        <button className="btn green" id="snap" disabled=${busy} onClick=${snap}>Drop it down the chute</button>
        <label className="btn alt" style=${{ margin: 0 }}>Use a photo<input type="file" id="file" accept="image/*" className="hide" onChange=${file}/></label>
      </div>
      <p className="hint" style=${{ marginTop: 12, marginBottom: 0, fontSize: 13 }}>Hardware not built. The floor panel and the sorter's sensors are simulated inputs set by the presenter; the camera verdict is real.</p><//>
    <${Card} i=${1}><h2>What the sorter decided</h2><p className="hint">The camera describes. The stream button and the rules decide. Unsure goes to a person.</p>
      <div id="verdict">${err ? html`<div className="verdict bad"><div className="badge"><${Icon} kind="bad"/></div><div><b>Error</b><small>${err}</small></div></div>`
        : html`<${Verdict} v=${res?.verdict} eventSha=${res?.event.imageSha256} loading=${busy}/>`}</div>
      ${review.length > 0 && html`<h2 style=${{ marginTop: 22 }}>Review tote <span className="tag">${review.length} for the superintendent</span></h2>
        <div className="list">${review.slice(0, 4).map((e) => html`<div key=${e.eventId} className="item" style=${{ gridTemplateColumns: "1fr auto" }}>
          <div><b>Floor ${e.floor ?? "?"}</b> · ${e.stream || ""} · ${e.item}</div>
          <div><button className="btn alt" style=${{ padding: "4px 9px", fontSize: 13 }} onClick=${async () => { await api(`/api/review/${e.eventId}`, { contaminated: false }); refresh(); }}>It's fine</button>
            <button className="btn alt" style=${{ padding: "4px 9px", fontSize: 13, marginLeft: 4 }} onClick=${async () => { await api(`/api/review/${e.eventId}`, { contaminated: true }); refresh(); }}>Contamination</button>
            <button className="btn alt" style=${{ padding: "4px 9px", fontSize: 13, marginLeft: 4 }} onClick=${async () => { await api(`/api/review/${e.eventId}`, { contaminated: true, divert: true }); refresh(); }}>Divert</button></div></div>`)}</div>`}
      <h2 style=${{ marginTop: 22 }}>Recent drops <span className="tag">${open} in recycling, waiting for pickup</span></h2>
      <div className="list" id="events"><${AnimatePresence} initial=${false}>${state.events.slice(0, 8).map((e) => { const [k, h] = routeOf(e); return html`
        <${motion.div} layout key=${e.eventId} className="item" initial=${{ opacity: 0, x: -24 }} animate=${{ opacity: 1, x: 0 }} exit=${{ opacity: 0 }} transition=${spring}>
          <div><b>${e.floor ? "Fl " + e.floor : e.unit}</b>${e.seeded && html`<span className="tag">seeded</span>`}</div>
          <div>${e.item}<div className="mono" style=${{ fontSize: 11 }}>${e.stream || ""}${e.detected ? " · saw " + e.detected : ""}</div></div>
          <div><span className=${"pill " + k}>${h}</span>${e.batchId && html`<span className="tag">picked up</span>`}</div><//>`; })}<//></div><//>
  </div>`;
}
