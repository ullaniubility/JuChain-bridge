// require("dotenv").config();
// const { ethers } = require("ethers");
// const BridgeEvent = require("../models/BridgeEvent");
// const BlockProgress = require("../models/BlockProgress");
// const { logger } = require("../utils/logger");

// /** ABI definitions */
// const ABIS = {
//   JU_BRIDGE: [
//     "event JuCoinLocked(address indexed sender, uint256 amount)",
//     "event JuCoinUnlocked(address indexed recipient, uint256 amount)",
//     "function unlockJuCoin(address payable to, uint256 amount) external"
//   ],
//   BSC_BRIDGE: [
//     "event WjuBurned(address indexed sender, uint256 amount)",
//     "event WjuMinted(address indexed recipient, uint256 amount)",
//     "function mintWju(address to, uint256 amount) external"
//   ]
// };

// /** Configuration */
// const CONFIG = {
//   JU: {
//     BRIDGE_ADDRESS: process.env.JU_BRIDGE_ADDR,
//     RPC: process.env.JU_RPC,
//     CHAIN_ID: parseInt(process.env.JU_CHAIN_ID, 10) || 66633666,
//   },
//   BSC: {
//     BRIDGE_ADDRESS: process.env.BSC_BRIDGE_ADDR,
//     RPC: process.env.BSC_RPC,
//     CHAIN_ID: parseInt(process.env.BSC_CHAIN_ID, 10) || 97,
//   },
//   RELAYER_PRIVATE_KEY: process.env.RELAYER_PRIVATE_KEY,
//   SCAN_CONFIG: {
//     MAX_BLOCKS_PER_SCAN: 100,    // adjust as needed
//     POLLING_INTERVAL: 2 * 60 * 1000, // 2 minutes
//     RETRY_DELAY: 10000,             // 10 seconds
//     MAX_RETRIES: 5
//   }
// };

// /** Global state */
// const STATE = {
//   providers: {},
//   contracts: {},
//   relayers: {},
//   intervals: [],
//   running: false
// };

// /** Initialize blockchain connections */
// async function initializeConnections() {
//   try {
//     // JU chain connections
//     STATE.providers.JU = new ethers.JsonRpcProvider(CONFIG.JU.RPC);
//     STATE.contracts.JU = new ethers.Contract(
//       CONFIG.JU.BRIDGE_ADDRESS,
//       ABIS.JU_BRIDGE,
//       STATE.providers.JU
//     );
//     STATE.relayers.JU = new ethers.Wallet(CONFIG.RELAYER_PRIVATE_KEY, STATE.providers.JU);
    
//     // BSC chain connections
//     STATE.providers.BSC = new ethers.JsonRpcProvider(CONFIG.BSC.RPC);
//     STATE.contracts.BSC = new ethers.Contract(
//       CONFIG.BSC.BRIDGE_ADDRESS,
//       ABIS.BSC_BRIDGE,
//       STATE.providers.BSC
//     );
//     STATE.relayers.BSC = new ethers.Wallet(CONFIG.RELAYER_PRIVATE_KEY, STATE.providers.BSC);
    
//     logger.info("Successfully initialized blockchain connections for JU coin watcher");
//   } catch (error) {
//     logger.error("Failed to initialize blockchain connections", { error: error.message });
//     throw error;
//   }
// }

// /** Block progress helpers */
// async function getLastProcessedBlock(chain, eventType) {
//   try {
//     const progress = await BlockProgress.findOneAndUpdate(
//       { chain, asset: "JU", eventType },
//       {
//         $setOnInsert: {
//           lastProcessedBlock: await calculateStartBlock(chain),
//           fullyCaughtUp: false
//         }
//       },
//       { upsert: true, new: true, setDefaultsOnInsert: true }
//     );
//     return progress.lastProcessedBlock;
//   } catch (error) {
//     logger.error(`Error getting last processed block for ${chain}/${eventType}`, { error: error.message });
//     throw error;
//   }
// }

// async function calculateStartBlock(chain) {
//   const currentBlock = await STATE.providers[chain].getBlockNumber();
//   return Math.max(currentBlock - CONFIG.SCAN_CONFIG.MAX_BLOCKS_PER_SCAN, 0);
// }

// async function updateLastProcessedBlock(chain, eventType, blockNumber) {
//   try {
//     await BlockProgress.findOneAndUpdate(
//       { chain, asset: "JU", eventType },
//       { lastProcessedBlock: blockNumber, fullyCaughtUp: true, updatedAt: new Date() },
//       { upsert: true }
//     );
//     logger.debug(`Updated progress for ${chain}/${eventType}`, { blockNumber });
//   } catch (error) {
//     logger.error(`Failed to update progress for ${chain}/${eventType}`, { blockNumber, error: error.message });
//   }
// }

// /** --------------------------------------------------------------------
//  * Combined polling functions for JU coin watcher:
//  * - processJuEventsCombined: for JuCoinLocked & JuCoinUnlocked on JU chain
//  * - processBscEventsCombined: for WjuBurned & WjuMinted on BSC chain
//  * --------------------------------------------------------------------*/

// /** Combined polling for JU events (JuCoinLocked, JuCoinUnlocked) */
// async function processJuEventsCombined() {
//   try {
//     const lastLocked = await getLastProcessedBlock("JU", "JuCoinLocked");
//     const lastUnlocked = await getLastProcessedBlock("JU", "JuCoinUnlocked");
//     const fromBlock = Math.min(lastLocked, lastUnlocked);
//     const latestBlock = await STATE.providers.JU.getBlockNumber();
//     const toBlock = Math.min(fromBlock + CONFIG.SCAN_CONFIG.MAX_BLOCKS_PER_SCAN, latestBlock);
    
//     if (fromBlock >= toBlock) {
//       logger.debug("No new JU blocks to scan", { fromBlock, toBlock, latestBlock });
//       return;
//     }
    
//     logger.info("Fetching combined JU events", { fromBlock, toBlock, range: toBlock - fromBlock });
    
//     const iface = new ethers.Interface(ABIS.JU_BRIDGE);
//     const topics = [[ iface.getEvent("JuCoinLocked").topicHash, iface.getEvent("JuCoinUnlocked").topicHash ]];
    
//     const logs = await STATE.providers.JU.getLogs({
//       address: CONFIG.JU.BRIDGE_ADDRESS,
//       topics,
//       fromBlock,
//       toBlock
//     });
    
//     for (const log of logs) {
//       try {
//         const parsed = iface.parseLog({ topics: log.topics, data: log.data });
//         if (parsed.name === "JuCoinLocked") {
//           await processSingleJuCoinLockedEvent(parsed, log);
//         } else if (parsed.name === "JuCoinUnlocked") {
//           await processSingleJuCoinUnlockedEvent(parsed, log);
//         }
//       } catch (err) {
//         logger.warn("Failed to parse JU log", { blockNumber: log.blockNumber, txHash: log.transactionHash, error: err.message });
//       }
//     }
    
//     // Update progress for both event types to toBlock
//     await updateLastProcessedBlock("JU", "JuCoinLocked", toBlock);
//     await updateLastProcessedBlock("JU", "JuCoinUnlocked", toBlock);
    
//     logger.info("Completed processing combined JU events", { processedRange: toBlock - fromBlock });
//   } catch (err) {
//     logger.error("Error processing combined JU events", { error: err.message });
//   }
// }

// /** Combined polling for BSC events (WjuBurned, WjuMinted) */
// async function processBscEventsCombined() {
//   try {
//     const lastBurned = await getLastProcessedBlock("BSC", "WjuBurned");
//     const lastMinted = await getLastProcessedBlock("BSC", "WjuMinted");
//     const fromBlock = Math.min(lastBurned, lastMinted);
//     const latestBlock = await STATE.providers.BSC.getBlockNumber();
//     const toBlock = Math.min(fromBlock + CONFIG.SCAN_CONFIG.MAX_BLOCKS_PER_SCAN, latestBlock);
    
//     if (fromBlock >= toBlock) {
//       logger.debug("No new BSC blocks to scan", { fromBlock, toBlock, latestBlock });
//       return;
//     }
    
//     logger.info("Fetching combined BSC events", { fromBlock, toBlock, range: toBlock - fromBlock });
    
//     const iface = new ethers.Interface(ABIS.BSC_BRIDGE);
//     const topics = [[ iface.getEvent("WjuBurned").topicHash, iface.getEvent("WjuMinted").topicHash ]];
    
//     const logs = await STATE.providers.BSC.getLogs({
//       address: CONFIG.BSC.BRIDGE_ADDRESS,
//       topics,
//       fromBlock,
//       toBlock
//     });
    
//     for (const log of logs) {
//       try {
//         const parsed = iface.parseLog({ topics: log.topics, data: log.data });
//         if (parsed.name === "WjuBurned") {
//           await processSingleWjuBurnedEvent(parsed, log);
//         } else if (parsed.name === "WjuMinted") {
//           await processSingleWjuMintedEvent(parsed, log);
//         }
//       } catch (err) {
//         logger.warn("Failed to parse BSC log", { blockNumber: log.blockNumber, txHash: log.transactionHash, error: err.message });
//       }
//     }
    
//     // Update progress for both event types
//     await updateLastProcessedBlock("BSC", "WjuBurned", toBlock);
//     await updateLastProcessedBlock("BSC", "WjuMinted", toBlock);
    
//     logger.info("Completed processing combined BSC events", { processedRange: toBlock - fromBlock });
//   } catch (err) {
//     logger.error("Error processing combined BSC events", { error: err.message });
//   }
// }

// /** --------------------------------------------------------------------
//  * Individual event processing helpers for combined queries
//  * --------------------------------------------------------------------*/

// async function processSingleJuCoinLockedEvent(parsed, log) {
//   const { sender, amount } = parsed.args;
//   const { transactionHash, blockNumber } = log;
//   const existing = await BridgeEvent.findOne({ txHash: transactionHash });
//   let bridgeEvent = existing;
//   if (existing && existing.status === "MINTED") {
//     logger.debug("Skipping already processed JuCoinLocked event", { txHash: transactionHash });
//     return;
//   }
//   if (!bridgeEvent) {
//     bridgeEvent = await BridgeEvent.create({
//       bridgeAsset: "JU",
//       fromChain: "JU",
//       toChain: "BSC",
//       eventName: "JuCoinLocked",
//       status: "LOCKED",
//       userAddress: sender,
//       amount: amount.toString(),
//       txHash: transactionHash,
//       blockNumber,
//       chainId: CONFIG.JU.CHAIN_ID
//     });
//     logger.info("Created JuCoinLocked event record", { id: bridgeEvent._id, txHash: transactionHash });
//   } else {
//     bridgeEvent.status = "LOCKED";
//     await bridgeEvent.save();
//     logger.info("Updated JuCoinLocked event record", { id: bridgeEvent._id, txHash: transactionHash });
//   }
//   // Cross-chain action: mintWju on BSC
//   try {
//     const bscBridge = STATE.contracts.BSC.connect(STATE.relayers.BSC);
//     const tx = await bscBridge.mintWju(sender, amount);
//     const receipt = await tx.wait();
//     bridgeEvent.status = "MINTED";
//     bridgeEvent.relayed = true;
//     await bridgeEvent.save();
//     logger.info("Successfully minted Wju on BSC", { originalTxHash: transactionHash, mintTxHash: receipt.transactionHash, blockNumber: receipt.blockNumber });
//   } catch (error) {
//     bridgeEvent.status = "ERROR";
//     bridgeEvent.errorMessage = error.message;
//     await bridgeEvent.save();
//     logger.error("Failed to mint Wju", { txHash: transactionHash, error: error.message });
//   }
// }

// async function processSingleJuCoinUnlockedEvent(parsed, log) {
//   const { recipient, amount } = parsed.args;
//   const { transactionHash } = log;
//   const existing = await BridgeEvent.findOne({ txHash: transactionHash });
//   if (existing) {
//     if (existing.status !== "UNLOCKED") {
//       existing.status = "UNLOCKED";
//       existing.relayed = true;
//       await existing.save();
//       logger.info("Updated JuCoinUnlocked event record", { txHash: transactionHash });
//     }
//     return;
//   }
//   await BridgeEvent.create({
//     bridgeAsset: "JU",
//     fromChain: "BSC",
//     toChain: "JU",
//     eventName: "JuCoinUnlocked",
//     status: "UNLOCKED",
//     userAddress: recipient,
//     amount: amount.toString(),
//     txHash: transactionHash,
//     chainId: CONFIG.JU.CHAIN_ID,
//     relayed: true
//   });
//   logger.info("Created JuCoinUnlocked event record", { txHash: transactionHash });
// }

// async function processSingleWjuBurnedEvent(parsed, log) {
//   const { sender, amount } = parsed.args;
//   const { transactionHash, blockNumber } = log;
//   const existing = await BridgeEvent.findOne({ txHash: transactionHash });
//   let bridgeEvent = existing;
//   if (existing && existing.status === "UNLOCKED") {
//     logger.debug("Skipping already processed WjuBurned event", { txHash: transactionHash });
//     return;
//   }
//   if (!bridgeEvent) {
//     bridgeEvent = await BridgeEvent.create({
//       bridgeAsset: "JU",
//       fromChain: "BSC",
//       toChain: "JU",
//       eventName: "WjuBurned",
//       status: "BURNED",
//       userAddress: sender,
//       amount: amount.toString(),
//       txHash: transactionHash,
//       blockNumber,
//       chainId: CONFIG.BSC.CHAIN_ID
//     });
//     logger.info("Created WjuBurned event record", { id: bridgeEvent._id, txHash: transactionHash });
//   } else {
//     bridgeEvent.status = "BURNED";
//     await bridgeEvent.save();
//     logger.info("Updated WjuBurned event record", { id: bridgeEvent._id, txHash: transactionHash });
//   }
//   // Cross-chain action: unlockJuCoin on JU
//   try {
//     const juBridge = STATE.contracts.JU.connect(STATE.relayers.JU);
//     const tx = await juBridge.unlockJuCoin(sender, amount);
//     const receipt = await tx.wait();
//     bridgeEvent.status = "UNLOCKED";
//     bridgeEvent.relayed = true;
//     await bridgeEvent.save();
//     logger.info("Successfully unlocked JuCoin on JU", { originalTxHash: transactionHash, unlockTxHash: receipt.transactionHash, blockNumber: receipt.blockNumber });
//   } catch (error) {
//     bridgeEvent.status = "ERROR";
//     bridgeEvent.errorMessage = error.message;
//     await bridgeEvent.save();
//     logger.error("Failed to unlock JuCoin", { txHash: transactionHash, error: error.message });
//   }
// }

// async function processSingleWjuMintedEvent(parsed, log) {
//   const { recipient, amount } = parsed.args;
//   const { transactionHash, blockNumber } = log;
//   const existing = await BridgeEvent.findOne({ txHash: transactionHash });
//   if (existing) {
//     if (existing.status !== "MINTED") {
//       existing.status = "MINTED";
//       existing.relayed = true;
//       await existing.save();
//       logger.info("Updated existing WjuMinted record", { txHash: transactionHash });
//     }
//     return;
//   }
//   await BridgeEvent.create({
//     bridgeAsset: "JU",
//     fromChain: "JU",
//     toChain: "BSC",
//     eventName: "WjuMinted",
//     status: "MINTED",
//     userAddress: recipient,
//     amount: amount.toString(),
//     txHash: transactionHash,
//     blockNumber,
//     chainId: CONFIG.BSC.CHAIN_ID,
//     relayed: true
//   });
//   logger.info("Created WjuMinted event record", { txHash: transactionHash });
// }

// /** --------------------------------------------------------------------
//  * Real-time subscriptions (unchanged)
//  * --------------------------------------------------------------------*/
// function setupRealtimeListeners() {
//   // JU real-time listeners
//   const juBridge = STATE.contracts.JU.connect(STATE.providers.JU);
//   juBridge.on("JuCoinLocked", async (sender, amount, event) => {
//     logger.info("Real-time: Detected JuCoinLocked on JU", {
//       sender,
//       amount: amount.toString(),
//       txHash: event.log.transactionHash
//     });
//     await new Promise(resolve => setTimeout(resolve, 3000));
//     try {
//       await processSingleJuCoinLockedEvent();
//     } catch (err) {
//       logger.error("Real-time: Error processing JuCoinLocked", { error: err.message });
//     }
//   });
//   juBridge.on("JuCoinUnlocked", async (recipient, amount, event) => {
//     logger.info("Real-time: Detected JuCoinUnlocked on JU", {
//       recipient,
//       amount: amount.toString(),
//       txHash: event.log.transactionHash
//     });
//     await new Promise(resolve => setTimeout(resolve, 3000));
//     try {
//       await processSingleJuCoinUnlockedEvent();
//     } catch (err) {
//       logger.error("Real-time: Error processing JuCoinUnlocked", { error: err.message });
//     }
//   });
  
//   // BSC real-time listeners
//   const bscBridge = STATE.contracts.BSC.connect(STATE.providers.BSC);
//   bscBridge.on("WjuBurned", async (sender, amount, event) => {
//     logger.info("Real-time: Detected WjuBurned on BSC", {
//       sender,
//       amount: amount.toString(),
//       txHash: event.log.transactionHash
//     });
//     await new Promise(resolve => setTimeout(resolve, 3000));
//     try {
//       await processSingleWjuBurnedEvent();
//     } catch (err) {
//       logger.error("Real-time: Error processing WjuBurned", { error: err.message });
//     }
//   });
//   bscBridge.on("WjuMinted", async (recipient, amount, event) => {
//     logger.info("Real-time: Detected WjuMinted on BSC", {
//       recipient,
//       amount: amount.toString(),
//       txHash: event.log.transactionHash
//     });
//     await new Promise(resolve => setTimeout(resolve, 3000));
//     try {
//       await processSingleWjuMintedEvent();
//     } catch (err) {
//       logger.error("Real-time: Error processing WjuMinted", { error: err.message });
//     }
//   });
  
//   logger.info("Set up real-time event listeners for JU coin watcher");
// }

// /** --------------------------------------------------------------------
//  * Polling scheduler: use combined polling per chain
//  * --------------------------------------------------------------------*/
// function startPollingScheduler() {
//   // Instead of scheduling four separate intervals, we schedule one per chain.
//   const pollJU = setInterval(processJuEventsCombined, CONFIG.SCAN_CONFIG.POLLING_INTERVAL);
//   const pollBSC = setInterval(processBscEventsCombined, CONFIG.SCAN_CONFIG.POLLING_INTERVAL);
  
//   STATE.intervals.push(pollJU, pollBSC);
//   logger.info("Started polling scheduler for JU coin watcher", { intervalMs: CONFIG.SCAN_CONFIG.POLLING_INTERVAL });
// }

// /** --------------------------------------------------------------------
//  * Start the JU coin watcher service
//  * --------------------------------------------------------------------*/
// async function startJuCoinWatcher() {
//   if (STATE.running) {
//     logger.warn("JU coin watcher is already running");
//     return;
//   }
//   try {
//     logger.info("Starting JU coin watcher service...");
//     await initializeConnections();
//     setupRealtimeListeners();
//     startPollingScheduler();
    
//     // Run initial combined scans
//     await Promise.all([ processJuEventsCombined(), processBscEventsCombined() ]);
    
//     STATE.running = true;
//     logger.info("JU coin watcher service is fully operational");
//   } catch (error) {
//     logger.error("Failed to start JU coin watcher", { error: error.message });
//   }
// }

// module.exports = { startJuCoinWatcher };


require("dotenv").config();
const { ethers } = require("ethers");
const BridgeEvent = require("../models/BridgeEvent");
const BlockProgress = require("../models/BlockProgress");
const { logger } = require("../utils/logger");

// Configuration constants
const CONFIG = {
  JU: {
    BRIDGE_ADDRESS: process.env.JU_BRIDGE_ADDR,
    RPC: process.env.JU_RPC,
    CHAIN_ID: parseInt(process.env.JU_CHAIN_ID, 10) || 66633666,
  },
  BSC: {
    BRIDGE_ADDRESS: process.env.BSC_BRIDGE_ADDR,
    RPC: process.env.BSC_RPC,
    CHAIN_ID: parseInt(process.env.BSC_CHAIN_ID, 10) || 97,
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
  JU_BRIDGE: [
    "event JuCoinLocked(address indexed sender, uint256 amount)",
    "event JuCoinUnlocked(address indexed recipient, uint256 amount)",
    "function unlockJuCoin(address payable to, uint256 amount) external"
  ],
  BSC_BRIDGE: [
    "event WjuBurned(address indexed sender, uint256 amount)",
    "event WjuMinted(address indexed recipient, uint256 amount)",
    "function mintWju(address to, uint256 amount) external"
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
    // Setup JU connections
    STATE.providers.JU = new ethers.JsonRpcProvider(CONFIG.JU.RPC);
    STATE.contracts.JU = new ethers.Contract(
      CONFIG.JU.BRIDGE_ADDRESS,
      ABIS.JU_BRIDGE,
      STATE.providers.JU
    );
    STATE.relayers.JU = new ethers.Wallet(CONFIG.RELAYER_PRIVATE_KEY, STATE.providers.JU);
    
    // Setup BSC connections
    STATE.providers.BSC = new ethers.JsonRpcProvider(CONFIG.BSC.RPC);
    STATE.contracts.BSC = new ethers.Contract(
      CONFIG.BSC.BRIDGE_ADDRESS,
      ABIS.BSC_BRIDGE,
      STATE.providers.BSC
    );
    STATE.relayers.BSC = new ethers.Wallet(CONFIG.RELAYER_PRIVATE_KEY, STATE.providers.BSC);
    
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
      { chain, asset: "JU", eventType },
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
      { chain, asset: "JU", eventType },
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

/** Process combined JU events: JuCoinLocked and JuCoinUnlocked */
async function processJuEventsCombined() {
  try {
    // Get the minimum last processed block among both event types
    const lastLocked = await getLastProcessedBlock("JU", "JuCoinLocked");
    const lastUnlocked = await getLastProcessedBlock("JU", "JuCoinUnlocked");
    const fromBlock = Math.min(lastLocked, lastUnlocked);
    const latestBlock = await STATE.providers.JU.getBlockNumber();
    const toBlock = Math.min(fromBlock + CONFIG.SCAN_CONFIG.MAX_BLOCKS_PER_SCAN, latestBlock);
    
    if (fromBlock >= toBlock) {
      logger.debug("No new JU blocks to scan for events", { fromBlock, toBlock, latestBlock });
      return;
    }
    
    logger.info("Fetching combined JU events", { fromBlock, toBlock, range: toBlock - fromBlock });
    
    const iface = new ethers.Interface(ABIS.JU_BRIDGE);
    // Combine topics for both events
    const topics = [[ iface.getEvent("JuCoinLocked").topicHash, iface.getEvent("JuCoinUnlocked").topicHash ]];
    
    const logs = await STATE.providers.JU.getLogs({
      address: CONFIG.JU.BRIDGE_ADDRESS,
      topics,
      fromBlock,
      toBlock
    });
    
    for (const log of logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics, data: log.data });
        if (parsed.name === "JuCoinLocked") {
          await processSingleJuCoinLockedEvent(parsed, log);
        } else if (parsed.name === "JuCoinUnlocked") {
          await processSingleJuCoinUnlockedEvent(parsed, log);
        }
      } catch (err) {
        logger.warn("Failed to parse JU log", { blockNumber: log.blockNumber, txHash: log.transactionHash, error: err.message });
      }
    }
    
    // Update progress for both event types to toBlock
    await updateLastProcessedBlock("JU", "JuCoinLocked", toBlock);
    await updateLastProcessedBlock("JU", "JuCoinUnlocked", toBlock);
    
    logger.info("Completed processing combined JU events", { processedRange: toBlock - fromBlock });
  } catch (err) {
    logger.error("Error processing combined JU events", { error: err.message });
  }
}

/** Process combined BSC events: WjuBurned and WjuMinted */
async function processBscEventsCombined() {
  try {
    const lastBurned = await getLastProcessedBlock("BSC", "WjuBurned");
    const lastMinted = await getLastProcessedBlock("BSC", "WjuMinted");
    const fromBlock = Math.min(lastBurned, lastMinted);
    const latestBlock = await STATE.providers.BSC.getBlockNumber();
    const toBlock = Math.min(fromBlock + CONFIG.SCAN_CONFIG.MAX_BLOCKS_PER_SCAN, latestBlock);
    
    if (fromBlock >= toBlock) {
      logger.debug("No new BSC blocks to scan for events", { fromBlock, toBlock, latestBlock });
      return;
    }
    
    logger.info("Fetching combined BSC events", { fromBlock, toBlock, range: toBlock - fromBlock });
    
    const iface = new ethers.Interface(ABIS.BSC_BRIDGE);
    const topics = [[ iface.getEvent("WjuBurned").topicHash, iface.getEvent("WjuMinted").topicHash ]];
    
    const logs = await STATE.providers.BSC.getLogs({
      address: CONFIG.BSC.BRIDGE_ADDRESS,
      topics,
      fromBlock,
      toBlock
    });
    
    for (const log of logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics, data: log.data });
        if (parsed.name === "WjuBurned") {
          await processSingleWjuBurnedEvent(parsed, log);
        } else if (parsed.name === "WjuMinted") {
          await processSingleWjuMintedEvent(parsed, log);
        }
      } catch (err) {
        logger.warn("Failed to parse BSC log", { blockNumber: log.blockNumber, txHash: log.transactionHash, error: err.message });
      }
    }
    
    // Update progress for both event types to toBlock
    await updateLastProcessedBlock("BSC", "WjuBurned", toBlock);
    await updateLastProcessedBlock("BSC", "WjuMinted", toBlock);
    
    logger.info("Completed processing combined BSC events", { processedRange: toBlock - fromBlock });
  } catch (err) {
    logger.error("Error processing combined BSC events", { error: err.message });
  }
}

/**
 * --------------------------------------------------------------------
 * Individual event processing helpers (for combined queries)
 * --------------------------------------------------------------------
 */

async function processSingleJuCoinLockedEvent(parsed, log) {
  const { sender, amount } = parsed.args;
  const { transactionHash, blockNumber } = log;
  
  const existingEvent = await BridgeEvent.findOne({ txHash: transactionHash });
  let bridgeEvent = existingEvent;
  if (existingEvent && existingEvent.status === "MINTED") {
    logger.debug("Skipping already processed JuCoinLocked event", { txHash: transactionHash });
    return;
  }
  
  if (!bridgeEvent) {
    bridgeEvent = await BridgeEvent.create({
      bridgeAsset: "JU",
      fromChain: "JU",
      toChain: "BSC",
      eventName: "JuCoinLocked",
      status: "LOCKED",
      userAddress: sender,
      amount: amount.toString(),
      txHash: transactionHash,
      blockNumber,
      chainId: CONFIG.JU.CHAIN_ID
    });
    logger.info("Created JuCoinLocked event record", { id: bridgeEvent._id, txHash: transactionHash, amount: amount.toString() });
  } else {
    bridgeEvent.status = "LOCKED";
    await bridgeEvent.save();
    logger.info("Updated JuCoinLocked event record", { id: bridgeEvent._id, txHash: transactionHash });
  }
  
  // Execute cross-chain action: mintWju on BSC
  try {
    const bscBridge = STATE.contracts.BSC.connect(STATE.relayers.BSC);
    const feeData = await STATE.providers.BSC.getFeeData();
    const tx = await bscBridge.mintWju(
      sender,
      amount,
      { gasPrice: feeData.gasPrice, gasLimit: 300000 }
    );
    logger.info("Submitted mintWju transaction", { originalTxHash: transactionHash, mintTxHash: tx.hash, sender, amount: amount.toString() });
    const receipt = await tx.wait();
    bridgeEvent.status = "MINTED";
    bridgeEvent.relayed = true;
    await bridgeEvent.save();
    logger.info("Successfully minted WJU on BSC chain", { originalTxHash: transactionHash, mintTxHash: receipt.transactionHash, blockNumber: receipt.blockNumber });
  } catch (error) {
    logger.error("Failed to mint WJU on BSC chain", { txHash: transactionHash, error: error.message });
    bridgeEvent.status = "ERROR";
    bridgeEvent.errorMessage = error.message;
    await bridgeEvent.save();
  }
}

async function processSingleJuCoinUnlockedEvent(parsed, log) {
  const { recipient, amount } = parsed.args;
  const { transactionHash } = log;
  
  const existingEvent = await BridgeEvent.findOne({ txHash: transactionHash });
  if (existingEvent) {
    if (existingEvent.status !== "UNLOCKED") {
      existingEvent.status = "UNLOCKED";
      existingEvent.relayed = true;
      await existingEvent.save();
      logger.info("Updated JuCoinUnlocked event record", { txHash: transactionHash });
    }
    return;
  }
  
  await BridgeEvent.create({
    bridgeAsset: "JU",
    fromChain: "BSC",
    toChain: "JU",
    eventName: "JuCoinUnlocked",
    status: "UNLOCKED",
    userAddress: recipient,
    amount: amount.toString(),
    txHash: transactionHash,
    chainId: CONFIG.JU.CHAIN_ID,
    relayed: true
  });
  logger.info("Created JuCoinUnlocked event record", { txHash: transactionHash });
}

async function processSingleWjuBurnedEvent(parsed, log) {
  const { sender, amount } = parsed.args;
  const { transactionHash, blockNumber } = log;
  
  const existingEvent = await BridgeEvent.findOne({ txHash: transactionHash });
  let bridgeEvent = existingEvent;
  if (existingEvent && existingEvent.status === "UNLOCKED") {
    logger.debug("Skipping already processed WjuBurned event", { txHash: transactionHash });
    return;
  }
  
  if (!bridgeEvent) {
    bridgeEvent = await BridgeEvent.create({
      bridgeAsset: "JU",
      fromChain: "BSC",
      toChain: "JU",
      eventName: "WjuBurned",
      status: "BURNED",
      userAddress: sender,
      amount: amount.toString(),
      txHash: transactionHash,
      blockNumber,
      chainId: CONFIG.BSC.CHAIN_ID
    });
    logger.info("Created WjuBurned event record", { id: bridgeEvent._id, txHash: transactionHash, amount: amount.toString() });
  } else {
    bridgeEvent.status = "BURNED";
    await bridgeEvent.save();
    logger.info("Updated WjuBurned event record", { id: bridgeEvent._id, txHash: transactionHash });
  }
  
  // Execute cross-chain action: unlockJuCoin on JU
  try {
    const juBridge = STATE.contracts.JU.connect(STATE.relayers.JU);
    const feeData = await STATE.providers.JU.getFeeData();
    const tx = await juBridge.unlockJuCoin(
      sender,
      amount,
      { gasPrice: feeData.gasPrice, gasLimit: 300000 }
    );
    logger.info("Submitted unlockJuCoin transaction", { originalTxHash: transactionHash, unlockTxHash: tx.hash, sender, amount: amount.toString() });
    const receipt = await tx.wait();
    bridgeEvent.status = "UNLOCKED";
    bridgeEvent.relayed = true;
    await bridgeEvent.save();
    logger.info("Successfully unlocked JuCoin on JU chain", { originalTxHash: transactionHash, unlockTxHash: receipt.transactionHash, blockNumber: receipt.blockNumber });
  } catch (error) {
    logger.error("Failed to unlock JuCoin on JU chain", { txHash: transactionHash, error: error.message });
    bridgeEvent.status = "ERROR";
    bridgeEvent.errorMessage = error.message;
    await bridgeEvent.save();
  }
}

async function processSingleWjuMintedEvent(parsed, log) {
  const { recipient, amount } = parsed.args;
  const { transactionHash, blockNumber } = log;
  
  const existingEvent = await BridgeEvent.findOne({ txHash: transactionHash });
  if (existingEvent) {
    if (existingEvent.status !== "MINTED") {
      existingEvent.status = "MINTED";
      existingEvent.relayed = true;
      await existingEvent.save();
      logger.info("Updated existing record for WjuMinted event", { txHash: transactionHash });
    }
    return;
  }
  
  await BridgeEvent.create({
    bridgeAsset: "JU",
    fromChain: "JU",
    toChain: "BSC",
    eventName: "WjuMinted",
    status: "MINTED",
    userAddress: recipient,
    amount: amount.toString(),
    txHash: transactionHash,
    blockNumber,
    chainId: CONFIG.BSC.CHAIN_ID,
    relayed: true
  });
  logger.info("Created WjuMinted event record", { txHash: transactionHash, amount: amount.toString() });
}

/**
 * --------------------------------------------------------------------
 * Real-time event listeners
 * --------------------------------------------------------------------
 */
function setupRealtimeListeners() {
  // JU Listeners
  STATE.contracts.JU.on("JuCoinLocked", async (sender, amount, event) => {
    logger.info("Real-time: Detected JuCoinLocked event on JU", {
      sender,
      amount: amount.toString(),
      txHash: event.log.transactionHash
    });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    try {
      // Process this event individually
      await processSingleJuCoinLockedEvent({ args: { sender, amount } }, event.log);
    } catch (error) {
      logger.error("Real-time: Failed to process JuCoinLocked event", {
        txHash: event.log.transactionHash,
        error: error.message
      });
    }
  });
  
  STATE.contracts.BSC.on("WjuBurned", async (sender, amount, event) => {
    logger.info("Real-time: Detected WjuBurned event on BSC", {
      sender,
      amount: amount.toString(),
      txHash: event.log.transactionHash
    });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    try {
      await processSingleWjuBurnedEvent({ args: { sender, amount } }, event.log);
    } catch (error) {
      logger.error("Real-time: Failed to process WjuBurned event", {
        txHash: event.log.transactionHash,
        error: error.message
      });
    }
  });
  
  // Completion events for record keeping
  STATE.contracts.BSC.on("WjuMinted", async (recipient, amount, event) => {
    try {
      await recordEvent("WjuMinted", {
        recipient,
        amount,
        transactionHash: event.log.transactionHash,
        blockNumber: event.blockNumber,
        chainId: CONFIG.BSC.CHAIN_ID
      });
    } catch (error) {
      logger.error("Real-time: Failed to record WjuMinted event", {
        txHash: event.log.transactionHash,
        error: error.message
      });
    }
  });
  
  STATE.contracts.JU.on("JuCoinUnlocked", async (recipient, amount, event) => {
    try {
      await recordEvent("JuCoinUnlocked", {
        recipient,
        amount,
        transactionHash: event.log.transactionHash,
        blockNumber: event.blockNumber,
        chainId: CONFIG.JU.CHAIN_ID
      });
    } catch (error) {
      logger.error("Real-time: Failed to record JuCoinUnlocked event", {
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
  const fromChain = eventName === "WjuMinted" ? "JU" : "BSC";
  const toChain = eventName === "WjuMinted" ? "BSC" : "JU";
  const status = eventName === "WjuMinted" ? "MINTED" : "UNLOCKED";
  
  let bridgeEvent = await BridgeEvent.findOne({ txHash: transactionHash });
  if (!bridgeEvent) {
    bridgeEvent = await BridgeEvent.create({
      bridgeAsset: "JU",
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
  const pollJU = setInterval(processJuEventsCombined, CONFIG.SCAN_CONFIG.POLLING_INTERVAL);
  const pollBSC = setInterval(processBscEventsCombined, CONFIG.SCAN_CONFIG.POLLING_INTERVAL);
  
  STATE.intervals.push(pollJU, pollBSC);
  logger.info("Started event polling scheduler", { intervalMs: CONFIG.SCAN_CONFIG.POLLING_INTERVAL });
}

/**
 * Start the JU coin watcher service
 */
async function startJuCoinWatcher() {
  if (STATE.running) {
    logger.warn("JU coin watcher is already running");
    return;
  }
  
  try {
    logger.info("Starting JU coin watcher service...");
    
    await initializeConnections();
    setupRealtimeListeners();
    startPollingScheduler();
    
    // Run initial combined scans
    await Promise.all([
      processJuEventsCombined(),
      processBscEventsCombined()
    ]);
    
    STATE.running = true;
    logger.info("JU coin watcher service is fully operational");
  } catch (error) {
    logger.error("Failed to start JU coin watcher", { error: error.message });
  }
}

module.exports = { startJuCoinWatcher };