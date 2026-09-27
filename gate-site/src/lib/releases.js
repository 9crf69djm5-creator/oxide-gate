import { apiBase } from "./api";

/** Cache-busted EXE link so browsers / CDNs never hand out a stale build. */
export function versionedDownloadUrl(version) {
  const url = `${apiBase()}/downloads/Oxide.exe`;
  return version ? `${url}?v=${encodeURIComponent(version)}` : url;
}

function normalize(list) {
  return (list || []).map((r) => ({
    ...r,
    changes: Array.isArray(r.changes) ? r.changes : [],
    sha256: r.sha256 || r.files?.["Oxide.exe"]?.sha256 || null,
    sizeBytes: r.sizeBytes ?? r.files?.["Oxide.exe"]?.sizeBytes ?? null,
    downloadUrl: r.downloadUrl || versionedDownloadUrl(r.version),
  }));
}

/**
 * Release history from gate-api, falling back to the static copy that
 * release.ps1 writes into gate-site/public/releases.json.
 */
export async function fetchReleases() {
  // Always try API first with no cache
  try {
    const res = await fetch(`${apiBase()}/api/releases`, {
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(30000),
    });
    const body = await res.json().catch(() => null);
    if (res.ok && body?.ok) {
      console.log("Using API releases:", body.releases[0]?.version);
      return { ok: true, releases: normalize(body.releases) };
    }
  } catch (err) {
    console.warn("API fetch failed, falling back to static:", err.message);
  }
  // Fallback to static copy
  try {
    const res = await fetch("/releases.json", { cache: "no-cache" });
    const body = await res.json().catch(() => null);
    if (res.ok && Array.isArray(body?.releases)) {
      console.log("Using static releases:", body.releases[0]?.version);
      return { ok: true, releases: normalize(body.releases) };
    }
  } catch {
    /* ignore */
  }
  return { ok: false, releases: [], message: "Could not load the changelog." };
}

export function formatReleaseDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return String(iso);
  }
}

export function formatSize(n) {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
