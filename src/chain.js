// Two signers who don't trust each other: the building (what the bin saw) and the facility (what
// it measured). Locally they are Hardhat's first two dev accounts; on a testnet, set
// BINPROOF_RPC, BUILDING_KEY and FACILITY_KEY.
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const ROOT = path.join(__dirname, "..");
const DEPLOYMENT = path.join(ROOT, "deployment.json");
const ARTIFACT = path.join(ROOT, "artifacts", "contracts", "BinProof.sol", "BinProof.json");

const RPC = process.env.BINPROOF_RPC || "http://127.0.0.1:8545";
const provider = new ethers.JsonRpcProvider(RPC);

async function signers() {
  if (process.env.BUILDING_KEY && process.env.FACILITY_KEY) {
    return {
      building: new ethers.Wallet(process.env.BUILDING_KEY, provider),
      facility: new ethers.Wallet(process.env.FACILITY_KEY, provider),
    };
  }
  return { building: await provider.getSigner(0), facility: await provider.getSigner(1) };
}

const artifact = () => JSON.parse(fs.readFileSync(ARTIFACT, "utf8"));

// On a host with no deployment.json (Render's disk is wiped on restart), the contract is named
// in the environment instead.
let cached = null;
function deployment() {
  if (fs.existsSync(DEPLOYMENT)) return JSON.parse(fs.readFileSync(DEPLOYMENT, "utf8"));
  if (!process.env.BINPROOF_CONTRACT) return null;
  if (!cached) {
    cached = {
      address: process.env.BINPROOF_CONTRACT,
      chainId: Number(process.env.BINPROOF_CHAIN_ID || 84532),
      building: new ethers.Wallet(process.env.BUILDING_KEY).address,
      facility: new ethers.Wallet(process.env.FACILITY_KEY).address,
      toleranceBps: Number(process.env.BINPROOF_TOLERANCE_BPS || 1000),
    };
  }
  return cached;
}

async function deploy(toleranceBps = 1000) {
  const { building, facility } = await signers();
  const { abi, bytecode } = artifact();
  const contract = await new ethers.ContractFactory(abi, bytecode, building)
    .deploy(await building.getAddress(), await facility.getAddress(), toleranceBps);
  await contract.waitForDeployment();
  const net = await provider.getNetwork();
  const info = {
    address: await contract.getAddress(),
    chainId: Number(net.chainId),
    building: await building.getAddress(),
    facility: await facility.getAddress(),
    toleranceBps,
    deployTx: contract.deploymentTransaction().hash,
  };
  fs.writeFileSync(DEPLOYMENT, JSON.stringify(info, null, 2));
  return info;
}

async function contractAs(role) {
  const d = deployment();
  if (!d) throw new Error("contract not deployed: run npm run deploy");
  const s = await signers();
  return new ethers.Contract(d.address, artifact().abi, role ? s[role] : provider);
}

const modelId = (model) => ethers.keccak256(ethers.toUtf8Bytes(model));
const STATUS = ["None", "Committed", "Verified", "Flagged"];

// Revert reasons come back as custom errors; name them so the page can show them.
function errorName(err) {
  try {
    const data = err?.data || err?.info?.error?.data || err?.error?.data;
    const parsed = new ethers.Interface(artifact().abi).parseError(data);
    if (parsed) return parsed.name;
  } catch { /* fall through */ }
  return err?.shortMessage || err?.message || String(err);
}

module.exports = { provider, deploy, deployment, contractAs, modelId, STATUS, errorName, RPC };
