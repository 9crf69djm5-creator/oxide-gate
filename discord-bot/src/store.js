"use strict";

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJson(filename, fallback) {
  ensureDataDir();
  const file = path.join(DATA_DIR, filename);
  try {
    if (!fs.existsSync(file)) return structuredClone(fallback);
    return { ...fallback, ...JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch {
    return structuredClone(fallback);
  }
}

function writeJson(filename, data) {
  ensureDataDir();
  const file = path.join(DATA_DIR, filename);
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

module.exports = { readJson, writeJson, DATA_DIR };
