/**
 * CLI: create keys with ADMIN_SECRET from .env
 * Usage:
 *   node create-keys.js --plan week --count 5 --days 7
 *   node create-keys.js --plan lifetime --count 1
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  return fallback;
}

const plan = arg("plan", "premium");
const count = Number(arg("count", "1"));
const daysRaw = arg("days", "");
const days =
  daysRaw === "" || daysRaw === "null" || daysRaw === "0"
    ? plan === "lifetime"
      ? null
      : plan === "week"
        ? 7
        : plan === "month"
          ? 30
          : 30
    : Number(daysRaw);

(async () => {
  const dbModule = require("./lib/db");
  await dbModule.initDb();
  const { createKeys } = require("./lib/keys");
  const result = createKeys({ plan, count, days });
  if (typeof dbModule.flushToPostgres === "function") {
    await dbModule.flushToPostgres().catch(() => {});
  }
  console.log(
    JSON.stringify(
      { ok: true, plan, days: result.days, keys: result.keys.map((k) => k.key) },
      null,
      2
    )
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
