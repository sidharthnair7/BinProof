// Entry point for the hosted demo. With BINPROOF_CONTRACT set (a Base Sepolia deployment and its
// two keys in the host's environment), serve against that public chain. Without it, fall back to
// a local chain inside the service, which needs no testnet funds.
if (process.env.BINPROOF_CONTRACT && process.env.BUILDING_KEY && process.env.FACILITY_KEY) {
  process.env.BINPROOF_SEED_ON_START = "1";
  require("../server");
} else {
  require("./start");
}
