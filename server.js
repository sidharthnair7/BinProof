// BinProof web server: the bin camera, the building's pickups, the facility's measurement, and a
// verify page anyone can use.
// Settings come from the host's environment, or a local .env for a testnet run. The one-command
// local demo (scripts/start.js) sets BINPROOF_LOCAL so a .env never points it at a testnet.
if (!process.env.BINPROOF_LOCAL) { try { process.loadEnvFile(); } catch { /* no .env: fine */ } }
const path = require("path");
const express = require("express");
const vision = require("./src/vision");
const ledger = require("./src/ledger");
const chain = require("./src/chain");

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "8mb" }));
app.use(express.static(path.join(__dirname, "frontend")));

// The hosted demo is public and runs on free quotas: a simple per-IP limit on the calls that
// spend them (vision quota, testnet gas).
const hits = new Map();
function limit(perMinute) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path.split("/")[2]}`;
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < 60_000);
    if (recent.length >= perMinute) return res.status(429).json({ error: "slow down a little: try again in a minute" });
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}
app.use(["/api/dispose", "/api/pickup", "/api/facility", "/api/claim"], limit(8));

const wrap = (fn) => (req, res) => fn(req, res).catch((err) =>
  res.status(400).json({ error: chain.errorName(err) }));

app.get("/api/state", wrap(async (_req, res) => {
  const d = chain.deployment();
  const c = d && (await chain.contractAs());
  const batches = await Promise.all(ledger.batches().map(async (b) => {
    const on = c ? await c.batches(b.batchId) : null;
    return {
      number: b.number, batchId: b.batchId, root: b.root, items: b.items, contaminated: b.contaminated,
      seeded: b.seeded, model: b.model, tx: b.tx,
      binPct: b.items ? (100 * b.contaminated) / b.items : 0,
      status: on ? chain.STATUS[Number(on.status)] : "Not on chain",
      facilityPct: on && Number(on.status) >= 2 ? Number(on.facilityBps) / 100 : null,
      claimed: on ? on.claimed : false,
    };
  }));
  res.json({ deployment: d, model: vision.MODEL, onDevice: vision.PROVIDER !== "gemini",
    events: ledger.events().slice(-60).reverse(), batches });
}));

// The bin: a photo comes in, the verdict and a receipt id go out. The photo stays on this device.
app.post("/api/dispose", wrap(async (req, res) => {
  const { unit, image } = req.body;
  if (!unit || !image) throw new Error("unit and image are required");
  const b64 = image.replace(/^data:image\/\w+;base64,/, "");
  const imageSha256 = ledger.saveImage(b64, vision.PROVIDER !== "gemini");
  const verdict = await vision.classify(b64);
  const event = ledger.addEvent({ unit: String(unit).slice(0, 20), imageSha256, verdict });
  res.json({ event, verdict });
}));

// A person settles low-confidence verdicts before they can count against anyone.
app.post("/api/review/:eventId", wrap(async (req, res) => {
  res.json(ledger.review(req.params.eventId, Boolean(req.body.contaminated)));
}));

// Pickup: close open events into a batch and commit its Merkle root, signed by the building.
app.post("/api/pickup", wrap(async (_req, res) => {
  const batch = ledger.closeBatch();
  const c = await chain.contractAs("building");
  const tx = await c.commitBatch(batch.batchId, batch.root, batch.items, batch.contaminated, chain.modelId(batch.model));
  await tx.wait();
  res.json(ledger.updateBatch(batch.batchId, { tx: { commit: tx.hash } }));
}));

// The facility reports what it measured, signed with its own key. The contract decides.
app.post("/api/facility/:batchId", wrap(async (req, res) => {
  const pct = Number(req.body.contaminationPct);
  if (!(pct >= 0 && pct <= 100)) throw new Error("contamination % must be between 0 and 100");
  const c = await chain.contractAs("facility");
  const tx = await c.reportMeasurement(req.params.batchId, Math.round(pct * 100));
  await tx.wait();
  ledger.updateBatch(req.params.batchId, { tx: { measurement: tx.hash } });
  const on = await c.batches(req.params.batchId);
  res.json({ status: chain.STATUS[Number(on.status)], tx: tx.hash });
}));

// One verified batch, one claim. The second attempt is refused by the contract, not by us.
app.post("/api/claim/:batchId", wrap(async (req, res) => {
  const c = await chain.contractAs("building");
  const to = chain.deployment().building;
  const claimId = await c.issueClaim.staticCall(req.params.batchId, to);
  const tx = await c.issueClaim(req.params.batchId, to);
  await tx.wait();
  ledger.updateBatch(req.params.batchId, { tx: { claim: tx.hash }, claimId });
  res.json({ claimId, tx: tx.hash });
}));

app.get("/api/receipt/:eventId", wrap(async (req, res) => res.json(ledger.receipt(req.params.eventId))));

// The sealed tree of one pickup, for the page's visual: node hashes in heap order and where each item sits.
app.get("/api/batch/:batchId/tree", wrap(async (req, res) => {
  const b = ledger.batches().find((x) => x.batchId === req.params.batchId);
  if (!b) throw new Error("unknown batch");
  res.json({ number: b.number, root: b.root, fields: ledger.LEAF_FIELDS, tree: b.tree.tree,
    leaves: b.tree.values.map((v) => ({ treeIndex: v.treeIndex, value: v.value })) });
}));

// Anyone with a receipt: rebuild the leaf from its values and ask the contract.
app.post("/api/verify", wrap(async (req, res) => {
  const { batchId, values, proof } = req.body;
  const leaf = ledger.leafHash(values);
  const ok = await (await chain.contractAs()).verifyEvent(batchId, leaf, proof);
  res.json({ ok, leaf });
}));

// A host's disk starts empty after every restart: give the building its labelled seeded neighbours.
if (process.env.BINPROOF_SEED_ON_START === "1" && ledger.events().length === 0) require("./scripts/seed").seed();

const PORT = Number(process.env.PORT || 3030);
app.listen(PORT, () => console.log(`BinProof on http://localhost:${PORT} (vision: ${vision.PROVIDER} ${vision.MODEL})`));
