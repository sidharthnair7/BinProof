// One command for a fresh local chain: start Hardhat, deploy BinProof, and seed a building's
// worth of labelled events. The app itself is the Spring Boot backend in backend-java/. A new chain means old records no longer match,
// so the previous data folder is set aside, not deleted.
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");

async function waitForChain(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) });
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("local chain did not start");
}

process.env.BINPROOF_LOCAL = "1";
for (const k of ["BINPROOF_RPC", "BUILDING_KEY", "FACILITY_KEY", "BINPROOF_CONTRACT"]) delete process.env[k];

(async () => {
  fs.mkdirSync(DATA, { recursive: true });
  const old = path.join(ROOT, "deployment.json");
  if (fs.existsSync(old)) fs.renameSync(old, path.join(DATA, `${Date.now()}-deployment.json.old`));
  for (const f of ["events.json", "batches.json"]) {
    const p = path.join(DATA, f);
    if (fs.existsSync(p)) fs.renameSync(p, path.join(DATA, `${Date.now()}-${f}.old`));
  }
  const hardhat = path.join(ROOT, "node_modules", "hardhat", "internal", "cli", "cli.js");
  const node = spawn(process.execPath, [hardhat, "node"], { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] });
  process.on("exit", () => node.kill());
  process.on("SIGINT", () => process.exit(0));
  await waitForChain("http://127.0.0.1:8545");

  const chain = require("../src/chain");
  const d = await chain.deploy();
  console.log(`BinProof deployed at ${d.address} (building ${d.building}, facility ${d.facility})`);
  require("./seed").seed();
  console.log("Chain ready on http://127.0.0.1:8545 with the contract deployed and seeded drops from other floors.");
  console.log("Now start the Spring Boot backend: cd backend-java && java -jar target/binproof-backend-1.0.0.jar (then open http://localhost:8080)");
})().catch((err) => { console.error(err); process.exit(1); });
