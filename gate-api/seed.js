/**
 * Seed demo keys into SQLite (also runs automatically on server start).
 * Usage: npm run seed
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
require("./lib/db");
const { seedDemoKeys } = require("./lib/keys");

const keys = seedDemoKeys();
console.log("Seeded demo keys (unused if new):");
keys.forEach((k) => console.log(" ", k));
console.log("\nRedeem on the gate site or validate from Oxide.exe.");
