import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { config } from "../config";
import { fetchSystemStatus } from "../lib/api";
import { PageMotion, Reveal } from "../components/Layout";

function formatMs(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  return `${ms}ms`;
}

function StatusRow({ item }) {
  const online = item.state === "online";
  const degraded = item.state === "degraded";
  const label = online ? "Online" : degraded ? "Degraded" : "Offline";
  const cls = online ? "online" : degraded ? "degraded" : "offline";

  return (
    <article className={`sys-status-card ${cls}`}>
      <div className="sys-status-head">
        <span className={`sys-status-dot ${cls}`} aria-hidden="true" />
        <div>
          <h3>{item.name}</h3>
          <p className="sys-status-meta">{item.detail}</p>
        </div>
        <strong className={`sys-status-badge ${cls}`}>{label}</strong>
      </div>
      {item.fields?.length > 0 && (
        <dl className="sys-status-fields">
          {item.fields.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {item.latency != null && (
        <p className="sys-status-latency">Latency {formatMs(item.latency)}</p>
      )}
    </article>
  );
}

export default function Status() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchSystemStatus();
      setData(result);
    } catch (err) {
      setError(err?.message || "Could not load status.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const overall = data?.overall || "unknown";
  const overallLabel =
    overall === "online"
      ? "All systems operational"
      : overall === "degraded"
        ? "Partial outage"
        : overall === "offline"
          ? "Major outage"
          : "Checking…";

  return (
    <PageMotion>
      <section className="section section-dark" style={{ paddingTop: "3rem" }}>
        <div className="wrap">
          <Reveal>
            <p className="section-kicker">Ops</p>
            <h2>System status</h2>
            <p className="section-lead">
              Live health for the gate API, downloads, products, and Discord bot.
              Refreshes every minute.
            </p>
          </Reveal>

          <Reveal delay={0.06}>
            <div className={`sys-status-banner ${overall}`}>
              <span className={`sys-status-dot ${overall}`} aria-hidden="true" />
              <div>
                <strong>{overallLabel}</strong>
                <p>
                  {data?.checkedAt
                    ? `Last check ${new Date(data.checkedAt).toLocaleString()}`
                    : loading
                      ? "Checking services…"
                      : "Waiting for first check"}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ height: 40, padding: "0 1rem" }}
                onClick={load}
                disabled={loading}
              >
                {loading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </Reveal>

          {error && (
            <p className="status err" style={{ marginTop: "1rem" }}>
              {error}
            </p>
          )}

          <div className="sys-status-grid">
            {(data?.items || (loading ? placeholderItems() : [])).map((item, i) => (
              <Reveal key={item.id} delay={0.04 * i}>
                <StatusRow item={item} />
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.2}>
            <div className="hero-ctas" style={{ marginTop: "2.5rem" }}>
              <Link className="btn btn-accent" to="/key">
                Get a key
              </Link>
              <Link className="btn btn-ghost" to="/buy">
                Buy
              </Link>
              <a
                className="btn btn-ghost"
                href={config.discordInvite}
                target="_blank"
                rel="noreferrer"
              >
                Discord
              </a>
            </div>
          </Reveal>
        </div>
      </section>
    </PageMotion>
  );
}

function placeholderItems() {
  return [
    { id: "api", name: "Gate API", detail: "Checking…", state: "unknown", fields: [] },
    { id: "downloads", name: "Downloads", detail: "Checking…", state: "unknown", fields: [] },
    { id: "products", name: "Products", detail: "Checking…", state: "unknown", fields: [] },
    { id: "bot", name: "Discord bot", detail: "Checking…", state: "unknown", fields: [] },
  ];
}
