require("dotenv").config();
const { ethers } = require("ethers");
const BridgeEvent = require("../models/BridgeEvent");
const BlockProgress = require("../models/BlockProgress");
const { logger } = require("../utils/logger")

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
    CHAIN_ID: parseInt(process.env.JU_CHAIN_ID, 10) || 66633666, // Replace with actual JU chain ID
  },
  RELAYER_PRIVATE_KEY: process.env.RELAYER_PRIVATE_KEY,
  SCAN_CONFIG: {
    MAX_BLOCKS_PER_SCAN: 500,     // Max block range for a single scan
    POLLING_INTERVAL: 10 * 60 * 1000, // 2 minutes
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
    // Use findOneAndUpdate with upsert to avoid race conditions
    const progress = await BlockProgress.findOneAndUpdate(
      { chain, asset: "WOW", eventType },
      {
        $setOnInsert: {
          lastProcessedBlock: await calculateStartBlock(chain),
          fullyCaughtUp: false
        }
      },
      { 
        upsert: true, 
        new: true,
        setDefaultsOnInsert: true
      }
    );
    
    return progress.lastProcessedBlock;
  } catch (error) {
    logger.error(`Error getting last processed block for ${chain}/${eventType}`, {
      error: error.message
    });
    throw error;
  }
}

// Helper function to calculate appropriate start block
async function calculateStartBlock(chain) {
  const currentBlock = await STATE.providers[chain].getBlockNumber();
  return Math.max(currentBlock - CONFIG.SCAN_CONFIG.MAX_BLOCKS_PER_SCAN, 0);
}

/**
 * Update last processed block
 */
async function updateLastProcessedBlock(chain, eventType, blockNumber) {
  try {
    await BlockProgress.findOneAndUpdate(
      { chain, asset: "WOW", eventType },
      { 
        lastProcessedBlock: blockNumber,
        fullyCaughtUp: true, 
        updatedAt: new Date()
      },
      { upsert: true }
    );
    
    logger.debug(`Updated progress for ${chain}/${eventType}`, { blockNumber });
  } catch (error) {
    logger.error(`Failed to update progress for ${chain}/${eventType}`, {
      blockNumber,
      error: error.message
    });
  }
}

/**
 * Fetch past events with automatic retry and pagination
 */
async function fetchPastEvents(chain, eventName, filter = {}) {
  let retries = 0;
  const contract = STATE.contracts[chain];
  const iface = new ethers.Interface(chain === "BSC" ? ABIS.BSC_BRIDGE : ABIS.JU_BRIDGE);
  
  // Determine block range
  const fromBlock = await getLastProcessedBlock(chain, eventName);
  const latestBlock = await STATE.providers[chain].getBlockNumber();
  const toBlock = Math.min(fromBlock + CONFIG.SCAN_CONFIG.MAX_BLOCKS_PER_SCAN, latestBlock);
  
  if (fromBlock >= toBlock) {
    logger.debug(`No new blocks to scan for ${chain}/${eventName}`, {
      fromBlock,
      toBlock,
      latestBlock
    });
    return { events: [], lastBlock: fromBlock };
  }
  
  logger.info(`Fetching ${eventName} events on ${chain}`, {
    fromBlock,
    toBlock,
    range: toBlock - fromBlock
  });
  
  // Build filter
  const eventFragment = iface.getEvent(eventName);
  const topics = [];
  
  // Add event signature as first topic
  topics.push(eventFragment.topicHash);
  
  // Add indexed parameter filters if provided
  if (filter.sender) {
    // Format address to proper hex format with padding
    const formattedSender = ethers.zeroPadValue(ethers.getAddress(filter.sender), 32);
    topics.push(formattedSender);
  }
  
  while (retries < CONFIG.SCAN_CONFIG.MAX_RETRIES) {
    try {
      // Use getLogs with specific topics for efficiency
      const logs = await STATE.providers[chain].getLogs({
        address: chain === "BSC" ? CONFIG.BSC.BRIDGE_ADDRESS : CONFIG.JU.BRIDGE_ADDRESS,
        topics,
        fromBlock,
        toBlock
      });
      
      // Parse the logs into events
      const events = logs.map(log => {
        try {
          const parsedLog = iface.parseLog({
            topics: log.topics,
            data: log.data
          });
          
          return {
            ...parsedLog,
            logIndex: log.index,
            transactionIndex: log.transactionIndex,
            transactionHash: log.transactionHash,
            blockHash: log.blockHash,
            blockNumber: log.blockNumber,
            address: log.address,
            chainId: chain === "BSC" ? CONFIG.BSC.CHAIN_ID : CONFIG.JU.CHAIN_ID
          };
        } catch (parseError) {
          logger.warn(`Failed to parse log`, {
            chain,
            eventName,
            blockNumber: log.blockNumber,
            txHash: log.transactionHash,
            error: parseError.message
          });
          return null;
        }
      }).filter(event => event !== null);
      
      // Return the parsed events and the last block we processed
      return { events, lastBlock: toBlock };
    } catch (error) {
      retries++;
      
      if (retries >= CONFIG.SCAN_CONFIG.MAX_RETRIES) {
        logger.error(`Failed to fetch ${eventName} events after ${retries} retries`, {
          chain,
          fromBlock,
          toBlock,
          error: error.message
        });
        throw error;
      }
      
      // Exponential backoff
      const delay = CONFIG.SCAN_CONFIG.RETRY_DELAY * Math.pow(2, retries - 1);
      logger.warn(`Fetch failed, retry in ${delay}ms`, {
        chain,
        eventName,
        attempt: retries,
        error: error.message
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Process WowLocked events (BSC -> JU)
 */
async function processWowLockedEvents() {
  try {
    const { events, lastBlock } = await fetchPastEvents("BSC", "WowLocked");
    
    if (events.length === 0) {
      await updateLastProcessedBlock("BSC", "WowLocked", lastBlock);
      return;
    }
    
    logger.info(`Processing ${events.length} WowLocked events`, {
      fromBlock: events[0].blockNumber,
      toBlock: events[events.length - 1].blockNumber
    });
    
    // Process each event
    for (const event of events) {
      const { sender, amount } = event.args;
      const { transactionHash, blockNumber } = event;
      
      // Check if already processed
      const existingEvent = await BridgeEvent.findOne({ txHash: transactionHash });
      if (existingEvent && existingEvent.status === "MINTED") {
        logger.debug(`Skipping already processed WowLocked event`, { txHash: transactionHash });
        continue;
      }
      
      // Create or update bridge event
      let bridgeEvent = existingEvent;
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
        
        logger.info(`Created WowLocked event record`, {
          id: bridgeEvent._id,
          txHash: transactionHash,
          amount: amount.toString()
        });
      } else {
        bridgeEvent.status = "LOCKED";
        await bridgeEvent.save();
        
        logger.info(`Updated WowLocked event record`, {
          id: bridgeEvent._id,
          txHash: transactionHash
        });
      }
      
      // Execute cross-chain action: mint WWOW on JU
      try {
        const juBridge = STATE.contracts.JU.connect(STATE.relayers.JU);
        const feeData = await STATE.providers.JU.getFeeData();
        
        const tx = await juBridge.mintWwow(
          sender,
          amount,
          {
            gasPrice: feeData.gasPrice,
            gasLimit: 300000
          }
        );
        
        logger.info(`Submitted mintWwow transaction`, {
          originalTxHash: transactionHash,
          mintTxHash: tx.hash,
          sender,
          amount: amount.toString()
        });
        
        const receipt = await tx.wait();
        
        // Update bridge event status
        bridgeEvent.status = "MINTED";
        bridgeEvent.relayed = true;
        await bridgeEvent.save();
        
        logger.info(`Successfully minted WWOW on JU chain`, {
          originalTxHash: transactionHash,
          mintTxHash: receipt.transactionHash,
          blockNumber: receipt.blockNumber
        });
      } catch (error) {
        logger.error(`Failed to mint WWOW on JU chain`, {
          txHash: transactionHash,
          error: error.message
        });
        
        // Update bridge event with error
        bridgeEvent.status = "ERROR";
        bridgeEvent.errorMessage = error.message;
        await bridgeEvent.save();
      }
    }
    
    // Update last processed block
    await updateLastProcessedBlock("BSC", "WowLocked", lastBlock);
    
    logger.info(`Completed processing WowLocked events`, {
      count: events.length,
      lastProcessedBlock: lastBlock
    });
  } catch (error) {
    logger.error(`Error processing WowLocked events`, {
      error: error.message,
      stack: error.stack
    });
  }
}

/**
 * Process WwowBurned events (JU -> BSC)
 */
async function processWwowBurnedEvents() {
  try {
    const { events, lastBlock } = await fetchPastEvents("JU", "WwowBurned");
    
    if (events.length === 0) {
      await updateLastProcessedBlock("JU", "WwowBurned", lastBlock);
      return;
    }
    
    logger.info(`Processing ${events.length} WwowBurned events`, {
      fromBlock: events[0].blockNumber,
      toBlock: events[events.length - 1].blockNumber
    });
    
    // Process each event
    for (const event of events) {
      const { sender, amount } = event.args;
      const { transactionHash, blockNumber } = event;
      
      // Check if already processed
      const existingEvent = await BridgeEvent.findOne({ txHash: transactionHash });
      if (existingEvent && existingEvent.status === "UNLOCKED") {
        logger.debug(`Skipping already processed WwowBurned event`, { txHash: transactionHash });
        continue;
      }
      
      // Create or update bridge event
      let bridgeEvent = existingEvent;
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
        
        logger.info(`Created WwowBurned event record`, {
          id: bridgeEvent._id,
          txHash: transactionHash,
          amount: amount.toString()
        });
      } else {
        bridgeEvent.status = "BURNED";
        await bridgeEvent.save();
        
        logger.info(`Updated WwowBurned event record`, {
          id: bridgeEvent._id,
          txHash: transactionHash
        });
      }
      
      // Execute cross-chain action: unlock WOW on BSC
      try {
        const bscBridge = STATE.contracts.BSC.connect(STATE.relayers.BSC);
        const feeData = await STATE.providers.BSC.getFeeData();
        
        const tx = await bscBridge.unlockWow(
          sender,
          amount,
          {
            gasPrice: feeData.gasPrice,
            gasLimit: 300000
          }
        );
        
        logger.info(`Submitted unlockWow transaction`, {
          originalTxHash: transactionHash,
          unlockTxHash: tx.hash,
          sender,
          amount: amount.toString()
        });
        
        const receipt = await tx.wait();
        console.log("🚀 ~ processWwowBurnedEvents ~ receipt:", receipt)
        
        // Update bridge event status
        bridgeEvent.status = "UNLOCKED";
        bridgeEvent.relayed = true;
        await bridgeEvent.save();
        
        logger.info(`Successfully unlocked WOW on BSC chain`, {
          originalTxHash: transactionHash,
          unlockTxHash: receipt.transactionHash,
          blockNumber: receipt.blockNumber
        });
      } catch (error) {
        logger.error(`Failed to unlock WOW on BSC chain`, {
          txHash: transactionHash,
          error: error.message
        });
        
        // Update bridge event with error
        bridgeEvent.status = "ERROR";
        bridgeEvent.errorMessage = error.message;
        await bridgeEvent.save();
      }
    }
    
    // Update last processed block
    await updateLastProcessedBlock("JU", "WwowBurned", lastBlock);
    
    logger.info(`Completed processing WwowBurned events`, {
      count: events.length,
      lastProcessedBlock: lastBlock
    });
  } catch (error) {
    logger.error(`Error processing WwowBurned events`, {
      error: error.message,
      stack: error.stack
    });
  }
}

/**
 * Process WwowMinted events (BSC -> JU confirmation)
 */
async function processWwowMintedEvents() {
  try {
    const { events, lastBlock } = await fetchPastEvents("JU", "WwowMinted");
    
    if (events.length === 0) {
      await updateLastProcessedBlock("JU", "WwowMinted", lastBlock);
      return;
    }
    
    logger.info(`Processing ${events.length} WwowMinted events for record keeping`, {
      lastBlock
    });
    
    // Only record these events - no cross-chain action needed
    for (const event of events) {
      const { recipient, amount } = event.args;
      const { transactionHash, blockNumber } = event;
      
      // Check if already recorded
      const existingEvent = await BridgeEvent.findOne({ txHash: transactionHash });
      if (existingEvent) {
        // Just update status if needed
        if (existingEvent.status !== "MINTED") {
          existingEvent.status = "MINTED";
          existingEvent.relayed = true;
          await existingEvent.save();
          
          logger.info(`Updated existing record for WwowMinted event`, {
            id: existingEvent._id,
            txHash: transactionHash
          });
        }
        continue;
      }
      
      // Create new record
      const bridgeEvent = await BridgeEvent.create({
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
      
      logger.info(`Created WwowMinted event record`, {
        id: bridgeEvent._id,
        txHash: transactionHash,
        amount: amount.toString()
      });
    }
    
    // Update last processed block
    await updateLastProcessedBlock("JU", "WwowMinted", lastBlock);
  } catch (error) {
    logger.error(`Error processing WwowMinted events`, {
      error: error.message
    });
  }
}

/**
 * Process WowUnlocked events (JU -> BSC confirmation)
 */
async function processWowUnlockedEvents() {
  try {
    const { events, lastBlock } = await fetchPastEvents("BSC", "WowUnlocked");
    
    if (events.length === 0) {
      await updateLastProcessedBlock("BSC", "WowUnlocked", lastBlock);
      return;
    }
    
    logger.info(`Processing ${events.length} WowUnlocked events for record keeping`, {
      lastBlock
    });
    
    // Only record these events - no cross-chain action needed
    for (const event of events) {
      const { recipient, amount } = event.args;
      const { transactionHash, blockNumber } = event;
      
      // Check if already recorded
      const existingEvent = await BridgeEvent.findOne({ txHash: transactionHash });
      if (existingEvent) {
        // Just update status if needed
        if (existingEvent.status !== "UNLOCKED") {
          existingEvent.status = "UNLOCKED";
          existingEvent.relayed = true;
          await existingEvent.save();
          
          logger.info(`Updated existing record for WowUnlocked event`, {
            id: existingEvent._id,
            txHash: transactionHash
          });
        }
        continue;
      }
      
      // Create new record
      const bridgeEvent = await BridgeEvent.create({
        bridgeAsset: "WOW",
        fromChain: "JU",
        toChain: "BSC",
        eventName: "WowUnlocked",
        status: "UNLOCKED",
        userAddress: recipient,
        amount: amount.toString(),
        txHash: transactionHash,
        blockNumber,
        chainId: CONFIG.BSC.CHAIN_ID,
        relayed: true
      });
      
      logger.info(`Created WowUnlocked event record`, {
        id: bridgeEvent._id,
        txHash: transactionHash,
        amount: amount.toString()
      });
    }
    
    // Update last processed block
    await updateLastProcessedBlock("BSC", "WowUnlocked", lastBlock);
  } catch (error) {
    logger.error(`Error processing WowUnlocked events`, {
      error: error.message
    });
  }
}

/**
 * Setup real-time event listeners for bridge contracts
 */
function setupRealtimeListeners() {
  // BSC Listeners
  STATE.contracts.BSC.on("WowLocked", async (sender, amount, event) => {
    console.log("🚀 ~ STATE.contracts.BSC.on ~ event:", event)
    logger.info("Real-time: Detected WowLocked event on BSC", {
      sender,
      amount: amount.toString(),
      txHash: event.log.transactionHash
    });
    
    // Wait for 1 block confirmation before processing
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    try {
      // Create bridge record
      let bridgeEvent = await BridgeEvent.findOne({ txHash: event.log.transactionHash });
      if (!bridgeEvent) {
        bridgeEvent = await BridgeEvent.create({
          bridgeAsset: "WOW",
          fromChain: "BSC",
          toChain: "JU",
          eventName: "WowLocked",
          status: "LOCKED",
          userAddress: sender,
          amount: amount.toString(),
          txHash: event.log.transactionHash,
          blockNumber: event.blockNumber,
          chainId: CONFIG.BSC.CHAIN_ID
        });
      } else if (bridgeEvent.status === "MINTED") {
        // Already processed
        return;
      }
      
      // Execute cross-chain action - mint on JU
      const juBridge = STATE.contracts.JU.connect(STATE.relayers.JU);
      const feeData = await STATE.providers.JU.getFeeData();
      
      const tx = await juBridge.mintWwow(
        sender,
        amount,
        {
          gasPrice: feeData.gasPrice,
          gasLimit: 300000
        }
      );
      
      logger.info("Real-time: Submitted mintWwow transaction", {
        originalTxHash:event.log.transactionHash,
        mintTxHash: tx.hash
      });
      
      const receipt = await tx.wait();
      
      // Update bridge record
      bridgeEvent.status = "MINTED";
      bridgeEvent.relayed = true;
      await bridgeEvent.save();
      
      logger.info("Real-time: Successfully completed mintWwow transaction", {
        originalTxHash: event.log.transactionHash,
        mintTxHash: receipt.transactionHash
      });
    } catch (error) {
      logger.error("Real-time: Failed to process WowLocked event", {
        txHash: event.log.transactionHash,
        error: error.message
      });
    }
  });
  
  // JU Listeners
  STATE.contracts.JU.on("WwowBurned", async (sender, amount, event) => {
    logger.info("Real-time: Detected WwowBurned event on JU", {
      sender,
      amount: amount.toString(),
      txHash: event.log.transactionHash
    });
    
    // Wait for 1 block confirmation before processing
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    try {
      // Create bridge record
      let bridgeEvent = await BridgeEvent.findOne({ txHash: event.log.transactionHash });
      if (!bridgeEvent) {
        bridgeEvent = await BridgeEvent.create({
          bridgeAsset: "WOW",
          fromChain: "JU",
          toChain: "BSC",
          eventName: "WwowBurned",
          status: "BURNED",
          userAddress: sender,
          amount: amount.toString(),
          txHash: event.log.transactionHash,
          blockNumber: event.blockNumber,
          chainId: CONFIG.JU.CHAIN_ID
        });
      } else if (bridgeEvent.status === "UNLOCKED") {
        // Already processed
        return;
      }
      
      // Execute cross-chain action - unlock on BSC
      const bscBridge = STATE.contracts.BSC.connect(STATE.relayers.BSC);
      const feeData = await STATE.providers.BSC.getFeeData();
      
      const tx = await bscBridge.unlockWow(
        sender,
        amount,
        {
          gasPrice: feeData.gasPrice,
          gasLimit: 300000
        }
      );
      
      logger.info("Real-time: Submitted unlockWow transaction", {
        originalTxHash: event.log.transactionHash,
        unlockTxHash: tx.hash
      });
      
      const receipt = await tx.wait();
      
      // Update bridge record
      bridgeEvent.status = "UNLOCKED";
      bridgeEvent.relayed = true;
      await bridgeEvent.save();
      
      logger.info("Real-time: Successfully completed unlockWow transaction", {
        originalTxHash: event.log.transactionHash,
        unlockTxHash: receipt.transactionHash
      });
    } catch (error) {
      logger.error("Real-time: Failed to process WwowBurned event", {
        txHash: event.log.transactionHash,
        error: error.message
      });
    }
  });
  
  // Also listen for completion events (for record keeping)
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
 * Helper function to record completion events
 */
async function recordEvent(eventName, eventData) {
  const { recipient, amount, transactionHash, blockNumber, chainId } = eventData;
  
  // Determine chain and direction based on the event
  const fromChain = eventName === "WwowMinted" ? "BSC" : "JU";
  const toChain = eventName === "WwowMinted" ? "JU" : "BSC";
  const status = eventName === "WwowMinted" ? "MINTED" : "UNLOCKED";
  
  // Check if event is already recorded
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
    
    logger.info(`Real-time: Recorded ${eventName} event`, {
      id: bridgeEvent._id,
      txHash: transactionHash
    });
  } else {
    // Update status if needed
    if (bridgeEvent.status !== status) {
      bridgeEvent.status = status;
      bridgeEvent.relayed = true;
      await bridgeEvent.save();
      
      logger.info(`Real-time: Updated ${eventName} event record`, {
        id: bridgeEvent._id,
        txHash: transactionHash
      });
    }
  }
}

/**
 * Start scheduled polling for each event type
 */
function startPollingScheduler() {
  // Schedule polling for each event type
  const pollWowLocked = setInterval(processWowLockedEvents, CONFIG.SCAN_CONFIG.POLLING_INTERVAL);
  const pollWwowBurned = setInterval(processWwowBurnedEvents, CONFIG.SCAN_CONFIG.POLLING_INTERVAL);
  const pollWwowMinted = setInterval(processWwowMintedEvents, CONFIG.SCAN_CONFIG.POLLING_INTERVAL);
  const pollWowUnlocked = setInterval(processWowUnlockedEvents, CONFIG.SCAN_CONFIG.POLLING_INTERVAL);
  
  // Store intervals for cleanup
  STATE.intervals.push(pollWowLocked, pollWwowBurned, pollWwowMinted, pollWowUnlocked);
  
  logger.info("Started event polling scheduler", {
    intervalMs: CONFIG.SCAN_CONFIG.POLLING_INTERVAL
  });
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
    
    // Initialize connections
    await initializeConnections();
    
    // Set up real-time listeners for immediate response
    setupRealtimeListeners();
    
    // Start polling scheduler for missed events
    startPollingScheduler();
    
    // Run initial scans 
    await Promise.all([
      processWowLockedEvents(),
      processWwowBurnedEvents(),
      processWwowMintedEvents(),
      processWowUnlockedEvents()
    ]);
    
    STATE.running = true;
    logger.info("WOW watcher service is fully operational");
  } catch (error) {
    logger.error("Failed to start WOWWatccher");
  }
}


module.exports = { startWowWatcher };