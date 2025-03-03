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
    MAX_BLOCKS_PER_SCAN: 500,          // Max block range for a single scan
    POLLING_INTERVAL: 2 * 60 * 1000,  // e.g. 10 minutes
    RETRY_DELAY: 10000,                // 10 seconds initial retry delay
    MAX_RETRIES: 5                     // Maximum retry attempts
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

    logger.info("Successfully initialized blockchain connections for JuCoin watcher");
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
      { chain, asset: "JU", eventType },
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
      { chain, asset: "JU", eventType },
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
  // Determine which interface to use based on the chain
  const iface = new ethers.Interface(
    chain === "JU" ? ABIS.JU_BRIDGE : ABIS.BSC_BRIDGE
  );

  // Determine block range
  const fromBlock = await getLastProcessedBlock(chain, eventName);
  const latestBlock = await STATE.providers[chain].getBlockNumber();
  const toBlock = Math.min(
    fromBlock + CONFIG.SCAN_CONFIG.MAX_BLOCKS_PER_SCAN,
    latestBlock
  );

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
    const formattedSender = ethers.zeroPadValue(
      ethers.getAddress(filter.sender),
      32
    );
    topics.push(formattedSender);
  }

  while (retries < CONFIG.SCAN_CONFIG.MAX_RETRIES) {
    try {
      // Use getLogs with specific topics for efficiency
      const logs = await STATE.providers[chain].getLogs({
        address:
          chain === "JU"
            ? CONFIG.JU.BRIDGE_ADDRESS
            : CONFIG.BSC.BRIDGE_ADDRESS,
        topics,
        fromBlock,
        toBlock
      });

      // Parse the logs into events
      const events = logs
        .map((log) => {
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
              chainId: chain === "JU" ? CONFIG.JU.CHAIN_ID : CONFIG.BSC.CHAIN_ID
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
        })
        .filter((event) => event !== null);

      // Return the parsed events and the last block we processed
      return { events, lastBlock: toBlock };
    } catch (error) {
      retries++;

      if (retries >= CONFIG.SCAN_CONFIG.MAX_RETRIES) {
        logger.error(
          `Failed to fetch ${eventName} events after ${retries} retries`,
          {
            chain,
            fromBlock,
            toBlock,
            error: error.message
          }
        );
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

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * Process JuCoinLocked events (JU -> BSC)
 *  - On JU, user locks JuCoin
 *  - We then mint Wju on BSC
 */
async function processJuCoinLockedEvents() {
  try {
    const { events, lastBlock } = await fetchPastEvents("JU", "JuCoinLocked");

    if (events.length === 0) {
      await updateLastProcessedBlock("JU", "JuCoinLocked", lastBlock);
      return;
    }

    logger.info(`Processing ${events.length} JuCoinLocked events`, {
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
        logger.debug(`Skipping already processed JuCoinLocked event`, {
          txHash: transactionHash
        });
        continue;
      }

      // Create or update bridge event
      let bridgeEvent = existingEvent;
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

        logger.info(`Created JuCoinLocked event record`, {
          id: bridgeEvent._id,
          txHash: transactionHash,
          amount: amount.toString()
        });
      } else {
        bridgeEvent.status = "LOCKED";
        await bridgeEvent.save();

        logger.info(`Updated JuCoinLocked event record`, {
          id: bridgeEvent._id,
          txHash: transactionHash
        });
      }

      // Execute cross-chain action: mint Wju on BSC
      try {
        const bscBridge = STATE.contracts.BSC.connect(STATE.relayers.BSC);
        const feeData = await STATE.providers.BSC.getFeeData();

        const tx = await bscBridge.mintWju(sender, amount, {
          gasPrice: feeData.gasPrice,
          gasLimit: 300000
        });

        logger.info(`Submitted mintWju transaction`, {
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

        logger.info(`Successfully minted Wju on BSC chain`, {
          originalTxHash: transactionHash,
          mintTxHash: receipt.transactionHash,
          blockNumber: receipt.blockNumber
        });
      } catch (error) {
        logger.error(`Failed to mint Wju on BSC chain`, {
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
    await updateLastProcessedBlock("JU", "JuCoinLocked", lastBlock);

    logger.info(`Completed processing JuCoinLocked events`, {
      count: events.length,
      lastProcessedBlock: lastBlock
    });
  } catch (error) {
    logger.error(`Error processing JuCoinLocked events`, {
      error: error.message,
      stack: error.stack
    });
  }
}

/**
 * Process WjuBurned events (BSC -> JU)
 *  - On BSC, user burns Wju
 *  - We then unlock JuCoin on JU
 */
async function processWjuBurnedEvents() {
  try {
    const { events, lastBlock } = await fetchPastEvents("BSC", "WjuBurned");

    if (events.length === 0) {
      await updateLastProcessedBlock("BSC", "WjuBurned", lastBlock);
      return;
    }

    logger.info(`Processing ${events.length} WjuBurned events`, {
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
        logger.debug(`Skipping already processed WjuBurned event`, {
          txHash: transactionHash
        });
        continue;
      }

      // Create or update bridge event
      let bridgeEvent = existingEvent;
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

        logger.info(`Created WjuBurned event record`, {
          id: bridgeEvent._id,
          txHash: transactionHash,
          amount: amount.toString()
        });
      } else {
        bridgeEvent.status = "BURNED";
        await bridgeEvent.save();

        logger.info(`Updated WjuBurned event record`, {
          id: bridgeEvent._id,
          txHash: transactionHash
        });
      }

      // Execute cross-chain action: unlock JuCoin on JU
      try {
        const juBridge = STATE.contracts.JU.connect(STATE.relayers.JU);
        const feeData = await STATE.providers.JU.getFeeData();

        // Notice unlockJuCoin takes address payable, but in most EVMs you can still pass a normal address
        const tx = await juBridge.unlockJuCoin(sender, amount, {
          gasPrice: feeData.gasPrice,
          gasLimit: 300000
        });

        logger.info(`Submitted unlockJuCoin transaction`, {
          originalTxHash: transactionHash,
          unlockTxHash: tx.hash,
          sender,
          amount: amount.toString()
        });

        const receipt = await tx.wait();

        // Update bridge event status
        bridgeEvent.status = "UNLOCKED";
        bridgeEvent.relayed = true;
        await bridgeEvent.save();

        logger.info(`Successfully unlocked JuCoin on JU chain`, {
          originalTxHash: transactionHash,
          unlockTxHash: receipt.transactionHash,
          blockNumber: receipt.blockNumber
        });
      } catch (error) {
        logger.error(`Failed to unlock JuCoin on JU chain`, {
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
    await updateLastProcessedBlock("BSC", "WjuBurned", lastBlock);

    logger.info(`Completed processing WjuBurned events`, {
      count: events.length,
      lastProcessedBlock: lastBlock
    });
  } catch (error) {
    logger.error(`Error processing WjuBurned events`, {
      error: error.message,
      stack: error.stack
    });
  }
}

/**
 * Process WjuMinted events (JU -> BSC confirmation)
 *  - Only record these events (no cross-chain action needed)
 */
async function processWjuMintedEvents() {
  try {
    const { events, lastBlock } = await fetchPastEvents("BSC", "WjuMinted");

    if (events.length === 0) {
      await updateLastProcessedBlock("BSC", "WjuMinted", lastBlock);
      return;
    }

    logger.info(`Processing ${events.length} WjuMinted events for record keeping`, {
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

          logger.info(`Updated existing record for WjuMinted event`, {
            id: existingEvent._id,
            txHash: transactionHash
          });
        }
        continue;
      }

      // Create new record
      const bridgeEvent = await BridgeEvent.create({
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

      logger.info(`Created WjuMinted event record`, {
        id: bridgeEvent._id,
        txHash: transactionHash,
        amount: amount.toString()
      });
    }

    // Update last processed block
    await updateLastProcessedBlock("BSC", "WjuMinted", lastBlock);
  } catch (error) {
    logger.error(`Error processing WjuMinted events`, {
      error: error.message
    });
  }
}

/**
 * Process JuCoinUnlocked events (BSC -> JU confirmation)
 *  - Only record these events (no cross-chain action needed)
 */
async function processJuCoinUnlockedEvents() {
  try {
    const { events, lastBlock } = await fetchPastEvents("JU", "JuCoinUnlocked");

    if (events.length === 0) {
      await updateLastProcessedBlock("JU", "JuCoinUnlocked", lastBlock);
      return;
    }

    logger.info(`Processing ${events.length} JuCoinUnlocked events for record keeping`, {
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

          logger.info(`Updated existing record for JuCoinUnlocked event`, {
            id: existingEvent._id,
            txHash: transactionHash
          });
        }
        continue;
      }

      // Create new record
      const bridgeEvent = await BridgeEvent.create({
        bridgeAsset: "JU",
        fromChain: "BSC",
        toChain: "JU",
        eventName: "JuCoinUnlocked",
        status: "UNLOCKED",
        userAddress: recipient,
        amount: amount.toString(),
        txHash: transactionHash,
        blockNumber,
        chainId: CONFIG.JU.CHAIN_ID,
        relayed: true
      });

      logger.info(`Created JuCoinUnlocked event record`, {
        id: bridgeEvent._id,
        txHash: transactionHash,
        amount: amount.toString()
      });
    }

    // Update last processed block
    await updateLastProcessedBlock("JU", "JuCoinUnlocked", lastBlock);
  } catch (error) {
    logger.error(`Error processing JuCoinUnlocked events`, {
      error: error.message
    });
  }
}

/**
 * Setup real-time event listeners for both chains
 */
function setupRealtimeListeners() {
  // JU Listeners
  STATE.contracts.JU.on("JuCoinLocked", async (sender, amount, event) => {
    logger.info("Real-time: Detected JuCoinLocked event on JU", {
      sender,
      amount: amount.toString(),
      txHash: event.log.transactionHash
    });

    // Wait a short delay for block finality if desired
    await new Promise((resolve) => setTimeout(resolve, 3000));

    try {
      // Check if we already have a record
      let bridgeEvent = await BridgeEvent.findOne({
        txHash: event.log.transactionHash
      });

      if (!bridgeEvent) {
        bridgeEvent = await BridgeEvent.create({
          bridgeAsset: "JU",
          fromChain: "JU",
          toChain: "BSC",
          eventName: "JuCoinLocked",
          status: "LOCKED",
          userAddress: sender,
          amount: amount.toString(),
          txHash: event.log.transactionHash,
          blockNumber: event.blockNumber,
          chainId: CONFIG.JU.CHAIN_ID
        });
      } else if (bridgeEvent.status === "MINTED") {
        // Already processed
        return;
      } else {
        bridgeEvent.status = "LOCKED";
        await bridgeEvent.save();
      }

      // Cross-chain action: mint Wju on BSC
      const bscBridge = STATE.contracts.BSC.connect(STATE.relayers.BSC);
      const feeData = await STATE.providers.BSC.getFeeData();

      const tx = await bscBridge.mintWju(sender, amount, {
        gasPrice: feeData.gasPrice,
        gasLimit: 300000
      });

      logger.info("Real-time: Submitted mintWju transaction", {
        originalTxHash: event.log.transactionHash,
        mintTxHash: tx.hash
      });

      const receipt = await tx.wait();

      // Update record
      bridgeEvent.status = "MINTED";
      bridgeEvent.relayed = true;
      await bridgeEvent.save();

      logger.info("Real-time: Successfully completed mintWju transaction", {
        originalTxHash: event.log.transactionHash,
        mintTxHash: receipt.transactionHash
      });
    } catch (error) {
      logger.error("Real-time: Failed to process JuCoinLocked event", {
        txHash: event.log.transactionHash,
        error: error.message
      });
    }
  });

  STATE.contracts.JU.on("JuCoinUnlocked", async (recipient, amount, event) => {
    logger.info("Real-time: Detected JuCoinUnlocked event on JU", {
      recipient,
      amount: amount.toString(),
      txHash: event.log.transactionHash
    });

    // Wait a short delay for block finality if desired
    await new Promise((resolve) => setTimeout(resolve, 3000));

    try {
      // Check if we already have a record
      let bridgeEvent = await BridgeEvent.findOne({
        txHash: event.log.transactionHash
      });

      if (!bridgeEvent) {
        bridgeEvent = await BridgeEvent.create({
          bridgeAsset: "JU",
          fromChain: "BSC",
          toChain: "JU",
          eventName: "JuCoinUnlocked",
          status: "UNLOCKED",
          userAddress: recipient,
          amount: amount.toString(),
          txHash: event.log.transactionHash,
          blockNumber: event.blockNumber,
          chainId: CONFIG.JU.CHAIN_ID,
          relayed: true
        });

        logger.info("Real-time: Created JuCoinUnlocked event record", {
          id: bridgeEvent._id,
          txHash: event.log.transactionHash
        });
      } else {
        // If not set to "UNLOCKED," update it
        if (bridgeEvent.status !== "UNLOCKED") {
          bridgeEvent.status = "UNLOCKED";
          bridgeEvent.relayed = true;
          await bridgeEvent.save();

          logger.info("Real-time: Updated existing JuCoinUnlocked event record", {
            id: bridgeEvent._id,
            txHash: event.log.transactionHash
          });
        }
      }
    } catch (error) {
      logger.error("Real-time: Failed to record JuCoinUnlocked event", {
        txHash: event.log.transactionHash,
        error: error.message
      });
    }
  });

  // BSC Listeners
  STATE.contracts.BSC.on("WjuBurned", async (sender, amount, event) => {
    logger.info("Real-time: Detected WjuBurned event on BSC", {
      sender,
      amount: amount.toString(),
      txHash: event.log.transactionHash
    });

    // Wait a short delay for block finality if desired
    await new Promise((resolve) => setTimeout(resolve, 3000));

    try {
      // Check if we already have a record
      let bridgeEvent = await BridgeEvent.findOne({
        txHash: event.log.transactionHash
      });

      if (!bridgeEvent) {
        bridgeEvent = await BridgeEvent.create({
          bridgeAsset: "JU",
          fromChain: "BSC",
          toChain: "JU",
          eventName: "WjuBurned",
          status: "BURNED",
          userAddress: sender,
          amount: amount.toString(),
          txHash: event.log.transactionHash,
          blockNumber: event.blockNumber,
          chainId: CONFIG.BSC.CHAIN_ID
        });
      } else if (bridgeEvent.status === "UNLOCKED") {
        // Already processed
        return;
      } else {
        bridgeEvent.status = "BURNED";
        await bridgeEvent.save();
      }

      // Cross-chain action: unlock JuCoin on JU
      const juBridge = STATE.contracts.JU.connect(STATE.relayers.JU);
      const feeData = await STATE.providers.JU.getFeeData();

      const tx = await juBridge.unlockJuCoin(sender, amount, {
        gasPrice: feeData.gasPrice,
        gasLimit: 300000
      });

      logger.info("Real-time: Submitted unlockJuCoin transaction", {
        originalTxHash: event.log.transactionHash,
        unlockTxHash: tx.hash
      });

      const receipt = await tx.wait();

      // Update record
      bridgeEvent.status = "UNLOCKED";
      bridgeEvent.relayed = true;
      await bridgeEvent.save();

      logger.info("Real-time: Successfully unlocked JuCoin on JU chain", {
        originalTxHash: event.log.transactionHash,
        unlockTxHash: receipt.transactionHash
      });
    } catch (error) {
      logger.error("Real-time: Failed to process WjuBurned event", {
        txHash: event.log.transactionHash,
        error: error.message
      });
    }
  });

  STATE.contracts.BSC.on("WjuMinted", async (recipient, amount, event) => {
    logger.info("Real-time: Detected WjuMinted event on BSC", {
      recipient,
      amount: amount.toString(),
      txHash: event.log.transactionHash
    });

    // Wait a short delay for block finality if desired
    await new Promise((resolve) => setTimeout(resolve, 3000));

    try {
      // Check if we already have a record
      let bridgeEvent = await BridgeEvent.findOne({
        txHash: event.log.transactionHash
      });

      if (!bridgeEvent) {
        bridgeEvent = await BridgeEvent.create({
          bridgeAsset: "JU",
          fromChain: "JU",
          toChain: "BSC",
          eventName: "WjuMinted",
          status: "MINTED",
          userAddress: recipient,
          amount: amount.toString(),
          txHash: event.log.transactionHash,
          blockNumber: event.blockNumber,
          chainId: CONFIG.BSC.CHAIN_ID,
          relayed: true
        });

        logger.info("Real-time: Created WjuMinted event record", {
          id: bridgeEvent._id,
          txHash: event.log.transactionHash
        });
      } else {
        // If not set to "MINTED," update it
        if (bridgeEvent.status !== "MINTED") {
          bridgeEvent.status = "MINTED";
          bridgeEvent.relayed = true;
          await bridgeEvent.save();

          logger.info("Real-time: Updated existing WjuMinted event record", {
            id: bridgeEvent._id,
            txHash: event.log.transactionHash
          });
        }
      }
    } catch (error) {
      logger.error("Real-time: Failed to record WjuMinted event", {
        txHash: event.log.transactionHash,
        error: error.message
      });
    }
  });

  logger.info("Set up real-time event listeners for JuCoin on both chains");
}

/**
 * Start scheduled polling for each event type
 */
function startPollingScheduler() {
  // Schedule polling for each event type
  const pollJuCoinLocked = setInterval(
    processJuCoinLockedEvents,
    CONFIG.SCAN_CONFIG.POLLING_INTERVAL
  );
  const pollWjuBurned = setInterval(
    processWjuBurnedEvents,
    CONFIG.SCAN_CONFIG.POLLING_INTERVAL
  );
  const pollWjuMinted = setInterval(
    processWjuMintedEvents,
    CONFIG.SCAN_CONFIG.POLLING_INTERVAL
  );
  const pollJuCoinUnlocked = setInterval(
    processJuCoinUnlockedEvents,
    CONFIG.SCAN_CONFIG.POLLING_INTERVAL
  );

  // Store intervals for cleanup if needed
  STATE.intervals.push(
    pollJuCoinLocked,
    pollWjuBurned,
    pollWjuMinted,
    pollJuCoinUnlocked
  );

  logger.info("Started event polling scheduler for JuCoin", {
    intervalMs: CONFIG.SCAN_CONFIG.POLLING_INTERVAL
  });
}

/**
 * Start the JuCoin watcher service
 */
async function startJuCoinWatcher() {
  if (STATE.running) {
    logger.warn("JU coin watcher is already running");
    return;
  }

  try {
    logger.info("Starting JU coin watcher service...");

    // Initialize connections
    await initializeConnections();

    // Set up real-time listeners for immediate response
    setupRealtimeListeners();

    // Start polling scheduler for missed events
    startPollingScheduler();

    // Run initial scans
    await Promise.all([
      processJuCoinLockedEvents(),
      processWjuBurnedEvents(),
      processWjuMintedEvents(),
      processJuCoinUnlockedEvents()
    ]);

    STATE.running = true;
    logger.info("JU coin watcher service is fully operational");
  } catch (error) {
    logger.error("Failed to start JU coin watcher", { error: error.message });
  }
}

module.exports = { startJuCoinWatcher };
