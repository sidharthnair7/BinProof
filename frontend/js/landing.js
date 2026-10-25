// The landing page.
import { html, spring, pill, Count, Rise, motion, animate } from "./lib.js";

// Light beams: faint curves across the hero with pulses of light travelling along them.
export const BEAM_PATHS = Array.from({ length: 13 }, (_, i) => {
  const x0 = -260 + i * 70, y0 = 1000, x3 = 1150 + i * 55, y3 = -80 + i * 18;
  return `M${x0} ${y0} C ${x0 + 260} ${720 - i * 12}, ${x3 - 420} ${420 - i * 10}, ${x3} ${y3}`;
});
export const Beams = () => html`<svg className="beams" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs><linearGradient id="beamgrad" x1="0" y1="1" x2="1" y2="0">
    <stop offset="0" stop-color="#3b5bfd" stop-opacity="0"/><stop offset=".35" stop-color="#3b5bfd"/>
    <stop offset=".65" stop-color="#06b6d4"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs>
  ${BEAM_PATHS.map((d, i) => html`<path key=${"b" + i} className="b" d=${d}/>`)}
  ${BEAM_PATHS.map((d, i) => html`<path key=${"p" + i} className="p" d=${d} pathLength="1000"
    style=${{ "--d": `${7 + (i * 1.7) % 5}s`, "--dl": `${(i * 1.13) % 6}s` }}/>`)}
</svg>`;

export function Landing({ go, state }) {
  const d = state.deployment;
  const hot = [3, 7, 8, 12, 15, 19, 21, 24, 27, 30, 33];
  return html`<div className="herowrap"><${Beams}/><div className="herofade"></div><div className="aurora" aria-hidden="true">
      ${[["#3b82f6", 520, "6%", "-4%", 0], ["#06b6d4", 420, "40%", "8%", 2], ["#8b5cf6", 380, "66%", "-8%", 4]].map(([c, sz, l, t, dl]) => html`<${motion.i} key=${c}
        style=${{ background: c, width: sz, height: sz, left: l, top: t }} animate=${{ x: [0, 40, -30, 0], y: [0, 30, -20, 0] }} transition=${{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: dl }}/>`)}
    </div>
  <main className="wrap" style=${{ position: "relative", zIndex: 1 }}>
    <section className="hero">
      <div>
        <${Rise} now=${true}><span className="eyebrow"><span className="dot"></span>A retrofit kit for the garbage chute a tower already has</span><//>
        <${Rise} now=${true} d=${.06}><h1 className="h1">Every drop down<br/>the chute, <em>checked.</em></h1><//>
        <${Rise} now=${true} d=${.12}><p className="lede">BinProof clips onto the chute a tower already has. It knows which stream each resident picked, checks the drop at the bottom, diverts black bags out of recycling, and turns each pickup into numbers the recycling facility can verify. Without watching anyone.</p><//>
        <${Rise} now=${true} d=${.18} className="cta">
          <button className="btn green lg" id="openApp" onClick=${() => go("bin")}>Drop something down the chute →</button>
          <button className="btn alt lg" onClick=${() => go("verify")}>Verify a receipt</button><//>
      </div>
      <${Rise} now=${true} d=${.1} className="stat">
        <div style=${{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,.7)", letterSpacing: ".06em", textTransform: "uppercase" }}>Toronto Blue Box contamination, 2025</div>
        <div className="n"><${Count} value=${35.4} suffix="%"/></div>
        <div style=${{ fontSize: 18, color: "rgba(255,255,255,.85)", marginTop: 6 }}>of what went into recycling didn't belong there.</div>
        <div className="bars">${Array.from({ length: 34 }).map((_, k) => html`<${motion.i} key=${k} className=${hot.includes(k) || k % 3 === 0 ? "hot" : ""}
          initial=${{ height: 0 }} animate=${{ height: `${30 + ((k * 37) % 60)}%` }} transition=${{ delay: .4 + k * .02, ...spring }}/>`)}</div>
        <div className="src">Audited. Circular Materials data in a City of Toronto committee file (2026). Apartments divert 26.3% of their waste; houses, 60.3%.</div><//>
    </section>

    <section className="section" id="how">
      <${Rise}><h2 className="h2">Three signatures. One claim.</h2><p className="lede" style=${{ marginBottom: 0 }}>Every number is signed by the party who measured it, and checked against the other.</p><//>
      <div className="steps">${[
        ["1", "The chute checks", "At the chute door, a fob and the stream button. At the bottom, a camera checks the drop against that stream. Black bags go to garbage, food goes to organics, unsure drops go to a person."],
        ["2", "The facility checks", "At pickup the building seals the list and signs it. The recycling facility signs what it measured, with its own key."],
        ["3", "Claimed once", "Within 10 points, the pickup is verified and earns exactly one claim. A second claim is refused by the contract."],
      ].map(([k, t, p], i) => html`<${Rise} key=${k} d=${i * .08} className="step"><div className="k">${k}</div><h3>${t}</h3><p>${p}</p><//>`)}</div>
      <${Rise} d=${.1} className="cta" style=${{ marginTop: 26 }}><button className="btn alt lg" onClick=${() => go("seal")}>Explore a sealed pickup in 3D →</button><//>
    </section>

    <section className="section split" id="why">
      <${Rise}><h2 className="h2">Why a blockchain,<br/>not a database?</h2>
        <p className="lede">Whoever keeps the database is paid by the numbers in it. In December 2025, Ontario's Auditor General found the regulator "has not begun to enforce" audits of the recycling data.</p><//>
      <${Rise} d=${.1} className="keys">
        <div className="key"><b>Building key</b><span>signs what the chute saw</span></div>
        <${motion.div} animate=${{ x: [0, 6, 0] }} transition=${{ repeat: Infinity, duration: 2 }} style=${{ fontSize: 26, color: "var(--muted)" }}>⇄<//>
        <div className="key"><b>Facility key</b><span>signs what it measured</span></div><//>
    </section>


    <section className="section split" id="hardware">
      <${Rise}><h2 className="h2">A retrofit kit.<br/>No new chute.</h2>
        <p className="lede">We're two broke college students, so we built the software part of the product first, not the hardware. The kit is two small modules that clip onto the chute a tower already has.</p>
        <div className="facts">${[
          ["1", "Floor module: a fob reader and the stream button at each floor's chute door. Many Toronto towers already have a tri-sorter button."],
          ["2", "Sorter module: a camera and a small computer at the bottom of the chute, with a metal sensor and a weight flap."],
          ["→", "A black bag in recycling is the contamination: recyclables shouldn't be bagged, so we don't need to see inside it."],
        ].map(([k, t], i) => html`<${Rise} key=${i} d=${i * .06} className="fact"><i>${k}</i><span>${t}</span><//>`)}</div><//>
      <${Rise} d=${.1} className="kit">
        <div className="bn">
          <div><span className="pill ok">Built</span><ul>${["The AI that checks each drop", "Private records, no photos kept", "Pickups sealed on the blockchain", "The facility's own check", "One claim per pickup", "Receipts anyone can verify"].map((t) => html`<li key=${t}>${t}</li>`)}</ul></div>
          <div><span className="pill warn">Next</span><ul>${["The floor and sorter modules (hardware)", "A pilot in one tower with a tri-sorter", "The facility's real audit numbers"].map((t) => html`<li key=${t}>${t}</li>`)}</ul></div>
        </div><//>
    </section>
    <section className="section" id="privacy">
      <${Rise}><h2 className="h2">Accountability, without watching anyone.</h2><//>
      <div className="priv">${[
        ["The camera sees waste, not people", "It points at the bottom of the chute. Only a fingerprint of the photo is kept, never the photo."],
        ["Pseudonymous, not named", "A fob becomes a scrambled code. Residents get floor-level feedback; only the building can match a code to a unit."],
        ["Residents hold their receipts", "Anyone can check their own receipt, without seeing anyone else's items."],
      ].map(([b, t], i) => html`<${Rise} key=${b} d=${i * .08}><div><b>${b}</b><span>${t}</span></div><//>`)}</div>
      <${Rise} d=${.1} className="cta" style=${{ marginTop: 34 }}><button className="btn green lg" onClick=${() => go("bin")}>Try it: drop something down the chute →</button><//>
    </section>
    <footer><span><b style=${{ color: "var(--ink)" }}>BinProof</b> · Made by Sid &amp; Trini, two CS students in Peterborough, Ontario.</span><span>Open source</span></footer>
  </main></div>`;
}
