// Off-chain records and the Merkle batching. Photos stay in data/images on the device; only
// their SHA-256 goes into an event, and only a batch's Merkle root goes on chain.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { ethers } = require("ethers");
const { StandardMerkleTree } = require("@openzeppelin/merkle-tree");

const DATA = path.join(__dirname, "..", "data");
const IMAGES = path.join(DATA, "images");
const EVENTS = path.join(DATA, "events.json");
const BATCHES = path.join(DATA, "batches.json");
const BUILDING_SALT = process.env.BINPROOF_SALT || "demo-building-salt-change-me";

// Leaf layout. The contract only sees leaf hashes; anyone with a receipt can rebuild one.
const LEAF_TYPES = ["string", "bytes32", "bytes32", "string", "bool", "uint16", "string", "uint256", "bool"];
const LEAF_FIELDS = ["eventId", "unitTag", "imageSha256", "category", "contaminated", "confidenceBps", "model", "timestamp", "seeded"];

fs.mkdirSync(IMAGES, { recursive: true });

const read = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : []);
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2));

// A unit is never named on chain or in a batch: it becomes a salted hash the building can map back
// and an outsider cannot.
const unitTag = (unit) => ethers.keccak256(ethers.toUtf8Bytes(`${BUILDING_SALT}:${unit}`));

// The photo's hash is always recorded. The photo itself is kept only on the bin's own device,
// never on the hosted demo.
function saveImage(imageBase64, keep = true) {
  const bytes = Buffer.from(imageBase64, "base64");
  const sha = crypto.createHash("sha256").update(bytes).digest("hex");
  if (keep) fs.writeFileSync(path.join(IMAGES, `${sha}.jpg`), bytes);
  return "0x" + sha;
}

function addEvent({ unit, imageSha256, verdict, seeded = false }) {
  const events = read(EVENTS);
  const event = {
    eventId: `ev-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    unit,
    unitTag: unitTag(unit),
    imageSha256,
    category: verdict.category,
    contaminated: verdict.contaminated,
    confidenceBps: Math.round(verdict.confidence * 10000),
    model: verdict.model,
    timestamp: Math.floor(Date.now() / 1000),
    seeded,
    item: verdict.item,
    reason: verdict.reason,
    needsReview: Boolean(verdict.needsReview),
    batchId: null,
  };
  events.push(event);
  write(EVENTS, events);
  return event;
}

const leafValues = (e) => LEAF_FIELDS.map((f) => e[f]);

// A person's decision replaces a low-confidence verdict before it can count against a unit.
function review(eventId, contaminated) {
  const events = read(EVENTS);
  const e = events.find((x) => x.eventId === eventId);
  if (!e) throw new Error("unknown event");
  if (e.batchId) throw new Error("already picked up");
  Object.assign(e, { contaminated, needsReview: false, humanReviewed: true });
  write(EVENTS, events);
  return e;
}

// Close every open event into one pickup batch and build its tree.
function closeBatch() {
  const events = read(EVENTS);
  const open = events.filter((e) => !e.batchId && !e.needsReview);
  if (!open.length) throw new Error("no reviewed events waiting for pickup");
  const batches = read(BATCHES);
  const number = batches.length + 1;
  const batchId = ethers.keccak256(ethers.toUtf8Bytes(`pickup-${number}-${Date.now()}`));
  const tree = StandardMerkleTree.of(open.map(leafValues), LEAF_TYPES);
  const ids = new Set(open.map((e) => e.eventId));
  for (const e of events) if (ids.has(e.eventId)) e.batchId = batchId;
  const batch = {
    number,
    batchId,
    root: tree.root,
    items: open.length,
    contaminated: open.filter((e) => e.contaminated).length,
    seeded: open.filter((e) => e.seeded).length,
    model: open.find((e) => !e.seeded)?.model || open[0].model,
    tree: tree.dump(),
    createdAt: Math.floor(Date.now() / 1000),
    tx: {},
  };
  batches.push(batch);
  write(EVENTS, events);
  write(BATCHES, batches);
  return batch;
}

function updateBatch(batchId, patch) {
  const batches = read(BATCHES);
  const b = batches.find((x) => x.batchId === batchId);
  if (!b) throw new Error("unknown batch");
  Object.assign(b, patch, { tx: { ...b.tx, ...(patch.tx || {}) } });
  write(BATCHES, batches);
  return b;
}

// What a resident keeps: the leaf values and the proof. Enough to check on chain without us.
function receipt(eventId) {
  const event = read(EVENTS).find((e) => e.eventId === eventId);
  if (!event) throw new Error("unknown event");
  if (!event.batchId) return { event, pending: true };
  const batch = read(BATCHES).find((b) => b.batchId === event.batchId);
  const tree = StandardMerkleTree.load(batch.tree);
  for (const [i, v] of tree.entries()) {
    if (v[0] === eventId) {
      return {
        batchId: batch.batchId,
        pickup: batch.number,
        leafTypes: LEAF_TYPES,
        leafFields: LEAF_FIELDS,
        values: v,
        leaf: tree.leafHash(v),
        proof: tree.getProof(i),
      };
    }
  }
  throw new Error("event not found in its batch");
}

const leafHash = (values) => StandardMerkleTree.of([values], LEAF_TYPES).leafHash(values);

module.exports = {
  saveImage, addEvent, review, closeBatch, updateBatch, receipt, leafHash, unitTag,
  events: () => read(EVENTS), batches: () => read(BATCHES), LEAF_TYPES, LEAF_FIELDS, DATA,
};
