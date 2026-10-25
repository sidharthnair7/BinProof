// Seeded drops from other units and floors, so a pickup looks like a building and not one webcam.
// Every one is marked seeded: true in its leaf, on chain, and on the page. Nothing pretends.
// Chute fields: floor, the stream button pressed, what the sorter camera saw, and where it went.
const ledger = require("../src/ledger");

const CLEAN = [["METAL", "aluminum can"], ["RIGID_PLASTIC", "plastic bottle"], ["PAPER", "newspaper"],
  ["CARDBOARD", "flattened box"], ["GLASS", "glass jar"], ["CARTON", "milk carton"]];
const DIRTY = [["ORGANICS", "food scraps"], ["PLASTIC_FILM", "loose plastic bag"], ["CARDBOARD", "greasy pizza box"],
  ["STYROFOAM", "foam takeout box"], ["GARBAGE", "coffee pod"]];
const OTHER = [["GARBAGE", "GARBAGE", "garbage bag"], ["GARBAGE", "GARBAGE", "garbage bag"], ["ORGANICS", "ORGANICS", "food scraps in a bag"],
  ["GARBAGE", "GARBAGE", "garbage bag"], ["ORGANICS", "ORGANICS", "coffee grounds"]];

function add(i, stream, detected, item, contaminated, route) {
  const floor = 3 + (i * 7) % 20;
  return ledger.addEvent({
    unit: `${floor}${String(1 + (i % 9)).padStart(2, "0")}`,
    imageSha256: "0x" + "0".repeat(64),
    seeded: true,
    verdict: { item, category: detected.toLowerCase(), contaminated, reason: "seeded demo event", confidence: 0.9, model: "seeded" },
    chute: { floor, stream, detected, route, signals: { camera: "seeded", metal: 0, weightKg: 1, metalSource: "seeded", weightSource: "seeded" } },
  });
}

function seed(count = 24, contaminatedShare = 0.35) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const dirty = i < Math.round(count * contaminatedShare);
    const [detected, item] = (dirty ? DIRTY : CLEAN)[i % (dirty ? DIRTY.length : CLEAN.length)];
    // Food the sorter camera sees in recycling is diverted to organics, the same as the live rule.
    out.push(add(i, "RECYCLING", detected, item, dirty, detected === "ORGANICS" ? "to_organics" : "recycling"));
  }
  // Black bags sent down the recycling stream: diverted to garbage by the sorter, recorded against the floor.
  for (let i = 0; i < 3; i++) out.push(add(count + i, "RECYCLING", "OPAQUE_BAG", "closed black bag", true, "diverted"));
  // Garbage and organics drops: routed by the stream button, not part of the recycling pickup.
  OTHER.forEach(([stream, detected, item], k) => out.push(add(count + 3 + k, stream, detected, item, false, stream.toLowerCase())));
  return out;
}

if (require.main === module) {
  const n = seed(Number(process.argv[2] || 24));
  console.log(`seeded ${n.length} events (labelled seeded)`);
}
module.exports = { seed };
