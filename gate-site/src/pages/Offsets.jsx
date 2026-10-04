import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiBase, fetchOffsets, fetchSystemStatus } from "../lib/api";
import { PageMotion, Reveal } from "../components/Layout";

function toRows(namespaces) {
  const rows = [];
  for (const [ns, fields] of Object.entries(namespaces || {})) {
    for (const [name, val] of Object.entries(fields || {})) {
      rows.push({
        id: `${ns}.${name}`,
        namespace: ns,
        name,
        hex: val?.hex || "—",
        decimal: val?.decimal ?? null,
      });
    }
  }
  rows.sort((a, b) =>
    a.namespace === b.namespace
      ? a.name.localeCompare(b.name)
      : a.namespace.localeCompare(b.namespace)
  );
  return rows;
}

const DOWNLOADS = [
  {
    id: "json",
    label: "offsets.json",
    path: "/api/offsets",
    format: "JSON",
    hint: "OXIDE API shape",
    desc: "Namespaced fields with hex + decimal and build metadata.",
  },
  {
    id: "raw",
    label: "offsets.raw.json",
    path: "/api/offsets/raw",
    format: "JSON",
    hint: "Decimal map",
    desc: "Flat name → decimal map, drop-in for most dumper loaders.",
  },
  {
    id: "hex",
    label: "offsets.hex.json",
    path: "/api/offsets/hex",
    format: "JSON",
    hint: "Hex map",
    desc: "Same map as raw, values as 0x-prefixed hex strings.",
  },
  {
    id: "hpp",
    label: "offsets.hpp",
    path: "/api/offsets.hpp",
    format: "HPP",
    hint: "C++ header",
    desc: "constexpr namespaces, #pragma once, ready to include.",
  },
  {
    id: "cs",
    label: "offsets.cs",
    path: "/api/offsets.cs",
    format: "CS",
    hint: "C#",
    desc: "Static classes with const fields for .NET externals.",
  },
  {
    id: "txt",
    label: "offsets.txt",
    path: "/api/offsets.txt",
    format: "TXT",
    hint: "Plain text",
    desc: "Human-readable list grouped by namespace.",
  },
];

const API_ENDPOINTS = [
  { id: "api-json", path: "/api/offsets", note: "Full dump" },
  { id: "api-raw", path: "/api/offsets/raw", note: "Decimal map" },
];

function timeAgo(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M8 2v8m0 0L4.5 6.5M8 10l3.5-3.5M3 13h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <rect x="5" y="5" width="8.5" height="8.5" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 10.5V3.6C3 3 3.5 2.5 4.1 2.5H10.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export default function Offsets() {
  const [dump, setDump] = useState(null);
  const [external, setExternal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [nsFilter, setNsFilter] = useState("all");
  const [copied, setCopied] = useState("");
  const base = apiBase();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [offsets, status] = await Promise.all([
        fetchOffsets(),
        fetchSystemStatus().catch(() => null),
      ]);
      if (!offsets.ok) {
        setError(offsets.message || "Could not load offsets.");
        setDump(null);
      } else {
        setDump(offsets);
      }
      setExternal(status?.external || null);
    } catch (err) {
      setError(err?.message || "Could not load offsets.");
      setDump(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => toRows(dump?.namespaces), [dump]);
  const namespaces = useMemo(() => {
    const set = new Set(rows.map((r) => r.namespace));
    return ["all", ...[...set].sort()];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (nsFilter !== "all" && r.namespace !== nsFilter) return false;
      if (!q) return true;
      return (
        r.namespace.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.hex.toLowerCase().includes(q) ||
        String(r.decimal ?? "").includes(q)
      );
    });
  }, [rows, query, nsFilter]);

  const updateNeeded = external?.updateNeeded === true;
  const matched = external?.updateNeeded === false;

  async function copyText(id, text) {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      ta.remove();
    }
    if (ok) {
      setCopied(id);
      setTimeout(() => setCopied(""), 1400);
    }
  }

  return (
    <PageMotion>
      <section className="section section-dark offsets-page" style={{ paddingTop: "3rem" }}>
        <div className="wrap">
          <Reveal>
            <p className="section-kicker">Public offsets</p>
            <h2>OXIDE offsets</h2>
            <p className="section-lead">
              Offsets follow this Oxide build. The version below is the client that
              build was made for, not a live offset feed.
            </p>
          </Reveal>

          <Reveal delay={0.04}>
            <div
              className={`sys-status-banner ${
                updateNeeded ? "degraded" : matched ? "online" : "unknown"
              }`}
            >
              <span
                className={`sys-status-dot ${
                  updateNeeded ? "degraded" : matched ? "online" : "unknown"
                }`}
                aria-hidden="true"
              />
              <div>
                <strong>
                  {dump?.robloxVersion || external?.hostedClientVersion || "Loading version…"}
                </strong>
                <p>
                  {dump?.totalOffsets != null ? `${dump.totalOffsets} offsets` : "—"}
                  {dump?.source ? ` · ${dump.source}` : ""}
                  {dump?.generatedAt
                    ? ` · ${new Date(dump.generatedAt).toLocaleString()}`
                    : ""}
                  {external?.liveRobloxVersion
                    ? ` · live client ${external.liveRobloxVersion}`
                    : ""}
                </p>
              </div>
              <div className="offsets-banner-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ height: 40, padding: "0 1rem" }}
                  onClick={load}
                  disabled={loading}
                >
                  {loading ? "Loading…" : "Refresh"}
                </button>
                <button
                  type="button"
                  className="btn btn-accent"
                  style={{ height: 40, padding: "0 1rem" }}
                  onClick={() =>
                    copyText("api", `${base}/api/offsets`)
                  }
                >
                  {copied === "api" ? "Copied API" : "Copy API URL"}
                </button>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.06}>
            <section className="offsets-downloads" aria-labelledby="offsets-downloads-title">
              <header className="dl-head">
                <div>
                  <p className="dl-kicker">Downloads</p>
                  <h3 id="offsets-downloads-title">Pull the dump in your format</h3>
                  <p className="dl-sub">
                    Every file is generated from the same live dump. Pick the one your
                    loader expects.
                  </p>
                </div>
                <dl className="dl-meta">
                  <div>
                    <dt>Build</dt>
                    <dd title={dump?.robloxVersion || undefined}>
                      {dump?.robloxVersion
                        ? dump.robloxVersion.replace(/^version-/, "")
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Offsets</dt>
                    <dd>{dump?.totalOffsets ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Updated</dt>
                    <dd
                      title={
                        dump?.generatedAt
                          ? new Date(dump.generatedAt).toLocaleString()
                          : undefined
                      }
                    >
                      {timeAgo(dump?.generatedAt) || "—"}
                    </dd>
                  </div>
                </dl>
              </header>

              <ul className="dl-grid">
                {DOWNLOADS.map((d) => {
                  const url = `${base}${d.path}`;
                  const copyId = `dl-${d.id}`;
                  return (
                    <li key={d.id} className="dl-card">
                      <a
                        className="dl-card-link"
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Download ${d.label} (${d.hint})`}
                      >
                        <span className="dl-card-top">
                          <span className={`dl-badge dl-badge-${d.format.toLowerCase()}`}>
                            {d.format}
                          </span>
                          <span className="dl-card-hint">{d.hint}</span>
                        </span>
                        <strong className="dl-card-name">{d.label}</strong>
                        <span className="dl-card-desc">{d.desc}</span>
                      </a>
                      <div className="dl-card-foot">
                        <code className="dl-card-path">{d.path}</code>
                        <button
                          type="button"
                          className={`dl-icon-btn${copied === copyId ? " is-done" : ""}`}
                          onClick={() => copyText(copyId, url)}
                          aria-label={`Copy ${d.label} URL`}
                          title="Copy URL"
                        >
                          <CopyIcon />
                          <span>{copied === copyId ? "Copied" : "Copy"}</span>
                        </button>
                        <span className="dl-card-go" aria-hidden="true">
                          <DownloadIcon />
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="dl-api">
                <div className="dl-api-head">
                  <p className="dl-kicker">Developer API</p>
                  <div className="dl-chips">
                    <span className="dl-chip dl-chip-ok">
                      <span className="dl-chip-dot" aria-hidden="true" />
                      CORS open on GET
                    </span>
                    <span className="dl-chip">No auth</span>
                    <span className="dl-chip">JSON</span>
                  </div>
                </div>
                <ul className="dl-endpoints">
                  {API_ENDPOINTS.map((e) => {
                    const url = `${base}${e.path}`;
                    return (
                      <li key={e.id} className="dl-endpoint">
                        <span className="dl-method">GET</span>
                        <code className="dl-url">
                          <span className="dl-url-base">{base}</span>
                          <span className="dl-url-path">{e.path}</span>
                        </code>
                        <span className="dl-endpoint-note">{e.note}</span>
                        <button
                          type="button"
                          className={`dl-icon-btn${copied === e.id ? " is-done" : ""}`}
                          onClick={() => copyText(e.id, url)}
                          aria-label={`Copy ${url}`}
                        >
                          <CopyIcon />
                          <span>{copied === e.id ? "Copied" : "Copy"}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>
          </Reveal>

          {error && (
            <p className="status err" style={{ marginTop: "1rem" }}>
              {error}
            </p>
          )}

          <Reveal delay={0.08}>
            <div className="offsets-toolbar">
              <input
                className="offsets-search"
                type="search"
                placeholder="Search namespace, field, or hex…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search offsets"
              />
              <select
                className="offsets-select"
                value={nsFilter}
                onChange={(e) => setNsFilter(e.target.value)}
                aria-label="Filter namespace"
              >
                {namespaces.map((ns) => (
                  <option key={ns} value={ns}>
                    {ns === "all" ? "All namespaces" : ns}
                  </option>
                ))}
              </select>
              <span className="offsets-count">{filtered.length} shown</span>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="offsets-table-wrap">
              <table className="offsets-table">
                <thead>
                  <tr>
                    <th>Namespace</th>
                    <th>Field</th>
                    <th>Hex</th>
                    <th>Decimal</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {loading && !dump ? (
                    <tr>
                      <td colSpan={5} className="offsets-empty">
                        Loading offsets…
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="offsets-empty">
                        No offsets match that filter.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <code>{row.namespace}</code>
                        </td>
                        <td>{row.name}</td>
                        <td>
                          <code className="offsets-hex">{row.hex}</code>
                        </td>
                        <td className="offsets-dec">
                          {row.decimal != null ? row.decimal : "—"}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="offsets-copy"
                            onClick={() => copyText(row.id, row.hex)}
                          >
                            {copied === row.id ? "Copied" : "Copy"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Reveal>

          <Reveal delay={0.15}>
            <p className="offsets-footnote">
              Values come from OXIDE&apos;s Roblox dumper (client memory), then{" "}
              <code>POST /api/admin/offsets</code> (admin secret). Public read is{" "}
              <code>GET /api/offsets</code>.{" "}
              <Link to="/status">System status</Link>
            </p>
          </Reveal>
        </div>
      </section>
    </PageMotion>
  );
}
