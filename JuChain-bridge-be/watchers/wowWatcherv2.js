require("dotenv").config();
const { ethers } = require("ethers");
const BridgeEvent = require("../models/BridgeEvent");
const BlockProgress = require("../models/BlockProgress");
const { logger } = require("../utils/logger");

// Configuration constants
const CONFIG = {
  BSC: {
    BRIDGE_ADDRESS: process.env.BSC_BRIDGE_ADDR,
    RPC: process.env.BSC_RPC,
    CHAIN_ID: parseInt(process.env.BSC_CHAIN_ID, 10) || 97,
  },
  JU: {
    BRIDGE_ADDRESS: process.env.JU_BRIDGE_ADDR,
    RPC: process.env.JU_RPC,
    CHAIN_ID: parseInt(process.env.JU_CHAIN_ID, 10) || 66633666,
  },
  RELAYER_PRIVATE_KEY: process.env.RELAYER_PRIVATE_KEY,
  SCAN_CONFIG: {
    MAX_BLOCKS_PER_SCAN: 500,     // Maximum block range for a single scan
    POLLING_INTERVAL: 2 * 60 * 1000, // 2 minutes
    RETRY_DELAY: 10000,             // 10 seconds initial retry delay
    MAX_RETRIES: 5,                 // Maximum retry attempts
  }
};

// ABI definitions
const ABIS = {
  BSC_BRIDGE: [
    "event WowLocked(address indexed sender, uint256 amount)",
    "event WowUnlocked(address indexed recipient, uint256 amount)",
    "function unlockWow(address to, uint256 amount) external"
  ],
  JU_BRIDGE: [
    "event WwowBurned(address indexed sender, uint256 amount)",
    "event WwowMinted(address indexed recipient, uint256 amount)",
    "function mintWwow(address to, uint256 amount) external"
  ]
};

// Service state management
const STATE = {
  providers: {},
  contracts: {},
  relayers: {},
  intervals: [],
  running: false
};

/**
 * Initialize connections to blockchain networks
 */
async function initializeConnections() {
  try {
    // Setup BSC connections
    STATE.providers.BSC = new ethers.JsonRpcProvider(CONFIG.BSC.RPC);
    STATE.contracts.BSC = new ethers.Contract(
      CONFIG.BSC.BRIDGE_ADDRESS,
      ABIS.BSC_BRIDGE,
      STATE.providers.BSC
    );
    STATE.relayers.BSC = new ethers.Wallet(CONFIG.RELAYER_PRIVATE_KEY, STATE.providers.BSC);
    
    // Setup JU connections
    STATE.providers.JU = new ethers.JsonRpcProvider(CONFIG.JU.RPC);
    STATE.contracts.JU = new ethers.Contract(
      CONFIG.JU.BRIDGE_ADDRESS,
      ABIS.JU_BRIDGE,
      STATE.providers.JU
    );
    STATE.relayers.JU = new ethers.Wallet(CONFIG.RELAYER_PRIVATE_KEY, STATE.providers.JU);
    
    logger.info("Successfully initialized blockchain connections");
  } catch (error) {
    logger.error("Failed to initialize blockchain connections", { error: error.message });
    throw error;
  }
}

/**
 * Get last processed block for a specific chain and event type
 */
async function getLastProcessedBlock(chain, eventType) {
  try {
    const progress = await BlockProgress.findOneAndUpdate(
      { chain, asset: "WOW", eventType },
      {
        $setOnInsert: {
          lastProcessedBlock: await calculateStartBlock(chain),
          fullyCaughtUp: false
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return progress.lastProcessedBlock;
  } catch (error) {
    logger.error(`Error getting last processed block for ${chain}/${eventType}`, { error: error.message });
    throw error;
  }
}

// Helper function to calculate appropriate start block
async function calculateStartBlock(chain) {
  const currentBlock = await STATE.providers[chain].getBlockNumber();
  return Math.max(currentBlock - CONFIG.SCAN_CONFIG.MAX_BLOCKS_PER_SCAN, 0);
}

/**
 * Update last processed block for a given event type
 */
async function updateLastProcessedBlock(chain, eventType, blockNumber) {
  try {
    await BlockProgress.findOneAndUpdate(
      { chain, asset: "WOW", eventType },
      { lastProcessedBlock: blockNumber, fullyCaughtUp: true, updatedAt: new Date() },
      { upsert: true }
    );
    logger.debug(`Updated progress for ${chain}/${eventType}`, { blockNumber });
  } catch (error) {
    logger.error(`Failed to update progress for ${chain}/${eventType}`, { blockNumber, error: error.message });
  }
}

/**
 * --------------------------------------------------------------------
 * Combined polling functions (per chain) to reduce RPC calls
 * --------------------------------------------------------------------
 */

/** Process combined BSC events: WowLocked and WowUnlocked */
async function processBscEventsCombined() {
  try {
    // Get the minimum last processed block among both event types
    const lastLocked = await getLastProcessedBlock("BSC", "WowLocked");
    const lastUnlocked = await getLastProcessedBlock("BSC", "WowUnlocked");
    const fromBlock = Math.min(lastLocked, lastUnlocked);
    const latestBlock = await STATE.providers.BSC.getBlockNumber();
    const toBlock = Math.min(fromBlock + CONFIG.SCAN_CONFIG.MAX_BLOCKS_PER_SCAN, latestBlock);
    
    if (fromBlock >= toBlock) {
      logger.debug("No new BSC blocks to scan for events", { fromBlock, toBlock, latestBlock });
      return;
    }
    
    logger.info("Fetching combined BSC events", { fromBlock, toBlock, range: toBlock - fromBlock });
    
    const iface = new ethers.Interface(ABIS.BSC_BRIDGE);
    // Combine topics for both events
    const topics = [[ iface.getEvent("WowLocked").topicHash, iface.getEvent("WowUnlocked").topicHash ]];
    
    const logs = await STATE.providers.BSC.getLogs({
      address: CONFIG.BSC.BRIDGE_ADDRESS,
      topics,
      fromBlock,
      toBlock
    });
    
    for (const log of logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics, data: log.data });
        if (parsed.name === "WowLocked") {
          await processSingleWowLockedEvent(parsed, log);
        } else if (parsed.name === "WowUnlocked") {
          await processSingleWowUnlockedEvent(parsed, log);
        }
      } catch (err) {
        logger.warn("Failed to parse BSC log", { blockNumber: log.blockNumber, txHash: log.transactionHash, error: err.message });
      }
    }
    
    // Update progress for both event types to toBlock
    await updateLastProcessedBlock("BSC", "WowLocked", toBlock);
    await updateLastProcessedBlock("BSC", "WowUnlocked", toBlock);
    
    logger.info("Completed processing combined BSC events", { processedRange: toBlock - fromBlock });
  } catch (err) {
    logger.error("Error processing combined BSC events", { error: err.message });
  }
}

/** Process combined JU events: WwowBurned and WwowMinted */
async function processJuEventsCombined() {
  try {
    const lastBurned = await getLastProcessedBlock("JU", "WwowBurned");
    const lastMinted = await getLastProcessedBlock("JU", "WwowMinted");
    const fromBlock = Math.min(lastBurned, lastMinted);
    const latestBlock = await STATE.providers.JU.getBlockNumber();
    const toBlock = Math.min(fromBlock + CONFIG.SCAN_CONFIG.MAX_BLOCKS_PER_SCAN, latestBlock);
    
    if (fromBlock >= toBlock) {
      logger.debug("No new JU blocks to scan for events", { fromBlock, toBlock, latestBlock });
      return;
    }
    
    logger.info("Fetching combined JU events", { fromBlock, toBlock, range: toBlock - fromBlock });
    
    const iface = new ethers.Interface(ABIS.JU_BRIDGE);
    const topics = [[ iface.getEvent("WwowBurned").topicHash, iface.getEvent("WwowMinted").topicHash ]];
    
    const logs = await STATE.providers.JU.getLogs({
      address: CONFIG.JU.BRIDGE_ADDRESS,
      topics,
      fromBlock,
      toBlock
    });
    
    for (const log of logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics, data: log.data });
        if (parsed.name === "WwowBurned") {
          await processSingleWwowBurnedEvent(parsed, log);
        } else if (parsed.name === "WwowMinted") {
          await processSingleWwowMintedEvent(parsed, log);
        }
      } catch (err) {
        logger.warn("Failed to parse JU log", { blockNumber: log.blockNumber, txHash: log.transactionHash, error: err.message });
      }
    }
    
    // Update progress for both event types to toBlock
    await updateLastProcessedBlock("JU", "WwowBurned", toBlock);
    await updateLastProcessedBlock("JU", "WwowMinted", toBlock);
    
    logger.info("Completed processing combined JU events", { processedRange: toBlock - fromBlock });
  } catch (err) {
    logger.error("Error processing combined JU events", { error: err.message });
  }
}

/**
 * --------------------------------------------------------------------
 * Individual event processing helpers (for combined queries)
 * --------------------------------------------------------------------
 */

async function processSingleWowLockedEvent(parsed, log) {
  const { sender, amount } = parsed.args;
  const { transactionHash, blockNumber } = log;
  
  const existingEvent = await BridgeEvent.findOne({ txHash: transactionHash });
  let bridgeEvent = existingEvent;
  if (existingEvent && existingEvent.status === "MINTED") {
    logger.debug("Skipping already processed WowLocked event", { txHash: transactionHash });
    return;
  }
  
  if (!bridgeEvent) {
    bridgeEvent = await BridgeEvent.create({
      bridgeAsset: "WOW",
      fromChain: "BSC",
      toChain: "JU",
      eventName: "WowLocked",
      status: "LOCKED",
      userAddress: sender,
      amount: amount.toString(),
      txHash: transactionHash,
      blockNumber,
      chainId: CONFIG.BSC.CHAIN_ID
    });
    logger.info("Created WowLocked event record", { id: bridgeEvent._id, txHash: transactionHash, amount: amount.toString() });
  } else {
    bridgeEvent.status = "LOCKED";
    await bridgeEvent.save();
    logger.info("Updated WowLocked event record", { id: bridgeEvent._id, txHash: transactionHash });
  }
  
  // Execute cross-chain action: mintWwow on JU
  try {
    const juBridge = STATE.contracts.JU.connect(STATE.relayers.JU);
    const feeData = await STATE.providers.JU.getFeeData();
    const tx = await juBridge.mintWwow(
      sender,
      amount,
      { gasPrice: feeData.gasPrice, gasLimit: 300000 }
    );
    logger.info("Submitted mintWwow transaction", { originalTxHash: transactionHash, mintTxHash: tx.hash, sender, amount: amount.toString() });
    const receipt = await tx.wait();
    bridgeEvent.status = "MINTED";
    bridgeEvent.relayed = true;
    await bridgeEvent.save();
    logger.info("Successfully minted WWOW on JU chain", { originalTxHash: transactionHash, mintTxHash: receipt.transactionHash, blockNumber: receipt.blockNumber });
  } catch (error) {
    logger.error("Failed to mint WWOW on JU chain", { txHash: transactionHash, error: error.message });
    bridgeEvent.status = "ERROR";
    bridgeEvent.errorMessage = error.message;
    await bridgeEvent.save();
  }
}

async function processSingleWowUnlockedEvent(parsed, log) {
  const { recipient, amount } = parsed.args;
  const { transactionHash } = log;
  
  const existingEvent = await BridgeEvent.findOne({ txHash: transactionHash });
  if (existingEvent) {
    if (existingEvent.status !== "UNLOCKED") {
      existingEvent.status = "UNLOCKED";
      existingEvent.relayed = true;
      await existingEvent.save();
      logger.info("Updated WowUnlocked event record", { txHash: transactionHash });
    }
    return;
  }
  
  await BridgeEvent.create({
    bridgeAsset: "WOW",
    fromChain: "JU",
    toChain: "BSC",
    eventName: "WowUnlocked",
    status: "UNLOCKED",
    userAddress: recipient,
    amount: amount.toString(),
    txHash: transactionHash,
    chainId: CONFIG.BSC.CHAIN_ID,
    relayed: true
  });
  logger.info("Created WowUnlocked event record", { txHash: transactionHash });
}

async function processSingleWwowBurnedEvent(parsed, log) {
  const { sender, amount } = parsed.args;
  const { transactionHash, blockNumber } = log;
  
  const existingEvent = await BridgeEvent.findOne({ txHash: transactionHash });
  let bridgeEvent = existingEvent;
  if (existingEvent && existingEvent.status === "UNLOCKED") {
    logger.debug("Skipping already processed WwowBurned event", { txHash: transactionHash });
    return;
  }
  
  if (!bridgeEvent) {
    bridgeEvent = await BridgeEvent.create({
      bridgeAsset: "WOW",
      fromChain: "JU",
      toChain: "BSC",
      eventName: "WwowBurned",
      status: "BURNED",
      userAddress: sender,
      amount: amount.toString(),
      txHash: transactionHash,
      blockNumber,
      chainId: CONFIG.JU.CHAIN_ID
    });
    logger.info("Created WwowBurned event record", { id: bridgeEvent._id, txHash: transactionHash, amount: amount.toString() });
  } else {
    bridgeEvent.status = "BURNED";
    await bridgeEvent.save();
    logger.info("Updated WwowBurned event record", { id: bridgeEvent._id, txHash: transactionHash });
  }
  
  // Execute cross-chain action: unlockWow on BSC
  try {
    const bscBridge = STATE.contracts.BSC.connect(STATE.relayers.BSC);
    const feeData = await STATE.providers.BSC.getFeeData();
    const tx = await bscBridge.unlockWow(
      sender,
      amount,
      { gasPrice: feeData.gasPrice, gasLimit: 300000 }
    );
    logger.info("Submitted unlockWow transaction", { originalTxHash: transactionHash, unlockTxHash: tx.hash, sender, amount: amount.toString() });
    const receipt = await tx.wait();
    bridgeEvent.status = "UNLOCKED";
    bridgeEvent.relayed = true;
    await bridgeEvent.save();
    logger.info("Successfully unlocked WOW on BSC chain", { originalTxHash: transactionHash, unlockTxHash: receipt.transactionHash, blockNumber: receipt.blockNumber });
  } catch (error) {
    logger.error("Failed to unlock WOW on BSC chain", { txHash: transactionHash, error: error.message });
    bridgeEvent.status = "ERROR";
    bridgeEvent.errorMessage = error.message;
    await bridgeEvent.save();
  }
}

async function processSingleWwowMintedEvent(parsed, log) {
  const { recipient, amount } = parsed.args;
  const { transactionHash, blockNumber } = log;
  
  const existingEvent = await BridgeEvent.findOne({ txHash: transactionHash });
  if (existingEvent) {
    if (existingEvent.status !== "MINTED") {
      existingEvent.status = "MINTED";
      existingEvent.relayed = true;
      await existingEvent.save();
      logger.info("Updated existing record for WwowMinted event", { txHash: transactionHash });
    }
    return;
  }
  
  await BridgeEvent.create({
    bridgeAsset: "WOW",
    fromChain: "BSC",
    toChain: "JU",
    eventName: "WwowMinted",
    status: "MINTED",
    userAddress: recipient,
    amount: amount.toString(),
    txHash: transactionHash,
    blockNumber,
    chainId: CONFIG.JU.CHAIN_ID,
    relayed: true
  });
  logger.info("Created WwowMinted event record", { txHash: transactionHash, amount: amount.toString() });
}

/**
 * --------------------------------------------------------------------
 * Real-time event listeners (unchanged)
 * --------------------------------------------------------------------
 */
function setupRealtimeListeners() {
  // BSC Listeners
  STATE.contracts.BSC.on("WowLocked", async (sender, amount, event) => {
    console.log("🚀 ~ STATE.contracts.BSC.on ~ event:", event);
    logger.info("Real-time: Detected WowLocked event on BSC", {
      sender,
      amount: amount.toString(),
      txHash: event.log.transactionHash
    });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    try {
      // Process this event individually (can also trigger combined processing)
      await processSingleWowLockedEvent({ args: { sender, amount } }, event.log);
    } catch (error) {
      logger.error("Real-time: Failed to process WowLocked event", {
        txHash: event.log.transactionHash,
        error: error.message
      });
    }
  });
  
  STATE.contracts.JU.on("WwowBurned", async (sender, amount, event) => {
    logger.info("Real-time: Detected WwowBurned event on JU", {
      sender,
      amount: amount.toString(),
      txHash: event.log.transactionHash
    });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    try {
      await processSingleWwowBurnedEvent({ args: { sender, amount } }, event.log);
    } catch (error) {
      logger.error("Real-time: Failed to process WwowBurned event", {
        txHash: event.log.transactionHash,
        error: error.message
      });
    }
  });
  
  // Completion events for record keeping
  STATE.contracts.JU.on("WwowMinted", async (recipient, amount, event) => {
    try {
      await recordEvent("WwowMinted", {
        recipient,
        amount,
        transactionHash: event.log.transactionHash,
        blockNumber: event.blockNumber,
        chainId: CONFIG.JU.CHAIN_ID
      });
    } catch (error) {
      logger.error("Real-time: Failed to record WwowMinted event", {
        txHash: event.log.transactionHash,
        error: error.message
      });
    }
  });
  
  STATE.contracts.BSC.on("WowUnlocked", async (recipient, amount, event) => {
    try {
      await recordEvent("WowUnlocked", {
        recipient,
        amount,
        transactionHash: event.log.transactionHash,
        blockNumber: event.blockNumber,
        chainId: CONFIG.BSC.CHAIN_ID
      });
    } catch (error) {
      logger.error("Real-time: Failed to record WowUnlocked event", {
        txHash: event.log.transactionHash,
        error: error.message
      });
    }
  });
  
  logger.info("Set up real-time event listeners for both chains");
}

/**
 * Helper function to record completion events (for record keeping)
 */
async function recordEvent(eventName, eventData) {
  const { recipient, amount, transactionHash, blockNumber, chainId } = eventData;
  const fromChain = eventName === "WwowMinted" ? "BSC" : "JU";
  const toChain = eventName === "WwowMinted" ? "JU" : "BSC";
  const status = eventName === "WwowMinted" ? "MINTED" : "UNLOCKED";
  
  let bridgeEvent = await BridgeEvent.findOne({ txHash: transactionHash });
  if (!bridgeEvent) {
    bridgeEvent = await BridgeEvent.create({
      bridgeAsset: "WOW",
      fromChain,
      toChain,
      eventName,
      status,
      userAddress: recipient,
      amount: amount.toString(),
      txHash: transactionHash,
      blockNumber,
      chainId,
      relayed: true
    });
    logger.info(`Real-time: Recorded ${eventName} event`, { id: bridgeEvent._id, txHash: transactionHash });
  } else {
    if (bridgeEvent.status !== status) {
      bridgeEvent.status = status;
      bridgeEvent.relayed = true;
      await bridgeEvent.save();
      logger.info(`Real-time: Updated ${eventName} event record`, { id: bridgeEvent._id, txHash: transactionHash });
    }
  }
}

/**
 * --------------------------------------------------------------------
 * Polling scheduler: schedule combined polling per chain
 * --------------------------------------------------------------------
 */
function startPollingScheduler() {
  const pollBSC = setInterval(processBscEventsCombined, CONFIG.SCAN_CONFIG.POLLING_INTERVAL);
  const pollJU = setInterval(processJuEventsCombined, CONFIG.SCAN_CONFIG.POLLING_INTERVAL);
  
  STATE.intervals.push(pollBSC, pollJU);
  logger.info("Started event polling scheduler", { intervalMs: CONFIG.SCAN_CONFIG.POLLING_INTERVAL });
}

/**
 * Start the WOW watcher service
 */
async function startWowWatcher() {
  if (STATE.running) {
    logger.warn("WOW watcher is already running");
    return;
  }
  
  try {
    logger.info("Starting WOW watcher service...");
    
    await initializeConnections();
    setupRealtimeListeners();
    startPollingScheduler();
    
    // Run initial combined scans
    await Promise.all([
      processBscEventsCombined(),
      processJuEventsCombined()
    ]);
    
    STATE.running = true;
    logger.info("WOW watcher service is fully operational");
  } catch (error) {
    logger.error("Failed to start WOW watcher", { error: error.message });
  }
}

module.exports = { startWowWatcher };
