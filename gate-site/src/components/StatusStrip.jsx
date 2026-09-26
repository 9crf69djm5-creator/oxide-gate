import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchSystemStatus } from "../lib/api";

/**
 * Compact home status strip — overall health + external update flag.
 */
export function StatusStrip() {
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchSystemStatus()
      .then((r) => {
        if (alive) setData(r);
      })
      .catch(() => {});
    const t = setInterval(() => {
      fetchSystemStatus()
        .then((r) => {
          if (alive) setData(r);
        })
        .catch(() => {});
    }, 90_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const overall = data?.overall || "unknown";
  const updateNeeded = data?.updateNeeded === true;
  const label =
    overall === "online" && !updateNeeded
      ? "All systems up"
      : updateNeeded
        ? "External update needed"
        : overall === "degraded"
          ? "Partial issues"
          : overall === "offline"
            ? "Services down"
            : "Checking status…";

  const pills = (data?.items || []).slice(0, 5).map((item) => ({
    id: item.id,
    name:
      item.id === "api"
        ? "API"
        : item.id === "downloads"
          ? "Download"
          : item.id === "products"
            ? "Products"
            : item.id === "external"
              ? "External"
              : item.id === "bot"
                ? "Bot"
                : item.name,
    state: item.state,
  }));

  return (
    <section className="status-strip" aria-label="System status">
      <div className="wrap status-strip-inner">
        <div className="status-strip-summary">
          <span className={`sys-status-dot ${overall}`} aria-hidden="true" />
          <div>
            <strong>{label}</strong>
            <p>
              {data?.checkedAt
                ? `Checked ${new Date(data.checkedAt).toLocaleTimeString()}`
                : "Loading live checks…"}
            </p>
          </div>
        </div>
        <div className="status-strip-pills">
          {pills.map((p) => (
            <span key={p.id} className={`status-pill ${p.state}`}>
              <span className={`sys-status-dot ${p.state}`} aria-hidden="true" />
              {p.name}
            </span>
          ))}
        </div>
        <div className="status-strip-links">
          <Link to="/status">Full status</Link>
          <Link to="/offsets">Offsets</Link>
        </div>
      </div>
    </section>
  );
}
