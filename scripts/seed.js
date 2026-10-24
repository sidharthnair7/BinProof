// Seeded disposal events from other units, so a pickup looks like a building and not one webcam.
// Every one is marked seeded: true in its leaf, on chain, and on the page. Nothing pretends.
const ledger = require("../src/ledger");

const CLEAN = [
  ["plastic", "plastic bottle"], ["metal", "aluminum can"], ["paper", "newspaper"],
  ["cardboard", "flattened box"], ["glass", "glass jar"], ["carton", "milk carton"],
];
const DIRTY = [
  ["organics", "food scraps"], ["film", "plastic bag"], ["cardboard", "greasy pizza box"],
  ["styrofoam", "foam takeout box"], ["garbage", "coffee pod"],
];

function seed(count = 24, contaminatedShare = 0.35) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const dirty = i < Math.round(count * contaminatedShare);
    const [category, item] = (dirty ? DIRTY : CLEAN)[i % (dirty ? DIRTY.length : CLEAN.length)];
    out.push(ledger.addEvent({
      unit: `${3 + (i % 18)}${String(1 + (i % 9)).padStart(2, "0")}`,
      imageSha256: "0x" + "0".repeat(64),
      seeded: true,
      verdict: { item, category, contaminated: dirty, reason: "seeded demo event", confidence: 0.9, model: "seeded" },
    }));
  }
  return out;
}

if (require.main === module) {
  const n = seed(Number(process.argv[2] || 24));
  console.log(`seeded ${n.length} events (labelled seeded)`);
}
module.exports = { seed };
