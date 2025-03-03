const mongoose = require("mongoose");

/**
 * Tracks our scanning progress for each chain + asset type, e.g.:
 *   - { chain: "BSC", asset: "WOW", eventType: "WowLocked", lastProcessedBlock: 30000000, fullyCaughtUp: true, ... }
 *   - { chain: "JU", asset: "WOW", eventType: "WwowBurned", lastProcessedBlock: 120000, fullyCaughtUp: false, ... }
 *
 * This helps us know where we left off scanning logs.
 */
const BlockProgressSchema = new mongoose.Schema({
  chain: {
    type: String, 
    required: true
  },
  asset: {
    type: String, 
    required: true
  },
  eventType: {
    type: String, 
    required: true
  },
  lastProcessedBlock: {
    type: Number,
    default: 0,
  },
  fullyCaughtUp: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

// Unique index based on chain, asset, and eventType
BlockProgressSchema.index({ chain: 1, asset: 1, eventType: 1 }, { unique: true });

module.exports = mongoose.model("BlockProgress", BlockProgressSchema);
