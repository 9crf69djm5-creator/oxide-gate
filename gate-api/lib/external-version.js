"use strict";

const fs = require("fs");
const path = require("path");

const ROBLOX_ENDPOINTS = [
  "https://clientsettingscdn.roblox.com/v2/client-version/WindowsPlayer",
  "https://clientsettings.roblox.com/v2/client-version/WindowsPlayer",
];

const VERSION_FILE = path.join(__dirname, "..", "data", "client-version.txt");
const OFFSETS_CANDIDATES = [
  path.join(__dirname, "..", "..", "External", "src", "sdk", "offsets.h"),
  path.join(__dirname, "..", "External", "src", "sdk", "offsets.h"),
];

function normalizeVersion(raw) {
  const v = String(raw || "").trim();
  if (!v) return null;
  if (v.startsWith("version-")) return v;
  return `version-${v}`;
}

/**
 * Hosted External / Oxide.exe client version the current build targets.
 * Prefer env (Render), then committed data/client-version.txt, then offsets.h.
 */
function readHostedClientVersion() {
  const fromEnv = normalizeVersion(
    process.env.HOSTED_CLIENT_VERSION || process.env.OXIDE_CLIENT_VERSION
  );
  if (fromEnv) {
    return { version: fromEnv, source: "env" };
  }

  try {
    if (fs.existsSync(VERSION_FILE)) {
      const text = fs.readFileSync(VERSION_FILE, "utf8").trim();
      const version = normalizeVersion(text.split(/\r?\n/)[0]);
      if (version) return { version, source: "file" };
    }
  } catch {
    /* ignore */
  }

  for (const file of OFFSETS_CANDIDATES) {
    try {
      if (!fs.existsSync(file)) continue;
      const text = fs.readFileSync(file, "utf8");
      const m = text.match(/ClientVersion\s*=\s*"([^"]+)"/);
      if (m) {
        return {
          version: normalizeVersion(m[1]),
          source: "offsets",
        };
      }
    } catch {
      /* ignore */
    }
  }

  return { version: null, source: null };
}

/**
 * @returns {Promise<{ version: string, clientVersionUpload?: string, numericVersion?: string, source: string }>}
 */
async function fetchLiveRobloxVersion() {
  let lastErr;
  for (const url of ROBLOX_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "OXIDE-GateAPI/1.0",
        },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const upload = data.clientVersionUpload || data.version || data.versionGuid || null;
      if (!upload) throw new Error("No version field in response");
      let display = upload;
      if (typeof data.version === "string" && data.version.startsWith("version-")) {
        display = data.version;
      } else if (!String(display).startsWith("version-")) {
        display = `version-${display}`;
      }
      return {
        version: normalizeVersion(display),
        clientVersionUpload: data.clientVersionUpload || upload,
        numericVersion: typeof data.version === "string" ? data.version : null,
        source: url,
      };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("All Roblox version endpoints failed");
}

function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Metadata for the hosted Oxide.exe on this API.
 * @param {string} downloadsDir
 * @param {string} downloadUrl
 */
function probeHostedExe(downloadsDir, downloadUrl) {
  const file = path.join(downloadsDir, "Oxide.exe");
  try {
    if (!fs.existsSync(file)) {
      return {
        ok: false,
        available: false,
        filename: "Oxide.exe",
        url: downloadUrl,
        sizeBytes: null,
        sizeLabel: null,
        modifiedAt: null,
        error: "missing_exe",
      };
    }
    const st = fs.statSync(file);
    return {
      ok: true,
      available: true,
      filename: "Oxide.exe",
      url: downloadUrl,
      sizeBytes: st.size,
      sizeLabel: formatBytes(st.size),
      modifiedAt: st.mtime.toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      available: false,
      filename: "Oxide.exe",
      url: downloadUrl,
      sizeBytes: null,
      sizeLabel: null,
      modifiedAt: null,
      error: err.message,
    };
  }
}

/**
 * Compare hosted offsets / EXE target vs live Roblox Windows client.
 */
async function collectExternalStatus() {
  const hosted = readHostedClientVersion();
  let live = null;
  let liveError = null;
  try {
    live = await fetchLiveRobloxVersion();
  } catch (err) {
    liveError = err.message || String(err);
  }

  const hostedVersion = hosted.version;
  const liveVersion = live?.version || null;
  const matched =
    Boolean(hostedVersion && liveVersion) && hostedVersion === liveVersion;

  let status = "unknown";
  let updateNeeded = null;
  let message = "Could not determine external update status.";

  if (!hostedVersion && !liveVersion) {
    status = "unknown";
    message = liveError
      ? `Hosted version missing; live Roblox fetch failed (${liveError}).`
      : "Hosted client version and live Roblox version are both unavailable.";
  } else if (!hostedVersion) {
    status = "unknown";
    message =
      "Live Roblox version known, but HOSTED_CLIENT_VERSION / client-version.txt is not set on the API.";
  } else if (!liveVersion) {
    status = "unknown";
    message = `Hosted build targets ${hostedVersion}, but live Roblox version could not be fetched${
      liveError ? ` (${liveError})` : ""
    }.`;
  } else if (matched) {
    status = "current";
    updateNeeded = false;
    message =
      "Hosted Oxide.exe / offsets match the live Roblox Windows client — no external update needed.";
  } else {
    status = "update_needed";
    updateNeeded = true;
    message =
      "Roblox updated. Hosted Oxide.exe / offsets are behind — an external update is needed.";
  }

  return {
    ok: status !== "unknown" || Boolean(hostedVersion || liveVersion),
    status,
    updateNeeded,
    matched,
    message,
    hostedClientVersion: hostedVersion,
    hostedVersionSource: hosted.source,
    liveRobloxVersion: liveVersion,
    liveClientVersionUpload: live?.clientVersionUpload || null,
    liveNumericVersion: live?.numericVersion || null,
    liveSource: live?.source || null,
    liveError,
    checkedAt: new Date().toISOString(),
  };
}

module.exports = {
  readHostedClientVersion,
  fetchLiveRobloxVersion,
  probeHostedExe,
  collectExternalStatus,
  formatBytes,
  normalizeVersion,
};
