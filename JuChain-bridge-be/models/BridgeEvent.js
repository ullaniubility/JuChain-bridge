const mongoose = require("mongoose");

/**
 * A record of each bridging-related event (locked, minted, burned, unlocked).
 *
 * Fields:
 *   - bridgeAsset: "WOW" or "JU" (the asset being bridged)
 *   - fromChain: "BSC" or "JU"
 *   - toChain: "BSC" or "JU"
 *   - eventName: e.g. "WowLocked", "WwowBurned", "WwowMinted", "WowUnlocked", "JuCoinLocked", etc.
 *   - status: "LOCKED", "MINTED", "BURNED", "UNLOCKED", "ERROR", ...
 *   - userAddress: the user’s address that triggered the bridging on the fromChain
 *   - amount: string to store token amounts (avoid float issues)
 *   - txHash: the transaction hash for the event
 *   - blockNumber: which block the event was in
 *   - chainId: which chain ID the event belongs to
 *   - relayed: boolean if cross-chain action was successfully done
 *   - errorMessage: if an error occurred
 */
const BridgeEventSchema = new mongoose.Schema(
  {
    bridgeAsset: {
      type: String,
      enum: ["WOW", "JU"],
      required: true,
    },
    fromChain: {
      type: String,
      enum: ["BSC", "JU"],
      required: true,
    },
    toChain: {
      type: String,
      enum: ["BSC", "JU"],
      required: true,
    },
    eventName: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: [
        "LOCKED",
        "MINTED",
        "BURNED",
        "UNLOCKED",
        "ERROR"
      ],
      default: "LOCKED",
    },
    userAddress: {
      type: String,
      required: true,
    },
    amount: {
      type: String,
      required: true,
    },
    txHash: {
      type: String,
      required: true,
      index: true,
    },
    blockNumber: Number,
    chainId: Number,
    relayed: {
      type: Boolean,
      default: false,
    },
    errorMessage: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("BridgeEvent", BridgeEventSchema);
