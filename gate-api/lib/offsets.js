"use strict";

const fs = require("fs");
const path = require("path");

const OFFSETS_JSON = path.join(__dirname, "..", "data", "offsets.json");
const CLIENT_VERSION_TXT = path.join(__dirname, "..", "data", "client-version.txt");

/**
 * Normalize a single field value into { hex, decimal }.
 * Accepts number, or { hex, decimal }, or hex string.
 */
function normalizeField(val) {
  if (val == null) return null;
  if (typeof val === "number" && Number.isFinite(val)) {
    const decimal = Math.trunc(val);
    return { hex: `0x${decimal.toString(16).toUpperCase()}`, decimal };
  }
  if (typeof val === "string") {
    const decimal = val.startsWith("0x") || val.startsWith("0X")
      ? parseInt(val, 16)
      : parseInt(val, 10);
    if (!Number.isFinite(decimal)) return null;
    return { hex: `0x${decimal.toString(16).toUpperCase()}`, decimal };
  }
  if (typeof val === "object") {
    if (typeof val.decimal === "number" && Number.isFinite(val.decimal)) {
      const decimal = Math.trunc(val.decimal);
      return {
        hex: val.hex || `0x${decimal.toString(16).toUpperCase()}`,
        decimal,
      };
    }
    if (typeof val.hex === "string") {
      const decimal = parseInt(val.hex, 16);
      if (!Number.isFinite(decimal)) return null;
      return { hex: `0x${decimal.toString(16).toUpperCase()}`, decimal };
    }
  }
  return null;
}

/**
 * Convert jonah/roblox-dumper JSON or imtheo-style JSON into OXIDE public dump shape.
 */
function normalizeDumperPayload(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "invalid_body", message: "Expected JSON object." };
  }

  // Already OXIDE-shaped
  if (body.namespaces && typeof body.namespaces === "object") {
    let total = 0;
    const namespaces = {};
    for (const [ns, fields] of Object.entries(body.namespaces)) {
      if (!fields || typeof fields !== "object") continue;
      namespaces[ns] = {};
      for (const [name, val] of Object.entries(fields)) {
        const n = normalizeField(val);
        if (!n) continue;
        namespaces[ns][name] = n;
        total += 1;
      }
    }
    return {
      ok: true,
      source: body.source || "OXIDE-dumper",
      robloxVersion:
        body.robloxVersion ||
        body.clientVersion ||
        (body.metadata && body.metadata.roblox_version) ||
        null,
      generatedAt: body.generatedAt || new Date().toISOString(),
      totalOffsets: body.totalOffsets || total,
      namespaces,
      dumpedWith: body.dumpedWith || body.dumper || null,
    };
  }

  // Jonah dumper: { metadata, offsets: { Class: { Field: number } } }
  // Imtheo: { "Roblox Version", Offsets: { Class: { Field: number } } }
  const rawOffsets = body.offsets || body.Offsets;
  if (!rawOffsets || typeof rawOffsets !== "object") {
    return {
      ok: false,
      error: "missing_offsets",
      message: "Body must include offsets/Offsets map or namespaces.",
    };
  }

  const namespaces = {};
  let total = 0;
  for (const [ns, fields] of Object.entries(rawOffsets)) {
    if (!fields || typeof fields !== "object") continue;
    namespaces[ns] = {};
    for (const [name, val] of Object.entries(fields)) {
      const n = normalizeField(val);
      if (!n) continue;
      namespaces[ns][name] = n;
      total += 1;
    }
  }

  const robloxVersion =
    body.robloxVersion ||
    body["Roblox Version"] ||
    (body.metadata && body.metadata.roblox_version) ||
    null;

  return {
    ok: true,
    source: body.source || "OXIDE-dumper",
    robloxVersion,
    generatedAt: body.generatedAt || body["Dumped At"] || new Date().toISOString(),
    totalOffsets: total,
    namespaces,
    dumpedWith:
      body.dumpedWith ||
      body["Dumper Version"] ||
      body["Dumped With"] ||
      (body.metadata && body.metadata.dumper) ||
      null,
  };
}

/**
 * Persist normalized dump to data/offsets.json (+ client-version.txt).
 */
function saveOffsetsDump(normalized) {
  if (!normalized || !normalized.ok) {
    return { ok: false, error: "invalid_dump", message: "Nothing to save." };
  }

  const out = {
    ok: true,
    source: normalized.source || "OXIDE-dumper",
    robloxVersion: normalized.robloxVersion || null,
    generatedAt: normalized.generatedAt || new Date().toISOString(),
    totalOffsets: normalized.totalOffsets || 0,
    namespaces: normalized.namespaces || {},
  };
  if (normalized.dumpedWith) out.dumpedWith = normalized.dumpedWith;

  fs.mkdirSync(path.dirname(OFFSETS_JSON), { recursive: true });
  fs.writeFileSync(OFFSETS_JSON, JSON.stringify(out, null, 2) + "\n", "utf8");

  if (out.robloxVersion) {
    fs.writeFileSync(CLIENT_VERSION_TXT, String(out.robloxVersion).trim() + "\n", "utf8");
  }

  return {
    ok: true,
    robloxVersion: out.robloxVersion,
    totalOffsets: out.totalOffsets,
    generatedAt: out.generatedAt,
    path: OFFSETS_JSON,
  };
}

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
        "Offsets dump not found. Run the OXIDE dumper or: node gate-api/scripts/export-offsets.js",
    };
  }

  return {
    ok: true,
    source: dump.source || "OXIDE",
    robloxVersion: dump.robloxVersion || null,
    generatedAt: dump.generatedAt || null,
    totalOffsets: dump.totalOffsets || 0,
    namespaces: dump.namespaces || {},
    dumpedWith: dump.dumpedWith || null,
    api: {
      json: "/api/offsets",
      raw: "/api/offsets/raw",
      hex: "/api/offsets/hex",
      hpp: "/api/offsets.hpp",
      cs: "/api/offsets.cs",
      txt: "/api/offsets.txt",
    },
  };
}

/** Flat decimal map like theo's Offsets.json (no hex wrappers). */
function rawOffsetsPayload() {
  const dump = loadOffsetsDump();
  if (!dump) return null;
  const Offsets = {};
  for (const [ns, fields] of Object.entries(dump.namespaces || {})) {
    Offsets[ns] = {};
    for (const [name, val] of Object.entries(fields || {})) {
      const n = normalizeField(val);
      if (!n) continue;
      Offsets[ns][name] = n.decimal;
    }
  }
  return {
    Source: "https://oxide-gate-api.onrender.com/api/offsets",
    "Roblox Version": dump.robloxVersion || null,
    "Dumped With": dump.dumpedWith || dump.source || "OXIDE-dumper",
    "Dumped At": dump.generatedAt || null,
    "Total Offsets": dump.totalOffsets || 0,
    Discord: process.env.DISCORD_INVITE || "https://discord.gg/3PXJ8r56T",
    Offsets,
  };
}

/** Hex-string map (theo OffsetsHex.json style). */
function hexOffsetsPayload() {
  const dump = loadOffsetsDump();
  if (!dump) return null;
  const Offsets = {};
  for (const [ns, fields] of Object.entries(dump.namespaces || {})) {
    Offsets[ns] = {};
    for (const [name, val] of Object.entries(fields || {})) {
      const n = normalizeField(val);
      if (!n) continue;
      Offsets[ns][name] = n.hex;
    }
  }
  return {
    Source: "https://oxide-gate-api.onrender.com/api/offsets",
    "Roblox Version": dump.robloxVersion || null,
    "Dumped With": dump.dumpedWith || dump.source || "OXIDE-dumper",
    "Dumped At": dump.generatedAt || null,
    "Total Offsets": dump.totalOffsets || 0,
    Offsets,
  };
}

function offsetsHpp() {
  const dump = loadOffsetsDump();
  if (!dump) return null;
  const ver = dump.robloxVersion || "unknown";
  let out = `// OXIDE offsets — ${ver}\n// Generated ${dump.generatedAt || ""}\n#pragma once\n#include <cstdint>\n\nnamespace offsets {\n`;
  out += `    inline constexpr const char* roblox_version = "${ver}";\n\n`;
  const nss = Object.keys(dump.namespaces || {}).sort();
  for (const ns of nss) {
    const fields = dump.namespaces[ns] || {};
    out += `    namespace ${ns} {\n`;
    for (const name of Object.keys(fields).sort()) {
      const n = normalizeField(fields[name]);
      if (!n) continue;
      out += `        inline constexpr uintptr_t ${name} = ${n.hex};\n`;
    }
    out += `    }\n\n`;
  }
  out += "} // namespace offsets\n";
  return out;
}

function offsetsCs() {
  const dump = loadOffsetsDump();
  if (!dump) return null;
  const ver = dump.robloxVersion || "unknown";
  let out = `// OXIDE offsets — ${ver}\n// Generated ${dump.generatedAt || ""}\nnamespace Offsets {\n`;
  out += `    public static class Meta {\n        public const string RobloxVersion = "${ver}";\n    }\n\n`;
  const nss = Object.keys(dump.namespaces || {}).sort();
  for (const ns of nss) {
    const fields = dump.namespaces[ns] || {};
    out += `    public static class ${ns} {\n`;
    for (const name of Object.keys(fields).sort()) {
      const n = normalizeField(fields[name]);
      if (!n) continue;
      out += `        public const ulong ${name} = ${n.hex};\n`;
    }
    out += `    }\n\n`;
  }
  out += "}\n";
  return out;
}

function offsetsTxt() {
  const dump = loadOffsetsDump();
  if (!dump) return null;
  const lines = [
    `OXIDE offsets`,
    `Roblox Version: ${dump.robloxVersion || "unknown"}`,
    `Dumped At: ${dump.generatedAt || ""}`,
    `Total: ${dump.totalOffsets || 0}`,
    "",
  ];
  const nss = Object.keys(dump.namespaces || {}).sort();
  for (const ns of nss) {
    lines.push(`[${ns}]`);
    const fields = dump.namespaces[ns] || {};
    for (const name of Object.keys(fields).sort()) {
      const n = normalizeField(fields[name]);
      if (!n) continue;
      lines.push(`${name} = ${n.hex} (${n.decimal})`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

module.exports = {
  loadOffsetsDump,
  publicOffsetsPayload,
  normalizeDumperPayload,
  saveOffsetsDump,
  rawOffsetsPayload,
  hexOffsetsPayload,
  offsetsHpp,
  offsetsCs,
  offsetsTxt,
  OFFSETS_JSON,
};
