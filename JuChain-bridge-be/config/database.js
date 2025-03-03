require("dotenv").config();
const mongoose = require("mongoose");

async function connectDB() {
  const mongoURI = process.env.MONGO_URI;
  if (!mongoURI) {
    throw new Error("MONGO_URI not set in .env");
  }

  try {
    await mongoose.connect(mongoURI, {});
    console.log("MongoDB connected successfully");
  } catch (err) {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  }
}

module.exports = connectDB;
