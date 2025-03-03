require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const connectDB = require("./config/database");

const bridgeRoutes = require("./routes/bridgeRoutes");

const { runWowWatcher, startWowWatcher } = require("./watchers/wowWatcher");
const { runJuCoinWatcher, startJuCoinWatcher } = require("./watchers/juCoinWatcher");

const app = express();

app.use(cors());
app.use(helmet());
app.use(morgan("combined"));

app.use(express.json());

app.use("/api/bridge", bridgeRoutes);

app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({ message: err.message });
});

const PORT = process.env.PORT || 4000;

connectDB().then(() => {
  // Start watchers
//   runWowWatcher();
//   runJuCoinWatcher();
  startWowWatcher();
  startJuCoinWatcher();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
  });
});
