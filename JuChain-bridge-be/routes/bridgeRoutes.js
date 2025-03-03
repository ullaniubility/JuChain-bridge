const express = require("express");
const router = express.Router();
const BridgeEvent = require("../models/BridgeEvent");

router.get("/", async (req, res, next) => {
  try {
    const docs = await BridgeEvent.find().sort({ createdAt: -1 });
    return res.json(docs);
  } catch (err) {
    next(err);
  }
});

router.get("/user/:address", async (req, res, next) => {
  try {
    const address = req.params.address.toLowerCase();
    const docs = await BridgeEvent.find({ userAddress: address }).sort({ createdAt: -1 });
    return res.json(docs);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
