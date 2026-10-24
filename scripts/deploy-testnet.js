// Deploy BinProof to Base Sepolia with the wallets in .env, give the facility a little gas, and
// print what the host needs. Run: npm run deploy:testnet
const path = require("path");
process.loadEnvFile(path.join(__dirname, "..", ".env"));
const { ethers } = require("ethers");
const chain = require("../src/chain");

(async () => {
  const building = new ethers.Wallet(process.env.BUILDING_KEY, chain.provider);
  const facility = new ethers.Wallet(process.env.FACILITY_KEY, chain.provider);
  const balance = await chain.provider.getBalance(building.address);
  console.log(`building ${building.address} has ${ethers.formatEther(balance)} ETH`);
  if (balance === 0n) throw new Error("fund the building wallet with Base Sepolia test ETH first");

  const facilityBalance = await chain.provider.getBalance(facility.address);
  const topUp = balance / 5n;
  if (facilityBalance < topUp / 2n) {
    const tx = await building.sendTransaction({ to: facility.address, value: topUp });
    await tx.wait();
    console.log(`sent ${ethers.formatEther(topUp)} ETH to the facility wallet: https://sepolia.basescan.org/tx/${tx.hash}`);
  }

  const d = await chain.deploy();
  console.log(`\nBinProof deployed: https://sepolia.basescan.org/address/${d.address}`);
  console.log("\nSet these on the host (Render > Environment), next to the two keys from .env:");
  console.log(`BINPROOF_CONTRACT=${d.address}\nBINPROOF_RPC=https://sepolia.base.org\nBINPROOF_CHAIN_ID=${d.chainId}`);
})().catch((err) => { console.error(err.shortMessage || err.message); process.exit(1); });
