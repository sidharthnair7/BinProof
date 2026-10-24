// Local chain for development; Base Sepolia when BINPROOF_RPC and keys are set (see README).
module.exports = {
  solidity: { version: "0.8.24", settings: { optimizer: { enabled: true, runs: 200 } } },
};
