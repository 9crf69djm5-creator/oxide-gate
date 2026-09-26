"use strict";

const fs = require("fs");
const path = require("path");

const OFFSETS_JSON = path.join(__dirname, "..", "data", "offsets.json");

/**
 * Load the latest exported offsets dump (no secrets).
 * @returns {object | null}
 */
function loadOffsetsDump() {
  try {
    if (!fs.existsSync(OFFSETS_JSON)) return null;
    const raw = JSON.parse(fs.readFileSync(OFFSETS_JSON, "utf8"));
    if (!raw || typeof raw !== "object") return null;
    return raw;
  } catch {
    return null;
  }
}

/**
 * Public-safe offsets payload for /api/offsets.
 */
function publicOffsetsPayload() {
  const dump = loadOffsetsDump();
  if (!dump) {
    return {
      ok: false,
      error: "missing_offsets",
      message:
        "Offsets dump not found. Run: node gate-api/scripts/export-offsets.js",
    };
  }

  return {
    ok: true,
    source: dump.source || "OXIDE",
    robloxVersion: dump.robloxVersion || null,
    generatedAt: dump.generatedAt || null,
    totalOffsets: dump.totalOffsets || 0,
    namespaces: dump.namespaces || {},
  };
}

module.exports = {
  loadOffsetsDump,
  publicOffsetsPayload,
  OFFSETS_JSON,
};
