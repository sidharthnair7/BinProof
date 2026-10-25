// Entry point: the app shell, tabs and navigation.
import { html, api, EASE, pill, Logo, Pointer, useState, useEffect, useCallback, createRoot, motion, AnimatePresence, animate } from "./lib.js";
import { BinTab } from "./chute.js";
import { BuildingTab } from "./building.js";
import { FacilityTab } from "./facility.js";
import { VerifyTab } from "./verify.js";
import { Landing } from "./landing.js";
import { Seal, SealSandbox } from "./seal.js";


export const TABS = [["bin", "The chute"], ["building", "Building & pickups"], ["facility", "Facility"], ["seal", "The Seal"], ["verify", "Verify a receipt"]];
export const SECTIONS = [["sealed", "The Seal"], ["how", "How it works"], ["why", "Why blockchain"], ["hardware", "The kit"], ["privacy", "Privacy"]];
export const glide = (id) => { const el = document.getElementById(id); if (!el) return;
  if (window.__lenis) window.__lenis.scrollTo(el, { offset: -90, duration: 1.2 }); else window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 90, behavior: "smooth" }); };
export function App() {
  const initial = location.hash.replace("#", ""); const [tab, setTabRaw] = useState(TABS.some(([id]) => id === initial) ? initial : "home");
  const setTab = (t) => { setTabRaw(t); history.replaceState(null, "", t === "home" ? location.pathname : "#" + t); window.scrollTo({ top: 0 }); }; const [state, setState] = useState({ events: [], batches: [], deployment: null }); const [last, setLast] = useState(null);
  const refresh = useCallback(async () => setState(await api("/api/state")), []);
  useEffect(() => { const on = () => { const h = location.hash.replace("#", ""); if (TABS.some(([id]) => id === h)) { setTabRaw(h); window.scrollTo({ top: 0 }); refresh(); } };
    addEventListener("hashchange", on); return () => removeEventListener("hashchange", on); }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const d = state.deployment;
  const [scrolled, setScrolled] = useState(false); const [section, setSection] = useState("");
  useEffect(() => { const on = () => { let cur = ""; for (const [id] of SECTIONS) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top < innerHeight * .45) cur = id; } setSection(cur); };
    on(); addEventListener("scroll", on, { passive: true }); return () => removeEventListener("scroll", on); }, [tab]);
  useEffect(() => { const on = () => setScrolled(window.scrollY > 24); on(); window.addEventListener("scroll", on, { passive: true }); return () => window.removeEventListener("scroll", on); }, []);
  return html`<div>
    <${AnimatePresence}>${tab === "seal" && html`<${SealSandbox} key="sandbox" state=${state} exit=${() => setTab("building")}/>`}<//>
    <div className="top"><${motion.div} className="navshell" initial=${false}
      animate=${scrolled ? { maxWidth: 1080, marginTop: 12, borderRadius: 999, paddingTop: 8, paddingBottom: 8, paddingLeft: 14, paddingRight: 10, borderColor: "rgba(223,228,236,1)", boxShadow: "0 12px 40px -12px rgba(13,27,46,.28)" }
                         : { maxWidth: 4000, marginTop: 0, borderRadius: 0, paddingTop: 14, paddingBottom: 14, paddingLeft: 32, paddingRight: 32, borderColor: "rgba(223,228,236,0)", boxShadow: "0 0 0 rgba(0,0,0,0)" }}
      transition=${{ type: "tween", ease: EASE, duration: .5 }}>
      <div className="brand-link" onClick=${() => setTab("home")}>
        <${motion.div} animate=${{ scale: scrolled ? .8 : 1 }} style=${{ display: "flex" }}><${Logo}/><//>
        <div><${motion.div} className="brand" animate=${{ fontSize: scrolled ? "21px" : "25px" }}>Bin<span>Proof</span><//>
          <${AnimatePresence}>${!scrolled && html`<${motion.div} className="sub" initial=${{ opacity: 0, height: 0 }} animate=${{ opacity: 1, height: "auto" }} exit=${{ opacity: 0, height: 0 }}>Checked at the chute. Verified by the facility. Claimable once.<//>`}<//></div></div>
      <div className="grow"></div>
      ${tab === "home"
        ? html`<nav>${SECTIONS.map(([id, label]) => html`<button key=${id} className=${section === id ? "on" : ""} onClick=${() => glide(id)}>
            ${section === id && html`<${motion.div} layoutId="ul" className="ul" transition=${pill}/>`}${label}</button>`)}
            <button className="btn green" style=${{ marginLeft: 8, padding: "9px 16px", fontSize: 14 }} onClick=${() => { setTab("bin"); refresh(); }}>Open the app →</button></nav>`
        : html`<nav><button className="" onClick=${() => setTab("home")} title="Back to the overview">⌂ Home</button>
            ${TABS.map(([id, label], k) => html`<button key=${id} data-tab=${id} className=${tab === id ? "on" : ""} onClick=${() => { setTab(id); refresh(); }}>
            ${tab === id && html`<${motion.div} layoutId="ul" className="ul" transition=${pill}/>`}<span className="n">${k + 1}</span>${label}</button>`)}</nav>`}
      <${AnimatePresence}>${!scrolled && tab !== "home" && html`<${motion.div} className="live" initial=${{ opacity: 0 }} animate=${{ opacity: 1 }} exit=${{ opacity: 0 }} style=${{ marginLeft: 6, whiteSpace: "nowrap" }}>
        <span className="dot"></span>${d ? (d.chainId === 84532 ? "Base Sepolia" : "Local chain " + d.chainId) : "No contract"}<//>`}<//>
    <//></div>
    ${tab === "home" ? html`<${Landing} go=${(t) => { setTab(t); refresh(); }} state=${state} refresh=${refresh}/>` : html`<main className="wrap"><${AnimatePresence} mode="wait"><${motion.section} key=${tab} id=${tab} initial=${{ opacity: 0, y: 8 }} animate=${{ opacity: 1, y: 0 }} exit=${{ opacity: 0, y: -8 }} transition=${{ duration: .2 }}>
      ${tab === "bin" ? html`<${BinTab} state=${state} refresh=${refresh} onDisposed=${setLast}/>`
        : tab === "building" ? html`<${BuildingTab} state=${state} refresh=${refresh}/>`
        : tab === "facility" ? html`<${FacilityTab} state=${state} refresh=${refresh}/>`
        : tab === "seal" ? null
        : html`<${VerifyTab} state=${state} lastEventId=${last}/>`}<//><//></main>`}
  </div>`;
}
const fieldEl = document.createElement("div"); document.body.insertBefore(fieldEl, document.getElementById("root"));
createRoot(fieldEl).render(html`<${Pointer}/>`);
createRoot(document.getElementById("root")).render(html`<${App}/>`);
