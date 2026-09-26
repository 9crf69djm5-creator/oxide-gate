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
  { id: "json", label: "offsets.json", path: "/api/offsets", hint: "OXIDE API shape" },
  { id: "raw", label: "offsets.raw.json", path: "/api/offsets/raw", hint: "decimal map" },
  { id: "hex", label: "offsets.hex.json", path: "/api/offsets/hex", hint: "hex map" },
  { id: "hpp", label: "offsets.hpp", path: "/api/offsets.hpp", hint: "C++ header" },
  { id: "cs", label: "offsets.cs", path: "/api/offsets.cs", hint: "C#" },
  { id: "txt", label: "offsets.txt", path: "/api/offsets.txt", hint: "plain text" },
];

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
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(""), 1200);
    } catch {
      /* ignore */
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
              Live Roblox client offsets dumped by OXIDE and served for free use.
              Copy hex values below, or pull JSON / headers from the public API.
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
            <div className="offsets-downloads">
              <p className="offsets-downloads-label">Downloads</p>
              <div className="offsets-download-grid">
                {DOWNLOADS.map((d) => (
                  <a
                    key={d.id}
                    className="offsets-download-chip"
                    href={`${base}${d.path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <strong>{d.label}</strong>
                    <span>{d.hint}</span>
                  </a>
                ))}
              </div>
              <p className="offsets-api-hint">
                Developers:{" "}
                <code>{base}/api/offsets</code>
                {" · "}
                <code>{base}/api/offsets/raw</code>
                {" · CORS open on GET"}
              </p>
            </div>
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
