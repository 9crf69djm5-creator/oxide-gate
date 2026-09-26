"use strict";

/**
 * Parse External/src/sdk/offsets.h → structured JSON for gate-api /api/offsets.
 *
 * Usage (from repo root or gate-api):
 *   node gate-api/scripts/export-offsets.js
 *   node scripts/export-offsets.js
 *
 * Writes:
 *   gate-api/data/offsets.json
 *   gate-api/data/client-version.txt
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const OFFSETS_H = path.join(ROOT, "External", "src", "sdk", "offsets.h");
const OUT_JSON = path.join(__dirname, "..", "data", "offsets.json");
const OUT_VERSION = path.join(__dirname, "..", "data", "client-version.txt");
const OUT_SITE = path.join(ROOT, "gate-site", "public", "offsets.json");

function parseOffsetsHeader(text) {
  const clientMatch = text.match(/ClientVersion\s*=\s*"([^"]+)"/);
  const clientVersion = clientMatch ? clientMatch[1] : null;

  /** @type {Record<string, Record<string, { hex: string, decimal: number }>>} */
  const namespaces = {};
  let current = null;
  let depth = 0;
  let inOffsets = false;

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();

    if (!inOffsets) {
      if (/^namespace\s+Offsets\s*\{/.test(trimmed)) {
        inOffsets = true;
        depth = 1;
      }
      continue;
    }

    const openNs = trimmed.match(/^namespace\s+(\w+)\s*\{/);
    if (openNs) {
      current = openNs[1];
      if (!namespaces[current]) namespaces[current] = {};
      depth += 1;
      continue;
    }

    if (trimmed === "}") {
      depth -= 1;
      if (depth === 1) current = null;
      if (depth <= 0) break;
      continue;
    }

    if (!current) continue;

    const field = trimmed.match(
      /^inline\s+constexpr\s+uintptr_t\s+(\w+)\s*=\s*(0x[0-9A-Fa-f]+|\d+)\s*;/
    );
    if (field) {
      const name = field[1];
      const raw = field[2];
      const decimal = raw.startsWith("0x") || raw.startsWith("0X")
        ? parseInt(raw, 16)
        : parseInt(raw, 10);
      const hex = `0x${decimal.toString(16).toUpperCase()}`;
      namespaces[current][name] = { hex, decimal };
    }
  }

  let total = 0;
  for (const ns of Object.keys(namespaces)) {
    total += Object.keys(namespaces[ns]).length;
  }

  return { clientVersion, namespaces, total };
}

function main() {
  if (!fs.existsSync(OFFSETS_H)) {
    console.error("Missing offsets.h at", OFFSETS_H);
    process.exit(1);
  }

  const text = fs.readFileSync(OFFSETS_H, "utf8");
  const { clientVersion, namespaces, total } = parseOffsetsHeader(text);
  if (!clientVersion) {
    console.error("Could not find ClientVersion in offsets.h");
    process.exit(1);
  }

  const payload = {
    ok: true,
    source: "OXIDE",
    robloxVersion: clientVersion,
    generatedAt: new Date().toISOString(),
    totalOffsets: total,
    namespaces,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2) + "\n", "utf8");
  fs.writeFileSync(OUT_VERSION, clientVersion + "\n", "utf8");
  try {
    fs.mkdirSync(path.dirname(OUT_SITE), { recursive: true });
    fs.writeFileSync(OUT_SITE, JSON.stringify(payload, null, 2) + "\n", "utf8");
    console.log(`Also wrote site mirror → ${OUT_SITE}`);
  } catch (err) {
    console.warn("Could not write gate-site mirror:", err.message);
  }

  console.log(
    `Wrote ${total} offsets across ${Object.keys(namespaces).length} namespaces → ${OUT_JSON}`
  );
  console.log(`Client version ${clientVersion} → ${OUT_VERSION}`);
}

main();
