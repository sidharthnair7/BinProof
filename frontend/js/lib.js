// Shared pieces: libraries, the API helper, routes, and small UI components used across the app.
import React, { useState, useEffect, useRef, useCallback } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import htm from "https://esm.sh/htm@3.1.1";
import { motion, AnimatePresence, animate } from "https://esm.sh/framer-motion@11.11.17?deps=react@18.3.1,react-dom@18.3.1";
export { React, useState, useEffect, useRef, useCallback, createRoot, motion, AnimatePresence, animate };

export const html = htm.bind(React.createElement);
if (!navigator.webdriver) import("https://esm.sh/lenis@1.1.13").then(({ default: Lenis }) => {
  const lenis = new Lenis({ duration: 1.1, smoothWheel: true }); window.__lenis = lenis; const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); }; requestAnimationFrame(raf);
}).catch(() => {});

export const api = async (url, body) => {
  const r = await fetch(url, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error || r.statusText); return j;
};
export const short = (h) => h ? h.slice(0, 10) + "…" + h.slice(-6) : "";
export const EASE = [0.22, 1, 0.36, 1];
export const spring = { type: "tween", ease: EASE, duration: .7 };
export const pill = { type: "spring", stiffness: 380, damping: 36, mass: .8 };

export const Icon = ({ kind }) => kind === "ok"
  ? html`<svg width="22" height="22" viewBox="0 0 24 24"><${motion.path} d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" initial=${{ pathLength: 0 }} animate=${{ pathLength: 1 }} transition=${{ duration: .45, delay: .15 }}/></svg>`
  : kind === "bad"
  ? html`<svg width="22" height="22" viewBox="0 0 24 24"><${motion.path} d="M6 6l12 12M18 6L6 18" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" initial=${{ pathLength: 0 }} animate=${{ pathLength: 1 }} transition=${{ duration: .45, delay: .15 }}/></svg>`
  : html`<b style=${{ fontSize: 22, color: "#fff" }}>?</b>`;

export const Logo = () => html`<svg width="46" height="46" viewBox="0 0 48 48" aria-hidden="true">
  <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#476b3f"/><stop offset="1" stop-color="#a87845"/></linearGradient></defs><rect x="1" y="1" width="46" height="46" rx="13" fill="url(#lg)"/>
  <path d="M15 17h18l-2 19a3 3 0 0 1-3 2.7h-8A3 3 0 0 1 17 36z" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M13 17h22M20 17v-3h8v3" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M19.5 27.5l3 3 6-6.5" fill="none" stroke="#a5f3fc" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function Count({ value, decimals = 1, suffix = "" }) {
  const ref = useRef(null); const prev = useRef(0);
  useEffect(() => { const c = animate(prev.current, value, { duration: .9, ease: "easeOut",
    onUpdate: (v) => { if (ref.current) ref.current.textContent = v.toFixed(decimals) + suffix; } }); prev.current = value; return () => c.stop(); }, [value]);
  return html`<span ref=${ref}>${value.toFixed(decimals)}${suffix}</span>`;
}

export function Ring({ pct }) {
  const r = 46, c = 2 * Math.PI * r;
  return html`<svg width="120" height="120" viewBox="0 0 120 120">
    <circle cx="60" cy="60" r=${r} fill="none" stroke="#e6ebf2" stroke-width="12"/>
    <${motion.circle} cx="60" cy="60" r=${r} fill="none" stroke=${pct > 20 ? "#d93d42" : "#1c9a63"} stroke-width="12" strokeLinecap="round"
      strokeDasharray=${c} initial=${{ strokeDashoffset: c }} animate=${{ strokeDashoffset: c * (1 - Math.min(pct, 100) / 100) }}
      transition=${{ duration: 1, ease: "easeOut" }} transform="rotate(-90 60 60)"/></svg>`;
}

export const Card = ({ children, className = "", i = 0 }) => html`<${motion.div} className=${"card " + className}
  initial=${{ opacity: 0, y: 14, filter: "blur(4px)" }} animate=${{ opacity: 1, y: 0, filter: "blur(0px)" }} transition=${{ ...spring, delay: i * .08 }}>${children}<//>`;

// Where a drop went, in the resident's words.
export const ROUTE = {
  recycling: (c) => [c ? "bad" : "ok", c ? "In recycling, but it doesn't belong" : "Sorted to recycling"],
  diverted: () => ["bad", "Diverted to garbage"],
  to_organics: () => ["bad", "Diverted to organics"],
  review: () => ["warn", "Sent to the review tote"],
  garbage: () => ["ok", "Sorted to garbage"],
  organics: () => ["ok", "Sorted to organics"],
};
// Routes where the sorter sent the drop out of the recycling stream (same list as Ledger.LEFT_RECYCLING).
export const LEFT_RECYCLING = ["diverted", "to_organics"];
export const routeOf = (v) => (ROUTE[v.route] || ((c) => [c ? "bad" : "ok", c ? "Doesn't belong" : "Belongs"]))(v.contaminated);
export const STREAMS = [["RECYCLING", "Recycling", "#3b5bfd"], ["GARBAGE", "Garbage", "#5b6478"], ["ORGANICS", "Organics", "#2f9e6a"]];

export function Verdict({ v, eventSha, loading }) {
  if (loading) return html`<${motion.div} className="verdict warn" initial=${{ opacity: 0 }} animate=${{ opacity: 1 }}>
    <div className="badge"><${motion.div} style=${{ width: 18, height: 18, border: "3px solid #fff", borderTopColor: "transparent", borderRadius: "50%" }}
      animate=${{ rotate: 360 }} transition=${{ repeat: Infinity, duration: .8, ease: "linear" }}/></div>
    <div><b>Looking…</b><small>The sorter camera describes the drop. The rules decide where it goes.</small></div><//>`;
  if (!v) return html`<p className="hint">Tap a fob, press a stream button, then <b>Drop it down the chute</b>.</p>`;
  const [kind, head] = routeOf(v);
  return html`<${motion.div} key=${eventSha} className=${"verdict " + kind} initial=${{ opacity: 0, scale: .94, y: 10 }} animate=${{ opacity: 1, scale: 1, y: 0 }} transition=${spring}>
    <${motion.div} className="badge" initial=${{ scale: 0 }} animate=${{ scale: 1 }} transition=${{ ...spring, delay: .05 }}><${Icon} kind=${kind === "warn" ? "warn" : kind}/><//>
    <div style=${{ flex: 1 }}><b>${head}</b><small>${v.item} · ${v.reason}</small>
      <div className="conf"><${motion.i} initial=${{ width: 0 }} animate=${{ width: (v.confidence * 100) + "%" }} transition=${{ duration: .8 }}/></div>
      <div className="mono" style=${{ marginTop: 8 }}>camera saw ${v.detected || v.category} (${v.bag || "loose"}) · confidence ${(v.confidence * 100).toFixed(0)}% · ${v.model} · ${(v.ms / 1000).toFixed(1)}s<br/>photo sha256 ${short(eventSha)} · photo kept on the sorter's device</div>
    </div><//>`;
}

export const Sim = ({ label, children }) => html`<div style=${{ marginTop: 12 }}><div style=${{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
  <label className="f" style=${{ margin: 0 }}>${label}</label><span className="tag" style=${{ background: "#eef1f6", borderStyle: "solid" }}>SIMULATED</span></div>${children}</div>`;

export const statusClass = (s) => s === "Verified" ? "ok" : s === "Flagged" ? "bad" : "warn";

// Above the fold animates on load; further down reveals on scroll (and shows anyway if the observer never fires).
export const Rise = ({ children, d = 0, className = "", style, now = false }) => {
  const [seen, setSeen] = useState(now);
  useEffect(() => { if (!now) { const t = setTimeout(() => setSeen(true), 2500); return () => clearTimeout(t); } }, []);
  if (now) return html`<${motion.div} className=${className} style=${style} initial=${{ opacity: 0, y: 16, filter: "blur(6px)" }}
    animate=${{ opacity: 1, y: 0, filter: "blur(0px)" }} transition=${{ ...spring, duration: .9, delay: d }}>${children}<//>`;
  return html`<${motion.div} className=${className} style=${style} initial=${{ opacity: 0, y: 16, filter: "blur(6px)" }}
    animate=${seen ? { opacity: 1, y: 0, filter: "blur(0px)" } : undefined} whileInView=${{ opacity: 1, y: 0, filter: "blur(0px)" }} viewport=${{ once: true, amount: .1 }}
    onViewportEnter=${() => setSeen(true)} transition=${{ ...spring, duration: .9, delay: d }}>${children}<//>`;
};

// The background: a faint dot field revealed only around the pointer, trailing it softly. The real cursor stays.
// It moves with a CSS variable, so it stays smooth.
export function Pointer() {
  const grid = useRef(null);
  useEffect(() => {
    if (matchMedia("(pointer: coarse)").matches) return;
    const m = { x: innerWidth / 2, y: innerHeight / 3, gx: innerWidth / 2, gy: innerHeight / 3 };
    let raf, shown = false;
    const move = (e) => { m.x = e.clientX; m.y = e.clientY;
      if (!shown) { shown = true; grid.current.classList.add("on"); } };
    const tick = () => {
      m.gx += (m.x - m.gx) * .08; m.gy += (m.y - m.gy) * .08;
      grid.current.style.setProperty("--mx", m.gx + "px"); grid.current.style.setProperty("--my", m.gy + "px");
      raf = requestAnimationFrame(tick);
    };
    addEventListener("mousemove", move, { passive: true }); raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); removeEventListener("mousemove", move); };
  }, []);
  return html`<div><div ref=${grid} className="gridfx" aria-hidden="true"></div></div>`;
}
