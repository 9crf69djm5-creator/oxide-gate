"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/** Single source of truth for Oxide.exe versions — written by release.ps1. */
const RELEASES_FILE = path.join(__dirname, "..", "data", "releases.json");

const hashCache = new Map();

function readReleasesFile() {
  try {
    if (!fs.existsSync(RELEASES_FILE)) return { product: "Oxide", releases: [] };
    const data = JSON.parse(fs.readFileSync(RELEASES_FILE, "utf8"));
    const releases = Array.isArray(data.releases) ? data.releases : [];
    return { ...data, releases };
  } catch (err) {
    console.warn("[releases] could not read releases.json:", err.message);
    return { product: "Oxide", releases: [] };
  }
}

/** SHA256 of a hosted file, cached by size + mtime. */
function sha256File(file) {
  try {
    const st = fs.statSync(file);
    const cacheKey = `${file}:${st.size}:${st.mtimeMs}`;
    if (hashCache.has(cacheKey)) return hashCache.get(cacheKey);
    const hash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    hashCache.clear();
    hashCache.set(cacheKey, hash);
    return hash;
  } catch {
    return null;
  }
}

/**
 * @param {object} release raw entry from releases.json
 * @param {{ apiBase: string, siteUrl: string, downloadsDir: string, latest: boolean }} ctx
 */
function decorate(release, ctx) {
  const v = encodeURIComponent(release.version);
  const exe = release.files?.["Oxide.exe"] || {};
  const out = {
    version: release.version,
    title: release.title || null,
    date: release.date || null,
    clientVersion: release.clientVersion || null,
    changes: Array.isArray(release.changes) ? release.changes : [],
    sha256: exe.sha256 || null,
    sizeBytes: exe.sizeBytes ?? null,
    files: release.files || {},
    downloadUrl: `${ctx.apiBase}/downloads/Oxide.exe?v=${v}`,
    siteDownloadUrl: `${ctx.siteUrl}/downloads/Oxide.exe?v=${v}`,
    changelogUrl: `${ctx.siteUrl}/changelog#v${release.version}`,
  };
  if (ctx.latest) {
    const hostedSha = sha256File(path.join(ctx.downloadsDir, "Oxide.exe"));
    out.hosted = {
      sha256: hostedSha,
      matches: Boolean(hostedSha && exe.sha256 && hostedSha.toLowerCase() === exe.sha256.toLowerCase()),
    };
  }
  return out;
}

function listReleases(ctx) {
  const { releases } = readReleasesFile();
  return releases.map((r, i) => decorate(r, { ...ctx, latest: i === 0 }));
}

function latestRelease(ctx) {
  const { releases } = readReleasesFile();
  if (!releases.length) return null;
  return decorate(releases[0], { ...ctx, latest: true });
}

function findRelease(version, ctx) {
  const want = String(version || "").replace(/^v/i, "");
  const { releases } = readReleasesFile();
  const idx = releases.findIndex((r) => r.version === want);
  if (idx < 0) return null;
  return decorate(releases[idx], { ...ctx, latest: idx === 0 });
}

module.exports = { listReleases, latestRelease, findRelease, sha256File, RELEASES_FILE };
