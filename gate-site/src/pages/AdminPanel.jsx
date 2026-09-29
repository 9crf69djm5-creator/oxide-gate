import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { adminLogout, fetchAllKeys, runKeyAction } from "../lib/admin";
import { PageMotion } from "../components/Layout";

const STATUS_FILTERS = ["all", "active", "unused", "expired", "banned"];

function fmt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortHwid(h) {
  if (!h) return null;
  return h.length > 18 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h;
}

function matches(k, q) {
  if (!q) return true;
  const hay = [
    k.key,
    k.plan,
    k.status,
    k.hwid,
    k.discordUserId,
    k.discordUsername,
    k.discordDisplayName,
    k.robloxUsername,
    k.robloxUserId,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}

/**
 * Owner dashboard. Only mounted (and only downloaded) after the gate in
 * Admin.jsx has a server-confirmed owner session. `onSessionLost` sends the
 * viewer back to the generic not-found view.
 */
export default function AdminPanel({ session, onSessionLost }) {
  const [keys, setKeys] = useState([]);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [revealed, setRevealed] = useState(() => new Set());
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState({ kind: "", text: "" });

  const loadKeys = useCallback(async () => {
    setLoading(true);
    const r = await fetchAllKeys();
    setLoading(false);
    if (!r.ok) {
      if (r.status === 401 || r.status === 404) return onSessionLost();
      setNotice({ kind: "err", text: r.message });
      return;
    }
    setKeys(r.keys || []);
    setAudit(r.audit || []);
  }, [onSessionLost]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const stats = useMemo(() => {
    const c = { total: keys.length, active: 0, unused: 0, expired: 0, banned: 0, hwid: 0, discord: 0 };
    for (const k of keys) {
      if (c[k.status] !== undefined) c[k.status] += 1;
      if (k.hwid) c.hwid += 1;
      if (k.discordUserId) c.discord += 1;
    }
    return c;
  }, [keys]);

  const visible = useMemo(
    () => keys.filter((k) => (statusFilter === "all" || k.status === statusFilter) && matches(k, query)),
    [keys, statusFilter, query]
  );

  function toggleReveal(key) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function copyKey(key) {
    try {
      await navigator.clipboard.writeText(key);
      setNotice({ kind: "ok", text: `Copied ${key}` });
    } catch {
      setNotice({ kind: "err", text: "Clipboard blocked by the browser." });
    }
  }

  async function act(action, k) {
    const prompts = {
      "reset-hwid": () =>
        window.confirm(`Reset HWID for ${k.key}?\n\nThe next Oxide.exe launch will bind a new machine.`),
      "unlink-discord": () =>
        window.confirm(
          `Unlink Discord ${k.discordUsername ? "@" + k.discordUsername : k.discordUserId} from ${k.key}?\n\n/mykey will stop finding this key for that account.`
        ),
      revoke: () =>
        window.prompt(`Revoke (ban) ${k.key}?\n\nThe key stops working immediately. Type REVOKE to confirm.`) ===
        "REVOKE",
      reactivate: () => window.confirm(`Reactivate ${k.key}? It will work again.`),
    };
    if (!prompts[action]()) return;
    setBusy(`${action}:${k.key}`);
    const r = await runKeyAction(action, k.key);
    setBusy("");
    if (!r.ok) {
      if (r.status === 401 || r.status === 404) return onSessionLost();
      setNotice({ kind: "err", text: r.message });
      return;
    }
    setNotice({ kind: "ok", text: `${r.message || "Done."} (${k.key})` });
    loadKeys();
  }

  async function onLogout() {
    await adminLogout();
    onSessionLost();
  }

  return (
    <PageMotion>
      <div className="gate-page admin-page">
        <main className="admin-main">
          <header className="admin-head">
            <div>
              <span className="release-tag">Owner</span>
              <h1>License admin</h1>
              <p className="release-meta">
                Signed in as{" "}
                <strong>{session?.discordUsername ? `@${session.discordUsername}` : session?.discordUserId}</strong>
                {session?.expiresAt ? ` · session ends ${fmt(session.expiresAt)}` : ""}
              </p>
            </div>
            <div className="admin-head-actions">
              <Link className="btn btn-ghost" to="/account">
                Owner account
              </Link>
              <button type="button" className="btn btn-ghost" onClick={loadKeys} disabled={loading}>
                {loading ? "Refreshing…" : "Refresh"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={onLogout}>
                Sign out
              </button>
            </div>
          </header>

          <div className="admin-stats">
            {[
              ["Total", stats.total],
              ["Active", stats.active],
              ["Unused", stats.unused],
              ["Expired", stats.expired],
              ["Revoked", stats.banned],
              ["HWID bound", stats.hwid],
              ["Discord linked", stats.discord],
            ].map(([label, n]) => (
              <div className="admin-stat" key={label}>
                <strong>{n}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>

          <div className="admin-toolbar">
            <input
              className="offsets-search"
              type="search"
              placeholder="Search key, Discord, Roblox, HWID…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search keys"
            />
            <select
              className="offsets-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "All statuses" : s === "banned" ? "revoked" : s}
                </option>
              ))}
            </select>
          </div>

          <p className={`status ${notice.kind}`} role="status">
            {notice.text}
          </p>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Status</th>
                  <th>Plan / expiry</th>
                  <th>HWID</th>
                  <th>Discord</th>
                  <th>Roblox</th>
                  <th>Activity</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((k) => {
                  const shown = revealed.has(k.key);
                  const isBusy = busy.endsWith(`:${k.key}`);
                  return (
                    <tr key={k.key}>
                      <td data-label="Key">
                        <code className="admin-key">{shown ? k.key : k.keyMasked}</code>
                        <div className="admin-inline-actions">
                          <button type="button" className="admin-link" onClick={() => toggleReveal(k.key)}>
                            {shown ? "Hide" : "Reveal"}
                          </button>
                          <button type="button" className="admin-link" onClick={() => copyKey(k.key)}>
                            Copy
                          </button>
                        </div>
                      </td>
                      <td data-label="Status">
                        <span className={`admin-badge is-${k.status}`}>
                          {k.status === "banned" ? "revoked" : k.status}
                        </span>
                      </td>
                      <td data-label="Plan / expiry">
                        <div>{k.plan}</div>
                        <div className="admin-sub">
                          {k.expiresAt ? fmt(k.expiresAt) : k.activatedAt ? "Never" : "Not activated"}
                        </div>
                        {k.activatedAt && <div className="admin-sub">{k.remainingLabel}</div>}
                      </td>
                      <td data-label="HWID">
                        {k.hwid ? (
                          <code className="admin-mono" title={k.hwid}>
                            {shortHwid(k.hwid)}
                          </code>
                        ) : (
                          <span className="admin-sub">Not bound</span>
                        )}
                      </td>
                      <td data-label="Discord">
                        {k.discordUserId ? (
                          <>
                            <div>
                              {k.discordUsername ? `@${k.discordUsername}` : "Unknown user"}
                              {k.discordDisplayName && k.discordDisplayName !== k.discordUsername
                                ? ` (${k.discordDisplayName})`
                                : ""}
                            </div>
                            <a
                              className="admin-sub admin-mono"
                              href={`https://discord.com/users/${k.discordUserId}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {k.discordUserId}
                            </a>
                          </>
                        ) : (
                          <span className="admin-sub">Not linked</span>
                        )}
                      </td>
                      <td data-label="Roblox">
                        {k.robloxUsername || k.robloxUserId ? (
                          <>
                            <div>{k.robloxUsername ? `@${k.robloxUsername}` : "—"}</div>
                            {k.robloxUserId && (
                              <a
                                className="admin-sub admin-mono"
                                href={`https://www.roblox.com/users/${k.robloxUserId}/profile`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {k.robloxUserId}
                              </a>
                            )}
                            {k.claim && (
                              <div className="admin-sub">
                                Claimed {k.claim.assetType} · {fmt(k.claim.claimedAt)}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="admin-sub">—</span>
                        )}
                      </td>
                      <td data-label="Activity">
                        <div className="admin-sub">Created {fmt(k.createdAt)}</div>
                        <div className="admin-sub">Activated {fmt(k.activatedAt)}</div>
                        <div className="admin-sub">Last seen {fmt(k.lastSeenAt)}</div>
                      </td>
                      <td data-label="Actions">
                        <div className="admin-actions">
                          <button
                            type="button"
                            className="btn btn-ghost admin-btn"
                            disabled={isBusy || !k.hwid || k.status === "banned"}
                            onClick={() => act("reset-hwid", k)}
                          >
                            Reset HWID
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost admin-btn"
                            disabled={isBusy || !k.discordUserId}
                            onClick={() => act("unlink-discord", k)}
                          >
                            Unlink Discord
                          </button>
                          {k.status === "banned" ? (
                            <button
                              type="button"
                              className="btn btn-ghost admin-btn"
                              disabled={isBusy}
                              onClick={() => act("reactivate", k)}
                            >
                              Reactivate
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-ghost admin-btn is-danger"
                              disabled={isBusy}
                              onClick={() => act("revoke", k)}
                            >
                              Revoke
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!visible.length && (
              <p className="admin-empty">{loading ? "Loading keys…" : "No keys match."}</p>
            )}
          </div>

          {audit.length > 0 && (
            <details className="admin-audit">
              <summary>Recent admin actions ({audit.length})</summary>
              <ul>
                {audit.map((a, i) => (
                  <li key={`${a.at}-${i}`}>
                    <span className="admin-mono">{fmt(a.at)}</span> · {a.action.replace(/_/g, " ")}
                    {a.key ? ` · ${a.key}` : ""} · by {a.actor}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </main>
      </div>
    </PageMotion>
  );
}
