import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchOffsets, fetchSystemStatus } from "../lib/api";
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

export default function Offsets() {
  const [dump, setDump] = useState(null);
  const [external, setExternal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [nsFilter, setNsFilter] = useState("all");
  const [copied, setCopied] = useState("");

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

  async function copyHex(row) {
    try {
      await navigator.clipboard.writeText(row.hex);
      setCopied(row.id);
      setTimeout(() => setCopied(""), 1200);
    } catch {
      /* ignore */
    }
  }

  function downloadJson() {
    if (!dump) return;
    const blob = new Blob([JSON.stringify(dump, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `oxide-offsets-${dump.robloxVersion || "dump"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageMotion>
      <section className="section section-dark offsets-page" style={{ paddingTop: "3rem" }}>
        <div className="wrap">
          <Reveal>
            <p className="section-kicker">Offsets</p>
            <h2>Roblox client offsets</h2>
            <p className="section-lead">
              Browse OXIDE&apos;s current offset set (exported from the project
              headers). This is a static dump viewer — not a live memory dumper.
            </p>
          </Reveal>

          <Reveal delay={0.05}>
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
                  {updateNeeded
                    ? "External update needed"
                    : matched
                      ? "External up to date"
                      : "Version check pending"}
                </strong>
                <p>
                  Target{" "}
                  <code>{dump?.robloxVersion || external?.hostedClientVersion || "—"}</code>
                  {" · "}
                  Live{" "}
                  <code>{external?.liveRobloxVersion || "—"}</code>
                  {dump?.totalOffsets != null
                    ? ` · ${dump.totalOffsets} offsets`
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
                  onClick={downloadJson}
                  disabled={!dump}
                >
                  Download JSON
                </button>
              </div>
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
              <span className="offsets-count">
                {filtered.length} shown
                {dump?.generatedAt
                  ? ` · exported ${new Date(dump.generatedAt).toLocaleDateString()}`
                  : ""}
              </span>
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
                            onClick={() => copyHex(row)}
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
              Sourced from OXIDE&apos;s committed offset headers via{" "}
              <code>/api/offsets</code>. Staff refresh with{" "}
              <code>node gate-api/scripts/export-offsets.js</code> after updating{" "}
              <code>offsets.h</code>.{" "}
              <Link to="/status">System status</Link>
            </p>
          </Reveal>
        </div>
      </section>
    </PageMotion>
  );
}
