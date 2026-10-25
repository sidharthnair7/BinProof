// The Seal: a sealed pickup in 3D (the chute and the bale), with 2D and cone fallbacks.
import { html, api, short, EASE, spring, pill, Icon, useState, useEffect, useRef, motion, AnimatePresence, animate } from "./lib.js";

// "The Seal": a real pickup drawn as its Merkle tree. Items at the bottom fuse upward into one root;
// the root is signed on chain; the facility's key meets it. Click an item to light its proof path.
export const NODE_COLORS = { bad: "#ff5c63", ok: "#34d399", seeded: "rgba(255,255,255,.28)", review: "#f5b942" };
export function Seal({ batch, compact = false }) {
  const [tree, setTree] = useState(null); const [pick, setPick] = useState(null); const [broken, setBroken] = useState(false);
  useEffect(() => { setTree(null); setPick(null); setBroken(false);
    if (batch) api(`/api/batch/${batch.batchId}/tree`).then(setTree).catch(() => setTree(null)); }, [batch?.batchId]);
  if (!batch) return html`<div className="seal"><div style=${{ padding: 40, textAlign: "center", color: "rgba(255,255,255,.7)" }}>Commit a pickup to watch it get sealed.</div></div>`;
  if (!tree) return html`<div className="seal"><div style=${{ padding: 40, textAlign: "center", color: "rgba(255,255,255,.7)" }}>Loading the sealed pickup…</div></div>`;
  const n = tree.tree.length, depth = Math.floor(Math.log2(n));
  const W = 1100, H = compact ? 360 : 440, top = 70, bottom = H - 50, levelH = (bottom - top) / Math.max(1, depth);
  const pos = (i) => { const lv = Math.floor(Math.log2(i + 1)), k = i - (2 ** lv - 1); return { x: 40 + (k + .5) / 2 ** lv * (W - 80), y: top + lv * levelH, lv }; };
  const leafOf = Object.fromEntries(tree.leaves.map((l) => [l.treeIndex, l.value]));
  const ix = (f) => tree.fields.indexOf(f);
  const kind = (v) => v[ix("seeded")] ? (v[ix("contaminated")] ? "bad" : "seeded") : v[ix("contaminated")] ? "bad" : "ok";
  const path = new Set(); const sib = new Set();
  if (pick !== null) { let i = pick; while (i > 0) { path.add(i); sib.add(i % 2 ? i + 1 : i - 1); i = (i - 1) >> 1; } path.add(0); }
  const rootP = pos(0); const maxLv = depth;
  const delayFor = (lv) => (maxLv - lv) * .22;
  const stampOk = batch.status === "Verified", stampBad = batch.status === "Flagged";
  const r = compact ? 6 : 7.5;
  return html`<div className="seal">
    <svg viewBox=${`0 0 ${W} ${H}`} aria-label="The sealed pickup as a tree">
      <defs><radialGradient id="rootglow"><stop offset="0" stop-color="#8ec5ff" stop-opacity=".9"/><stop offset="1" stop-color="#3b5bfd" stop-opacity="0"/></radialGradient></defs>
      <text x="26" y="34" fill="rgba(255,255,255,.9)" style=${{ font: '700 17px "Inter Tight"' }}>Pickup #${tree.number} · ${tree.leaves.length} items sealed into one fingerprint</text>
      <text x="26" y="54" fill="rgba(255,255,255,.5)" style=${{ font: '500 12px "JetBrains Mono"' }}>root ${short(tree.root)}</text>
      ${tree.tree.map((_, i) => { if (i === 0) return null; const a = pos(i), b = pos((i - 1) >> 1);
        const on = path.has(i) && path.has((i - 1) >> 1);
        return html`<${motion.line} key=${"l" + i} x1=${a.x} y1=${a.y} x2=${b.x} y2=${b.y}
          stroke=${on ? (broken ? "#ff5c63" : "#8ec5ff") : "rgba(255,255,255,.14)"} strokeWidth=${on ? 2.4 : 1}
          initial=${{ pathLength: 0, opacity: 0 }} animate=${{ pathLength: 1, opacity: 1 }} transition=${{ duration: .6, ease: EASE, delay: delayFor(a.lv) + .1 }}/>`; })}
      <${motion.circle} cx=${rootP.x} cy=${rootP.y} r="34" fill="url(#rootglow)" initial=${{ opacity: 0, scale: .4 }}
        animate=${{ opacity: [0, 1, .55], scale: [.4, 1.2, 1] }} transition=${{ duration: 1.2, delay: delayFor(0) + .3 }}/>
      ${tree.tree.map((h, i) => { const p = pos(i); const v = leafOf[i]; const isLeaf = v !== undefined;
        const fill = isLeaf ? NODE_COLORS[kind(v)] : i === 0 ? "#ffffff" : "#5b7cff";
        const hot = path.has(i), side = sib.has(i);
        return html`<${motion.circle} key=${"n" + i} cx=${p.x} cy=${p.y} r=${i === 0 ? r + 5 : isLeaf ? r : r - 2}
          fill=${hot && broken && isLeaf ? "#ff5c63" : fill} stroke=${hot ? "#fff" : side ? "#8ec5ff" : "rgba(255,255,255,.15)"} strokeWidth=${hot ? 2.5 : side ? 1.5 : 1}
          strokeDasharray=${side ? "3 3" : undefined} style=${{ cursor: isLeaf ? "pointer" : "default" }}
          onClick=${() => { if (isLeaf) { setPick(i); setBroken(false); } }}
          initial=${{ opacity: 0, scale: 0 }} animate=${{ opacity: 1, scale: hot ? 1.25 : 1 }} transition=${{ duration: .45, ease: EASE, delay: pick === null ? delayFor(p.lv) : 0 }}>
          ${isLeaf && html`<title>${v[ix("category")]}${v[ix("seeded")] ? " (seeded)" : ""}</title>`}<//>`; })}
      <${motion.g} initial=${{ opacity: 0, y: -10 }} animate=${{ opacity: 1, y: 0 }} transition=${{ duration: .6, ease: EASE, delay: delayFor(0) + .9 }}>
        <rect x=${rootP.x + 30} y=${rootP.y - 15} width="170" height="30" rx="8" fill="rgba(59,91,253,.25)" stroke="rgba(142,197,255,.6)"/>
        <text x=${rootP.x + 42} y=${rootP.y + 5} fill="#cfe2ff" style=${{ font: '600 12.5px "JetBrains Mono"' }}>⛓ signed by building</text>
      <//>
      ${(stampOk || stampBad || batch.status === "Committed") && html`<${motion.g} initial=${{ opacity: 0, x: 60 }} animate=${{ opacity: 1, x: 0 }} transition=${{ duration: .7, ease: EASE, delay: delayFor(0) + 1.5 }}>
        <rect x=${rootP.x - 230} y=${rootP.y - 15} width="180" height="30" rx="8" fill=${batch.status === "Committed" ? "rgba(255,255,255,.06)" : "rgba(52,211,153,.18)"} stroke=${batch.status === "Committed" ? "rgba(255,255,255,.2)" : "rgba(52,211,153,.6)"}/>
        <text x=${rootP.x - 218} y=${rootP.y + 5} fill=${batch.status === "Committed" ? "rgba(255,255,255,.6)" : "#bdf5dc"} style=${{ font: '600 12.5px "JetBrains Mono"' }}>${batch.status === "Committed" ? "awaiting facility key" : "🔑 facility signed"}</text><//>`}
    </svg>
    ${(stampOk || stampBad) && html`<${motion.div} className="stamp" style=${{ color: stampOk ? "#34d399" : "#ff5c63", borderColor: stampOk ? "#34d399" : "#ff5c63", background: "rgba(0,0,0,.25)" }}
      initial=${{ opacity: 0, scale: 1.8, rotate: -12 }} animate=${{ opacity: 1, scale: 1, rotate: -6 }} transition=${{ type: "spring", stiffness: 300, damping: 18, delay: delayFor(0) + 2 }}>${stampOk ? "Verified · claimable once" : "Flagged · no claim"}<//>`}
    <div className="bar2">
      <div className="legend"><span><i style=${{ background: NODE_COLORS.ok }}></i>belongs</span><span><i style=${{ background: NODE_COLORS.bad }}></i>contamination</span>
        <span><i style=${{ background: NODE_COLORS.seeded }}></i>seeded neighbour</span><span><i style=${{ background: "#5b7cff" }}></i>sealed pair</span></div>
      <div style=${{ flex: 1 }}></div>
      ${pick === null ? html`<span>Click any item to trace its proof to the root.</span>`
        : html`<span style=${{ color: broken ? "#ff9ea2" : "#cfe2ff" }}>${broken ? "Changed one field: the path no longer reaches the root." : "This item's proof climbs to the signed root."}</span>
          <button className="btn alt" onClick=${() => setBroken(!broken)}>${broken ? "Undo" : "Tamper with it"}</button>`}
    </div>
  </div>`;
}

// "The Seal", in 3D: a cone of light. Items are orbs on the widest ring; each level up is a smaller ring;
// pairs fuse until one crystal remains at the apex: the root the building signs. Two key rings lock around it.
// Drag to spin. Click an orb to light its proof path. Falls back to the flat seal without WebGL.
export const hasGL = (() => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } })();
export let THREE_MODS = null;
export const loadThree = () => THREE_MODS ||= Promise.all([
  import("https://esm.sh/three@0.170.0"),
  import("https://esm.sh/three@0.170.0/examples/jsm/controls/OrbitControls.js"),
  import("https://esm.sh/three@0.170.0/examples/jsm/postprocessing/EffectComposer.js"),
  import("https://esm.sh/three@0.170.0/examples/jsm/postprocessing/RenderPass.js"),
  import("https://esm.sh/three@0.170.0/examples/jsm/postprocessing/UnrealBloomPass.js"),
  import("https://esm.sh/three@0.170.0/examples/jsm/postprocessing/OutputPass.js"),
]);

export function Seal3D({ batch, height = 520, onPick, pickProp, brokenProp, bare = false, chrome = true, onSealed }) {
  const mount = useRef(null); const api3 = useRef({}); const [tree, setTree] = useState(null);
  const [pickS, setPick] = useState(null); const [brokenS, setBroken] = useState(false); const [failed, setFailed] = useState(!hasGL); const [sealed, setSealed] = useState(false);
  const pick = pickProp !== undefined ? pickProp : pickS, broken = brokenProp !== undefined ? brokenProp : brokenS;
  const onSealedRef = useRef(); onSealedRef.current = onSealed;
  const pickCb = useRef(); pickCb.current = (i, v) => { if (onPick) onPick(i, v); else { setPick(i); setBroken(false); } };
  useEffect(() => { setTree(null); setPick(null); setBroken(false); setSealed(false);
    if (batch) api(`/api/batch/${batch.batchId}/tree`).then(setTree).catch(() => setTree(null)); }, [batch?.batchId]);

  useEffect(() => {
    if (!tree || failed || !mount.current) return;
    let disposed = false, raf, ro;
    loadThree().then(([THREE, { OrbitControls }, { EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }]) => {
      if (disposed) return;
      const el = mount.current, W = () => el.clientWidth, H = () => el.clientHeight;
      const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setSize(W(), H()); renderer.setClearColor(0x070d1c, 1);
      el.appendChild(renderer.domElement); renderer.domElement.className = "stage";
      const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x070d1c, .035);
      const camera = new THREE.PerspectiveCamera(42, W() / H(), .1, 200); camera.position.set(0, chrome ? 4.2 : 5.2, chrome ? 19.5 : 25);
      const controls = new OrbitControls(camera, renderer.domElement);
      Object.assign(controls, { enableDamping: true, dampingFactor: .06, enableZoom: false, enablePan: false, autoRotate: true, autoRotateSpeed: .55, minPolarAngle: .6, maxPolarAngle: 2.2 });
      controls.target.set(0, chrome ? 2.1 : 1.6, 0);
      const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
      const bloom = new UnrealBloomPass(new THREE.Vector2(W(), H()), 1.05, .55, .05); composer.addPass(bloom); composer.addPass(new OutputPass());

      // Layout: heap index -> ring position. Level 0 is the apex.
      const n = tree.tree.length, depth = Math.floor(Math.log2(n));
      const lvOf = (i) => Math.floor(Math.log2(i + 1));
      const at = (i) => { const lv = lvOf(i), k = i - (2 ** lv - 1), a = (k + .5) / 2 ** lv * Math.PI * 2;
        const r = lv === 0 ? 0 : .9 + (lv / depth) ** 1.15 * 6.2, y = 6.2 - lv * (8.4 / depth);
        return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r); };
      const leafOf = Object.fromEntries(tree.leaves.map((l) => [l.treeIndex, l.value]));
      const ix = (f) => tree.fields.indexOf(f);
      const colorOf = (i) => { const v = leafOf[i]; if (!v) return i === 0 ? 0xffffff : 0x5b7cff;
        if (v[ix("contaminated")]) return 0xff4d5a; return v[ix("seeded")] ? 0x6b7a99 : 0x2ee6a1; };

      const nodes = [], lines = [];
      const sphere = new THREE.SphereGeometry(1, 24, 16);
      for (let i = 0; i < n; i++) {
        const leaf = leafOf[i] !== undefined;
        const mat = new THREE.MeshBasicMaterial({ color: colorOf(i), transparent: true, opacity: 0 });
        const m = new THREE.Mesh(i === 0 ? new THREE.IcosahedronGeometry(1, 0) : sphere, mat);
        m.position.copy(at(i)); const base = i === 0 ? .62 : leaf ? .2 : .11; m.scale.setScalar(.001);
        m.userData = { i, base, leaf, lv: lvOf(i) }; scene.add(m); nodes.push(m);
        if (i > 0) { const pg = new THREE.BufferGeometry().setFromPoints([at(i), at((i - 1) >> 1)]);
          const lm = new THREE.LineBasicMaterial({ color: 0x4a6bff, transparent: true, opacity: 0 });
          const l = new THREE.Line(pg, lm); l.userData = { i, lv: lvOf(i) }; scene.add(l); lines[i] = l; }
      }
      // The crystal's wireframe shell and the two key rings.
      const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.05, 1), new THREE.MeshBasicMaterial({ color: 0x8ec5ff, wireframe: true, transparent: true, opacity: 0 }));
      shell.position.copy(at(0)); scene.add(shell);
      const ring = (color) => { const t = new THREE.Mesh(new THREE.TorusGeometry(1.5, .035, 12, 120), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 })); t.position.copy(at(0)); scene.add(t); return t; };
      const ringB = ring(0x5b7cff), verified = batch.status === "Verified";
      const ringF = ring(batch.status === "Committed" ? 0x5b6a85 : verified ? 0x2ee6a1 : 0xff4d5a);
      // A faint floor ring of dust for depth.
      const dust = new THREE.BufferGeometry(); const pts = [];
      for (let k = 0; k < 900; k++) { const a = Math.random() * 6.283, r = 3 + Math.random() * 9; pts.push(Math.cos(a) * r, -3.4 + Math.random() * 11, Math.sin(a) * r); }
      dust.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      scene.add(new THREE.Points(dust, new THREE.PointsMaterial({ color: 0x6f8cff, size: .03, transparent: true, opacity: .55 })));
      if (!chrome) { const sg = new THREE.BufferGeometry(), sp = [];
        for (let k = 0; k < 2200; k++) { const u = Math.random() * 2 - 1, a = Math.random() * 6.283, rr = 45 + Math.random() * 40, q = Math.sqrt(1 - u * u);
          sp.push(Math.cos(a) * q * rr, u * rr, Math.sin(a) * q * rr); }
        sg.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
        scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfe0ff, size: .12, sizeAttenuation: true, transparent: true, opacity: .7 }))); renderer.setClearColor(0x050915, 1); scene.fog = new THREE.FogExp2(0x050915, .022); }

      const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
      const start = performance.now(); let highlight = new Set(), brokenNow = false;
      api3.current.setPath = (leafIdx, isBroken) => { highlight = new Set(); brokenNow = isBroken;
        if (leafIdx !== null) { let i = leafIdx; while (i > 0) { highlight.add(i); i = (i - 1) >> 1; } highlight.add(0); } };
      const ray = new THREE.Raycaster(); const mouse = new THREE.Vector2(); let down = null;
      renderer.domElement.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
      renderer.domElement.addEventListener("pointerup", (e) => {
        if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
        const r = renderer.domElement.getBoundingClientRect(); mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
        // Pick the leaf nearest the click on screen (within ~30px), so small turning orbs are easy to hit.
        let best = null, bestD = 30;
        for (const m of nodes) { if (!m.userData.leaf) continue; const v = m.position.clone().project(camera);
          const d = Math.hypot((v.x + 1) / 2 * r.width - (e.clientX - r.left), (1 - v.y) / 2 * r.height - (e.clientY - r.top));
          if (d < bestD) { bestD = d; best = m; } }
        if (best) pickCb.current(best.userData.i, leafOf[best.userData.i]);
      });

      const tick = (now) => {
        const t = (now - start) / 1000;
        const levelT = (lv) => (depth - lv) * .32 + .2;            // leaves first, apex last
        const sealT = levelT(0) + .5;
        nodes.forEach((m) => { const { lv, base, i } = m.userData; const k = ease((t - levelT(lv)) / .6);
          const hot = highlight.has(i); const pulse = i === 0 ? 1 + Math.sin(t * 2.2) * .06 : 1;
          m.scale.setScalar(Math.max(.001, base * k * pulse * (hot ? 1.6 : 1)));
          m.material.opacity = k; if (hot && brokenNow && m.userData.leaf) m.material.color.setHex(0xff4d5a); else m.material.color.setHex(colorOf(i));
          if (i === 0) { m.rotation.y = t * .6; m.rotation.x = t * .25; } });
        lines.forEach((l) => { if (!l) return; const { lv, i } = l.userData; const k = ease((t - levelT(lv) - .25) / .6);
          const on = highlight.has(i) && highlight.has((i - 1) >> 1);
          l.material.opacity = on ? 1 : k * .32; l.material.color.setHex(on ? (brokenNow ? 0xff4d5a : 0xbfe0ff) : 0x4a6bff); });
        const s = ease((t - sealT) / .8); shell.material.opacity = s * .55; shell.rotation.y = -t * .4; shell.scale.setScalar(1 + (1 - s) * 1.5);
        const rb = ease((t - sealT - .4) / 1.1), rf = ease((t - sealT - 1.1) / 1.1);
        ringB.material.opacity = rb; ringB.position.y = at(0).y + (1 - rb) * 4; ringB.rotation.x = Math.PI / 2 + Math.sin(t * .8) * .25; ringB.rotation.z = t * .5;
        ringF.material.opacity = rf; ringF.position.y = at(0).y + (1 - rf) * 4; ringF.rotation.x = Math.PI / 2.6 + Math.cos(t * .7) * .3; ringF.rotation.y = t * .6; ringF.scale.setScalar(1.18);
        if (!sealed && t > sealT + 2.2) { setSealed(true); onSealedRef.current?.(); }
        bloom.strength = 1.05 + Math.max(0, 1 - Math.abs(t - sealT - .3) * 2) * 1.2;   // a flare when the root ignites
        controls.update(); composer.render(); raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      ro = new ResizeObserver(() => { renderer.setSize(W(), H()); composer.setSize(W(), H()); camera.aspect = W() / H(); camera.updateProjectionMatrix(); });
      ro.observe(el);
      api3.current.cleanup = () => { cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose(); el.innerHTML = ""; };
    }).catch(() => setFailed(true));
    return () => { disposed = true; api3.current.cleanup?.(); };
  }, [tree, failed]);

  useEffect(() => { api3.current.setPath?.(pick, broken); }, [pick, broken]);
  if (failed) return html`<${Seal} batch=${batch}/>`;
  if (!batch) return html`<div className="seal"><div style=${{ padding: 40, textAlign: "center", color: "rgba(255,255,255,.7)" }}>Commit a pickup to watch it get sealed.</div></div>`;
  const ok = batch.status === "Verified", bad = batch.status === "Flagged";
  if (!chrome) return html`<div ref=${mount} style=${{ position: "absolute", inset: 0 }}></div>`;
  return html`<div className="seal3d">
    <div ref=${mount} style=${{ width: "100%", height }}></div>
    <div className="hud"><b>${tree ? `Pickup #${tree.number} · ${tree.leaves.length} items sealed into one fingerprint` : "Loading the sealed pickup…"}</b>${tree && html`<span>root ${short(tree.root)}</span>`}</div>
    <${AnimatePresence}>${sealed && (ok || bad) && html`<${motion.div} className="stamp" style=${{ position: "absolute", right: 22, top: 20, color: ok ? "#2ee6a1" : "#ff4d5a", borderColor: ok ? "#2ee6a1" : "#ff4d5a", background: "rgba(0,0,0,.35)", font: '800 15px "Inter Tight"', letterSpacing: ".08em", textTransform: "uppercase", padding: "8px 14px", borderRadius: 10, border: "2px solid" }}
      initial=${{ opacity: 0, scale: 1.8, rotate: -12 }} animate=${{ opacity: 1, scale: 1, rotate: -6 }} transition=${{ type: "spring", stiffness: 300, damping: 18 }}>${ok ? "Verified · claimable once" : "Flagged · no claim"}<//>`}<//>
    ${pick === null && html`<div className="hint3d" style=${{ bottom: bare ? 22 : 76 }}>Drag to spin · click an orb to open its receipt</div>`}
    ${!bare && html`<div className="bar2" style=${{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,.08)", fontSize: 14, color: "rgba(255,255,255,.75)" }}>
      <div className="legend" style=${{ display: "flex", gap: 14, flexWrap: "wrap" }}>${[["#2ee6a1", "belongs"], ["#ff4d5a", "contamination"], ["#6b7a99", "seeded neighbour"], ["#5b7cff", "sealed pair"], ["#ffffff", "root"]].map(([c, t]) => html`<span key=${t} style=${{ display: "inline-flex", gap: 6, alignItems: "center" }}><i style=${{ width: 9, height: 9, borderRadius: "50%", display: "inline-block", background: c, boxShadow: `0 0 8px ${c}` }}></i>${t}</span>`)}</div>
      <div style=${{ flex: 1 }}></div>
      ${pick !== null && html`<span style=${{ color: broken ? "#ff9ea2" : "#cfe2ff" }}>${broken ? "Changed one field: the path no longer reaches the root." : "This item's proof climbs to the signed root."}</span>
        <button className="btn alt" style=${{ color: "#fff", borderColor: "rgba(255,255,255,.25)", padding: "8px 14px", fontSize: 14 }} onClick=${() => setBroken(!broken)}>${broken ? "Undo" : "Tamper with it"}</button>`}
    </div>`}
  </div>`;
}

// "The Bale": a recycling pickup pressed like a bale at the plant. Every item drops into a clear bin as a
// matte block (real physics; push the pile with the cursor), the press packs them into one block, pairs landing
// together as in the tree, then a tag with the root and two straps: the building's and the facility's.
// Click a block to pull it out like a Jenga piece and open its receipt; tamper and it greys out and strap 1 snaps.
export let BALE_MODS = null;
export const loadBale = () => BALE_MODS ||= Promise.all([
  import("https://esm.sh/three@0.170.0"),
  import("https://esm.sh/three@0.170.0/examples/jsm/controls/OrbitControls.js"),
  import("https://esm.sh/three@0.170.0/examples/jsm/geometries/RoundedBoxGeometry.js"),
  import("https://esm.sh/three@0.170.0/examples/jsm/environments/RoomEnvironment.js"),
  import("https://esm.sh/cannon-es@0.20.0"),
]);

export function Bale3D({ batch, onPick, pickProp, brokenProp, onSealed }) {
  const mount = useRef(null); const ctl = useRef({}); const [tree, setTree] = useState(null); const [failed, setFailed] = useState(!hasGL);
  const pickCb = useRef(); pickCb.current = onPick; const sealedCb = useRef(); sealedCb.current = onSealed;
  useEffect(() => { setTree(null); if (batch) api(`/api/batch/${batch.batchId}/tree`).then(setTree).catch(() => setTree(null)); }, [batch?.batchId]);
  useEffect(() => {
    if (!tree || failed || !mount.current) return;
    let disposed = false, raf, ro;
    loadBale().then(([THREE, { OrbitControls }, { RoundedBoxGeometry }, { RoomEnvironment }, CANNON]) => {
      if (disposed) return;
      const el = mount.current, W = () => el.clientWidth, H = () => el.clientHeight;
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setSize(W(), H());
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      el.appendChild(renderer.domElement); renderer.domElement.style.cursor = "grab";
      const scene = new THREE.Scene(); scene.background = new THREE.Color(0x16181d);
      const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture;
      const camera = new THREE.PerspectiveCamera(25, W() / H(), .1, 200); camera.position.set(16, 13, 26);
      const controls = new OrbitControls(camera, renderer.domElement);
      Object.assign(controls, { enableDamping: true, dampingFactor: .07, enableZoom: false, enablePan: false, autoRotate: true, autoRotateSpeed: .35, minPolarAngle: .35, maxPolarAngle: 1.45 });
      controls.target.set(0, Math.min(9, (5.2 + tree.leaves.length * 1.08 + 2) / 2), 0);
      const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(6, 14, 8); sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 }); sun.shadow.radius = 6; scene.add(sun);
      scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x20232b, .5));
      const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ color: 0x1d2027, roughness: 1 }));
      floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

      // The data: leaves in tree order, so siblings sit side by side in the bale.
      const ix = (f) => tree.fields.indexOf(f);
      const leaves = tree.leaves.slice().sort((a, b) => a.treeIndex - b.treeIndex);
      const n = leaves.length, NX = 4, NZ = 3, NY = Math.ceil(n / (NX * NZ)), S = 1, GAP = .04;
      const kind = (v) => v[ix("contaminated")] ? 0xd9534b : v[ix("seeded")] ? 0x737d93 : 0x3cbf86;
      const slot = (k) => { const x = k % NX, z = Math.floor(k / NX) % NZ, y = Math.floor(k / (NX * NZ));
        return new THREE.Vector3((x - (NX - 1) / 2) * (S + GAP), .5 + y * (S + GAP), (z - (NZ - 1) / 2) * (S + GAP)); };

      // The clear bin.
      const BW = 5.2, BD = 4.2, BH = 3.6;
      const glass = new THREE.MeshStandardMaterial({ color: 0xbfd0ff, transparent: true, opacity: .07, roughness: .1, metalness: 0, depthWrite: false });
      const binGroup = new THREE.Group(); scene.add(binGroup);
      [[BW, BH, .04, 0, BH / 2, BD / 2], [BW, BH, .04, 0, BH / 2, -BD / 2], [.04, BH, BD, BW / 2, BH / 2, 0], [.04, BH, BD, -BW / 2, BH / 2, 0]].forEach(([w, h, d, x, y, z]) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glass); m.position.set(x, y, z); binGroup.add(m);
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: 0x9fb4ff, transparent: true, opacity: .35 })); e.position.copy(m.position); binGroup.add(e); });

      const SH = .72, TOP = 5.2 + n * 1.08 + 2;
      [[SH * 2, TOP - BH, .04, 0, (TOP + BH) / 2, SH], [SH * 2, TOP - BH, .04, 0, (TOP + BH) / 2, -SH], [.04, TOP - BH, SH * 2, SH, (TOP + BH) / 2, 0], [.04, TOP - BH, SH * 2, -SH, (TOP + BH) / 2, 0]].forEach(([w, h, d, x, y, z]) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glass); m.position.set(x, y, z); binGroup.add(m); });
      for (let fy = BH + 1.6, fl = 1; fy < TOP; fy += 2.2, fl++) {
        const door = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(SH * 2 + .2, .5, SH * 2 + .2)), new THREE.LineBasicMaterial({ color: 0x9fb4ff, transparent: true, opacity: .55 }));
        door.position.set(0, fy, 0); binGroup.add(door); }
      // Physics.
      const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -14, 0) }); world.allowSleep = true;
      const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() }); ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0); world.addBody(ground);
      [[BW / 2, BH, .1, 0, BH, BD / 2 + .1], [BW / 2, BH, .1, 0, BH, -BD / 2 - .1], [.1, BH, BD / 2, BW / 2 + .1, BH, 0], [.1, BH, BD / 2, -BW / 2 - .1, BH, 0]].forEach(([x, y, z, px, py, pz]) => {
        const b = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(x, y, z)) }); b.position.set(px, py, pz); world.addBody(b); });
      [[SH + .1, (TOP - BH) / 2, .05, 0, (TOP + BH) / 2, SH + .05], [SH + .1, (TOP - BH) / 2, .05, 0, (TOP + BH) / 2, -SH - .05], [.05, (TOP - BH) / 2, SH + .1, SH + .05, (TOP + BH) / 2, 0], [.05, (TOP - BH) / 2, SH + .1, -SH - .05, (TOP + BH) / 2, 0]].forEach(([x, y, z, px, py, pz]) => {
        const b = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(x, y, z)) }); b.position.set(px, py, pz); world.addBody(b); });
      const pusher = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, shape: new CANNON.Sphere(.7) }); pusher.position.set(0, -10, 0); world.addBody(pusher);

      const geo = new RoundedBoxGeometry(S, S, S, 4, .12);
      const mat = new THREE.MeshStandardMaterial({ roughness: .62, metalness: 0, envMapIntensity: .6 });
      const mesh = new THREE.InstancedMesh(geo, mat, n); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
      const bodies = leaves.map((l, k) => { const b = new CANNON.Body({ mass: 1, shape: new CANNON.Box(new CANNON.Vec3(.5, .5, .5)), linearDamping: .05, angularDamping: .1 });
        b.position.set(Math.sin(k * 1.7) * .12, 5.2 + k * 1.08, Math.cos(k * 1.3) * .12); b.quaternion.setFromEuler(k * .7, k * 1.3, k * .4);
        b.sleepSpeedLimit = .2; world.addBody(b); mesh.setColorAt(k, new THREE.Color(kind(l.value))); return b; });
      mesh.instanceColor.needsUpdate = true;

      // Press plate, straps and tag (hidden until the press).
      const block = new THREE.Vector3(NX * (S + GAP), NY * (S + GAP), NZ * (S + GAP));
      const plate = new THREE.Mesh(new THREE.BoxGeometry(block.x + .5, .25, block.z + .5), new THREE.MeshStandardMaterial({ color: 0x3a3f4b, roughness: .4, metalness: .6 }));
      plate.castShadow = true; plate.position.y = 9; plate.visible = false; scene.add(plate);
      const strap = (color, along) => { const g = new THREE.Group(); const m = new THREE.MeshStandardMaterial({ color, roughness: .45 });
        const w = .22, t = .03, X = block.x / 2 + t, Y = block.y, Z = block.z / 2 + t;
        const parts = along === "x" ? [[block.x + 2 * t, t, w, 0, Y + t / 2, 0], [block.x + 2 * t, t, w, 0, -t / 2 + .0, 0], [t, Y + t, w, X, Y / 2, 0], [t, Y + t, w, -X, Y / 2, 0]]
                                    : [[w, t, block.z + 2 * t, 0, Y + t / 2, 0], [w, t, block.z + 2 * t, 0, -t / 2, 0], [w, Y + t, t, 0, Y / 2, Z], [w, Y + t, t, 0, Y / 2, -Z]];
        parts.forEach(([a, b, c, x, y, z]) => { const p = new THREE.Mesh(new THREE.BoxGeometry(a, b, c), m); p.position.set(x, y, z); p.castShadow = true; g.add(p); });
        g.scale.set(.001, .001, .001); g.visible = false; scene.add(g); return g; };
      const facilityColor = batch.status === "Verified" ? 0x2fbf7f : batch.status === "Flagged" ? 0xd9534b : 0x6b7280;
      const strapB = strap(0x3b5bfd, "x"), strapF = strap(facilityColor, "z");
      const tagCanvas = document.createElement("canvas"); tagCanvas.width = 512; tagCanvas.height = 300; const tg = tagCanvas.getContext("2d");
      tg.fillStyle = "#efe7d6"; tg.fillRect(0, 0, 512, 300); tg.fillStyle = "#1f2430"; tg.font = "600 34px Georgia"; tg.fillText(`Pickup #${tree.number}`, 34, 70);
      tg.font = "22px monospace"; tg.fillText("ROOT", 34, 130); tg.font = "bold 26px monospace"; tg.fillText(tree.root.slice(0, 18), 34, 168); tg.fillText(tree.root.slice(18, 36), 34, 202);
      tg.font = "20px Georgia"; tg.fillText(`${n} items · one fingerprint`, 34, 262);
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(1.5, .88), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(tagCanvas), roughness: .9, side: THREE.DoubleSide }));
      tag.position.set(block.x / 2 - .9, block.y * .55, block.z / 2 + .06); tag.rotation.z = -.08; tag.visible = false; tag.castShadow = true; scene.add(tag);

      const ease = (x) => { x = Math.min(1, Math.max(0, x)); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
      const dummy = new THREE.Object3D(), start = performance.now(); let phase = "drop", pressAt = 0, sealedSent = false;
      const from = [], fromQ = []; const DROP = 3.2 + n * .2; const camFrom = new THREE.Vector3(), tgtFrom = new THREE.Vector3();
      let picked = null, brokenNow = false;
      ctl.current.set = (treeIndex, broken) => { picked = treeIndex === null ? null : leaves.findIndex((l) => l.treeIndex === treeIndex); brokenNow = broken; };
      // Cursor: push the pile during the drop; click a block afterwards.
      const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.2), hitP = new THREE.Vector3();
      const toNdc = (e) => { const r = renderer.domElement.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); };
      renderer.domElement.addEventListener("pointermove", (e) => { if (phase !== "drop") return; toNdc(e); ray.setFromCamera(ndc, camera);
        if (ray.ray.intersectPlane(plane, hitP)) pusher.position.set(hitP.x, 1.2, hitP.z); });
      let down = null;
      renderer.domElement.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
      renderer.domElement.addEventListener("pointerup", (e) => { if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 || phase === "drop") return;
        // Nearest block centre on screen within ~45px: forgiving while the bale turns.
        const r = renderer.domElement.getBoundingClientRect(); let best = -1, bestD = 45;
        leaves.forEach((l, k) => { const v = slot(k).clone(); if (picked === k) v.z += 1.05; v.project(camera);
          const d = Math.hypot((v.x + 1) / 2 * r.width - (e.clientX - r.left), (1 - v.y) / 2 * r.height - (e.clientY - r.top)); if (d < bestD) { bestD = d; best = k; } });
        if (best >= 0) pickCb.current?.(leaves[best].treeIndex, leaves[best].value); });

      const tick = (now) => {
        const t = (now - start) / 1000;
        if (phase === "drop") {
          world.fixedStep(1 / 60);
          bodies.forEach((b, k) => { dummy.position.copy(b.position); dummy.quaternion.copy(b.quaternion); dummy.scale.setScalar(1); dummy.updateMatrix(); mesh.setMatrixAt(k, dummy.matrix); });
          if (t > DROP) { phase = "press"; pressAt = t; pusher.position.set(0, -10, 0);
            bodies.forEach((b, k) => { from[k] = new THREE.Vector3().copy(b.position); fromQ[k] = new THREE.Quaternion().copy(b.quaternion); });
            binGroup.children.forEach((c) => { c.userData.o = c.material.opacity; }); camFrom.copy(camera.position); tgtFrom.copy(controls.target); }
        } else {
          const p = t - pressAt;
          if (p < 1.6) { const e = ease(p / 1.6); controls.target.lerpVectors(tgtFrom, new THREE.Vector3(0, 1.4, 0), e);
            camera.position.lerpVectors(camFrom, new THREE.Vector3(10.5, 8.2, 14.5), e); }
          bodies.forEach((b, k) => { const pairDelay = (k >> 1) * .045; const e = ease((p - pairDelay) / .9);
            dummy.position.lerpVectors(from[k], slot(k), e); dummy.quaternion.slerpQuaternions(fromQ[k], new THREE.Quaternion(), e);
            if (picked === k) { const out = Math.min(1, (p - 4.2) > 0 ? 1 : 0) ; dummy.position.z += 1.05; }
            dummy.scale.setScalar(1); dummy.updateMatrix(); mesh.setMatrixAt(k, dummy.matrix);
            const c = picked === k && brokenNow ? 0x555b66 : kind(leaves[k].value); mesh.setColorAt(k, new THREE.Color(c)); });
          mesh.instanceColor.needsUpdate = true;
          const settle = .9 + (n >> 1) * .045;
          // The press: the plate comes down, the block squashes, the plate lifts away.
          const pd = p - settle; plate.visible = pd > -.6 && pd < 2.2;
          plate.position.y = pd < 0 ? 9 + pd * (9 - block.y - .2) / .6 : pd < .5 ? block.y + .2 : block.y + .2 + ease((pd - .5) / 1.2) * 9;
          const squash = pd > 0 && pd < .5 ? .93 + Math.abs(Math.sin(pd / .5 * Math.PI)) * -.0 : 1;
          mesh.scale.y = pd > 0 && pd < .35 ? .93 : 1; mesh.position.y = 0;
          binGroup.children.forEach((c) => { c.material.opacity = (c.userData.o ?? c.material.opacity) * (1 - ease((pd - .3) / 1)); });
          const tg2 = ease((pd - 1.1) / .6); tag.visible = tg2 > 0; tag.scale.setScalar(Math.max(.001, tg2));
          const sb = ease((pd - 1.6) / .7), sf = ease((pd - 2.4) / .7);
          const snap = brokenNow && picked !== null;
          strapB.visible = sb > 0; strapB.scale.set(Math.max(.001, sb), 1, 1); if (snap) { strapB.rotation.z = Math.sin(t * 20) * .02; strapB.children.forEach((c, j) => { c.visible = j !== 0; }); } else { strapB.rotation.z = 0; strapB.children.forEach((c) => { c.visible = true; }); }
          strapF.visible = sf > 0; strapF.scale.set(1, 1, Math.max(.001, sf));
          if (!sealedSent && pd > 3.2) { sealedSent = true; sealedCb.current?.(); }
        }
        mesh.instanceMatrix.needsUpdate = true; controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      ro = new ResizeObserver(() => { renderer.setSize(W(), H()); camera.aspect = W() / H(); camera.updateProjectionMatrix(); }); ro.observe(el);
      ctl.current.cleanup = () => { cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose(); pm.dispose(); el.innerHTML = ""; };
    }).catch((e) => { console.error(e); setFailed(true); });
    return () => { disposed = true; ctl.current.cleanup?.(); };
  }, [tree, failed]);
  useEffect(() => { ctl.current.set?.(pickProp ?? null, !!brokenProp); }, [pickProp, brokenProp, tree]);
  if (failed) return html`<${Seal3D} batch=${batch} chrome=${false} onPick=${onPick} pickProp=${pickProp} brokenProp=${brokenProp} onSealed=${onSealed}/>`;
  return html`<div ref=${mount} style=${{ position: "absolute", inset: 0 }}></div>`;
}

// The Seal as its own world, like Remembrance's Memory Garden: full screen, no site chrome, its own type.
export function SealSandbox({ state, exit }) {
  const pickups = state.batches.slice().reverse();
  const [sel, setSel] = useState(null);
  const batch = pickups.find((b) => b.batchId === sel) || pickups.find((b) => b.status === "Verified") || pickups[0];
  const [item, setItem] = useState(null); const [receipt, setReceipt] = useState(null); const [tampered, setTampered] = useState(false);
  const [result, setResult] = useState(null); const [busy, setBusy] = useState(false); const [sealed, setSealed] = useState(false);
  useEffect(() => { setItem(null); setReceipt(null); setResult(null); setTampered(false); setSealed(false); }, [batch?.batchId]);
  useEffect(() => { const k = (e) => { if (e.key === "Escape") { if (item) setItem(null); else exit(); } }; addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [item]);
  const onPick = async (i, v) => { setItem({ i, v }); setTampered(false); setResult(null); setReceipt(null);
    try { setReceipt(await api(`/api/receipt/${v[0]}`)); } catch { setReceipt(null); } };
  const verify = async () => { if (!receipt) return; setBusy(true);
    const values = receipt.values.slice(); if (tampered) values[4] = !values[4];
    try { setResult({ ...(await api("/api/verify", { batchId: receipt.batchId, values, proof: receipt.proof })), t: Date.now() }); }
    catch (e) { setResult({ ok: false, error: e.message, t: Date.now() }); } setBusy(false); };
  const F = receipt?.leafFields || []; const val = (f) => receipt?.values[F.indexOf(f)];
  const shownContaminated = receipt ? (tampered ? !val("contaminated") : val("contaminated")) : null;
  const ok = batch?.status === "Verified", bad = batch?.status === "Flagged";
  return html`<${motion.div} className="sandbox" initial=${false} exit=${{ opacity: 0 }} transition=${{ duration: .45, ease: EASE }}>
    ${batch ? html`<${Bale3D} key=${batch.batchId} batch=${batch} onPick=${onPick} pickProp=${item ? item.i : null} brokenProp=${!!(result && !result.ok)} onSealed=${() => setSealed(true)}/>`
      : html`<div style=${{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}><p className="serif" style=${{ fontSize: 34 }}>Nothing sealed yet.</p></div>`}
    <div className="vignette"></div>
    <div className="corner" style=${{ left: 26, top: 22 }}><button className="ghost" onClick=${exit}>← BinProof</button></div>
    <div className="corner" style=${{ right: 26, top: 22 }}>${pickups.map((b) => html`<button key=${b.batchId} className=${"ghost" + (b.batchId === batch?.batchId ? " on" : "")} onClick=${() => setSel(b.batchId)}>
      Pickup #${b.number} · ${b.status}</button>`)}</div>
    ${batch && html`<${motion.div} key=${"t" + batch.batchId} style=${{ position: "absolute", left: 34, bottom: 40, zIndex: 5, pointerEvents: "none" }}
      initial=${{ opacity: 0, y: 14 }} animate=${{ opacity: 1, y: 0 }} transition=${{ duration: 1, ease: EASE, delay: .4 }}>
      <div className="serif" style=${{ fontSize: 64, lineHeight: 1 }}>Pickup #${batch.number}, sealed.</div>
      <div style=${{ marginTop: 10, fontSize: 17, color: "rgba(234,240,255,.7)" }}>${batch.items} recycling drops down the chute, pressed into one fingerprint. Strapped by the building, then the facility.</div>
      <div className="mono" style=${{ marginTop: 6, color: "rgba(234,240,255,.45)" }}>root ${short(batch.root)}</div><//>`}
    <${AnimatePresence}>${sealed && (ok || bad) && html`<${motion.div} key="stamp" style=${{ position: "absolute", left: "50%", top: 26, zIndex: 5, translateX: "-50%",
        color: ok ? "#7ff5c7" : "#ff9aa1", border: `2px solid ${ok ? "#2ee6a1" : "#ff4d5a"}`, borderRadius: 12, padding: "8px 16px", font: '800 14px "Inter Tight"', letterSpacing: ".1em", textTransform: "uppercase", background: "rgba(0,0,0,.3)" }}
      initial=${{ opacity: 0, scale: 1.8, rotate: -10 }} animate=${{ opacity: 1, scale: 1, rotate: -3 }} transition=${{ type: "spring", stiffness: 300, damping: 18 }}>${ok ? "Verified by the facility · claimable once" : "Flagged by the facility · no claim"}<//>`}<//>
    ${!item && html`<div style=${{ position: "absolute", left: "50%", bottom: 34, transform: "translateX(-50%)", zIndex: 5, fontSize: 14, color: "rgba(234,240,255,.55)", pointerEvents: "none" }}>Watch the chute pour · drag to turn · click a block to pull it out · Esc to leave</div>`}
    <${AnimatePresence}>${item && html`<${motion.div} key="glass" className="glass" initial=${{ opacity: 0, x: 40 }} animate=${{ opacity: 1, x: 0 }} exit=${{ opacity: 0, x: 40 }} transition=${{ duration: .55, ease: EASE }}>
      <div style=${{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span className="serif" style=${{ fontSize: 30 }}>The receipt</span>
        <button className="ghost" style=${{ padding: "5px 11px" }} onClick=${() => setItem(null)}>✕</button></div>
      ${!receipt ? html`<p style=${{ color: "rgba(234,240,255,.6)" }}>Opening…</p>` : html`<div>
        <div className="k">Item</div><div className="v" style=${{ fontWeight: 700, fontSize: 20 }}>${val("category")}${val("seeded") ? html`<span className="tag" style=${{ color: "rgba(234,240,255,.6)", borderColor: "rgba(255,255,255,.2)" }}>seeded</span>` : null}</div>
        <div className="k" style=${{ color: tampered ? "#ff9aa1" : undefined }}>Belongs in recycling${tampered ? " · changed" : ""}</div>
        <div className="v"><span className=${"pill " + (shownContaminated ? "bad" : "ok")}>${shownContaminated ? "No, contamination" : "Yes"}</span></div>
        <div className="k">AI confidence</div><div className="v mono">${(val("confidenceBps") / 100).toFixed(0)}% · ${val("model")}</div>
        <div className="k">Photo fingerprint</div><div className="v mono">${short(val("imageSha256"))}</div>
        <div className="k">Unit, scrambled</div><div className="v mono">${short(val("unitTag"))}</div>
        <div className="k">Proof</div><div className="v mono">${receipt.proof.length} hashes up to the root</div>
        <div className="row"><button className="btn green" id="sealVerify" disabled=${busy} onClick=${verify}>Verify on chain</button>
          <button className="btn alt" id="sealTamper" onClick=${() => { setTampered(!tampered); setResult(null); }}>${tampered ? "Undo" : "Tamper with it"}</button></div>
        <${AnimatePresence} mode="wait">${result && html`<${motion.div} key=${result.t} className=${"verdict " + (result.ok ? "ok" : "bad")} style=${{ marginTop: 14 }}
          initial=${{ opacity: 0, scale: .95 }} animate=${result.ok ? { opacity: 1, scale: 1 } : { opacity: 1, scale: 1, x: [0, -10, 10, -6, 6, 0] }} transition=${{ duration: .5 }}>
          <div className="badge"><${Icon} kind=${result.ok ? "ok" : "bad"}/></div>
          <div><b>${result.ok ? "The contract says yes" : "The contract says no"}</b><small>${result.ok ? "This exact item is inside the root the building signed." : "With one field changed, the proof no longer reaches the signed root."}</small></div><//>`}<//>
      </div>`}<//>`}<//>
  <//>`;
}
