"use strict";

const { readJson, writeJson } = require("./store");

const FILE = "licenses.json";

/**
 * @typedef {{ key: string, plan?: string, planId?: string, expires?: string|null, downloadUrl?: string, redeemedAt: string }} LicenseRecord
 */

function load() {
  return readJson(FILE, { byUser: {} });
}

/**
 * @param {string} discordUserId
 * @returns {LicenseRecord|null}
 */
function getLicense(discordUserId) {
  const data = load();
  return data.byUser[String(discordUserId)] || null;
}

/**
 * @param {string} discordUserId
 * @param {LicenseRecord} record
 */
function setLicense(discordUserId, record) {
  const data = load();
  data.byUser[String(discordUserId)] = {
    ...record,
    key: String(record.key || "").trim(),
    redeemedAt: record.redeemedAt || new Date().toISOString(),
  };
  writeJson(FILE, data);
  return data.byUser[String(discordUserId)];
}

/**
 * @param {string} discordUserId
 */
function clearLicense(discordUserId) {
  const data = load();
  delete data.byUser[String(discordUserId)];
  writeJson(FILE, data);
}

module.exports = { getLicense, setLicense, clearLicense };
