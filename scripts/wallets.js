// Make two fresh testnet-only wallets, the building's and the facility's, and keep their keys in
// .env (git-ignored). Prints addresses only. Never reuse these keys for anything with real money.
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const ENV = path.join(__dirname, "..", ".env");
const text = fs.existsSync(ENV) ? fs.readFileSync(ENV, "utf8") : "";
const has = (k) => new RegExp(`^${k}=`, "m").test(text);

const lines = [];
if (!has("BINPROOF_RPC")) lines.push("BINPROOF_RPC=https://sepolia.base.org");
if (!has("BINPROOF_CHAIN_ID")) lines.push("BINPROOF_CHAIN_ID=84532");
for (const k of ["BUILDING_KEY", "FACILITY_KEY"]) if (!has(k)) lines.push(`${k}=${ethers.Wallet.createRandom().privateKey}`);
if (lines.length) fs.appendFileSync(ENV, (text && !text.endsWith("\n") ? "\n" : "") + lines.join("\n") + "\n");

process.loadEnvFile(ENV);
console.log("Building wallet (fund this one with Base Sepolia test ETH):", new ethers.Wallet(process.env.BUILDING_KEY).address);
console.log("Facility wallet (the deploy script tops it up from the building):", new ethers.Wallet(process.env.FACILITY_KEY).address);
