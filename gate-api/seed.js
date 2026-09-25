/**
 * Seed demo keys into SQLite (also runs automatically on server start).
 * Usage: npm run seed
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

async function main() {
  const dbModule = require("./lib/db");
  await dbModule.initDb();
  const { seedDemoKeys } = require("./lib/keys");
  const keys = seedDemoKeys();
  if (typeof dbModule.flushToPostgres === "function") {
    await dbModule.flushToPostgres().catch(() => {});
  }
  console.log("Seeded demo keys (unused if new):");
  keys.forEach((k) => console.log(" ", k));
  console.log("\nRedeem on the gate site or validate from Oxide.exe.");
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
