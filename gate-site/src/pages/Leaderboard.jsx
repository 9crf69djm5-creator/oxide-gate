import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchLeaderboard, formatUsageCount, formatUsageTime } from "../lib/api";
import { PageMotion, Reveal } from "../components/Layout";

export default function Leaderboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await fetchLeaderboard();
    if (!result.ok) {
      setError(result.message || "Could not load the leaderboard.");
      setData(result);
    } else {
      setData(result);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const count = data?.count || 0;
  const people = data?.people || [];
  const lastLabel = formatUsageTime(data?.lastActivity);
  const updatedLabel = formatUsageTime(data?.updatedAt);

  return (
    <PageMotion>
      <section className="section section-dark" style={{ paddingTop: "3rem" }}>
        <div className="wrap">
          <Reveal>
            <p className="section-kicker">Oxide</p>
            <h2>Leaderboard</h2>
            <p className="section-lead">
              People who have run Oxide. One row per person, most recent activity first.
            </p>
          </Reveal>

          <Reveal delay={0.06}>
            <div className={`sys-status-banner ${count > 0 ? "online" : "unknown"}`}>
              <span className={`sys-status-dot ${count > 0 ? "online" : "unknown"}`} aria-hidden="true" />
              <div>
                <strong>{loading && !data ? "Checking usage…" : formatUsageCount(count)}</strong>
                <p>
                  {lastLabel
                    ? `Last activity ${lastLabel}`
                    : loading
                      ? "Loading…"
                      : "No activity yet"}
                  {updatedLabel ? ` · Updated ${updatedLabel}` : ""}
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

          <Reveal delay={0.1}>
            <div className="offsets-table-wrap">
              <table className="offsets-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Last seen</th>
                    <th>First seen</th>
                  </tr>
                </thead>
                <tbody>
                  {people.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="offsets-empty">
                        {loading ? "Loading…" : "No one has checked in yet."}
                      </td>
                    </tr>
                  ) : (
                    people.map((person) => {
                      const showUser =
                        person.username &&
                        person.username.toLowerCase() !== String(person.name || "").toLowerCase();
                      return (
                        <tr key={`${person.name}-${person.lastSeen}-${person.username || ""}`}>
                          <td>
                            <strong style={{ color: "var(--text-bright)", fontWeight: 600 }}>
                              {person.name || person.username || "Player"}
                            </strong>
                            {showUser && (
                              <div className="sys-status-meta">{person.username}</div>
                            )}
                          </td>
                          <td>{formatUsageTime(person.lastSeen) || "—"}</td>
                          <td>{formatUsageTime(person.firstSeen) || "—"}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Reveal>

          <Reveal delay={0.16}>
            <div className="hero-ctas" style={{ marginTop: "2rem" }}>
              <Link className="btn btn-ghost" to="/status">
                System status
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </PageMotion>
  );
}
