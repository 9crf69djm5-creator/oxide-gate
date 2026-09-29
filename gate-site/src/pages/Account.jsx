import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { config } from "../config";
import { apiBase } from "../lib/api";
import { fetchAdminSession } from "../lib/admin";
import { fetchReleases } from "../lib/releases";
import { clearSession, loadSession } from "../lib/session";
import { PageMotion } from "../components/Layout";
import { Topography } from "../components/Topography";

const siteExeUrl =
  config.download?.url || "https://oxide-gate-api.onrender.com/downloads/Oxide.exe";

/** Prefer site EXE; never send buyers to a GitHub repo / source tree. */
function resolveDownloadUrl(raw) {
  const url = String(raw || "").trim();
  if (!url || url === "#download-placeholder" || url === apiBase()) return siteExeUrl;
  if (/^file:/i.test(url)) return siteExeUrl;
  try {
    const u = new URL(url);
    if (/github\.com$/i.test(u.hostname) && !/\/releases\/download\//i.test(u.pathname)) {
      return siteExeUrl;
    }
  } catch {
    return siteExeUrl;
  }
  return url;
}

export default function Account() {
  const navigate = useNavigate();
  const session = loadSession();
  const hasLicense = Boolean(session && session.key);
  const discord = config.discordInvite;
  const [release, setRelease] = useState(null);
  /** null = checking, false = not owner, object = server-verified owner session */
  const [owner, setOwner] = useState(hasLicense ? false : null);

  useEffect(() => {
    let alive = true;
    fetchReleases().then((r) => {
      if (alive && r.ok) setRelease(r.releases[0] || null);
    });
    if (!hasLicense) {
      fetchAdminSession().then((s) => {
        if (alive) setOwner(s.ok ? s : false);
      });
    }
    return () => {
      alive = false;
    };
  }, [hasLicense]);

  const footer = (
    <footer className="gate-footer">
      <a href={discord} target="_blank" rel="noreferrer">
        Discord
      </a>
      <Link to="/features">Features</Link>
      <Link to="/">Site</Link>
    </footer>
  );

  if (!hasLicense && owner === null) {
    return (
      <PageMotion>
        <div className="gate-page">
          <main className="gate-main">
            <p className="status">Loading account…</p>
          </main>
        </div>
      </PageMotion>
    );
  }

  if (!hasLicense && !owner) {
    return (
      <PageMotion>
        <div className="gate-page">
          <Topography className="gate-topo" />
          <main className="gate-main">
            <div className="empty-state">
              <h1>No license yet</h1>
              <p className="gate-blurb">
                Redeem a key to unlock download and account details.
              </p>
              <Link className="btn btn-accent" to="/key" style={{ marginTop: "1.5rem" }}>
                Get a key
              </Link>
            </div>
          </main>
          <footer className="gate-footer">
            <a href={discord} target="_blank" rel="noreferrer">
              Discord
            </a>
            <Link to="/buy">Buy</Link>
            <Link to="/">Site</Link>
          </footer>
        </div>
      </PageMotion>
    );
  }

  const downloadUrl =
    release?.downloadUrl || resolveDownloadUrl((hasLicense && session.downloadUrl) || siteExeUrl);

  function onDownload(e) {
    if (!downloadUrl || downloadUrl === "#download-placeholder") {
      e.preventDefault();
      window.alert("Download is not configured. Contact support on Discord.");
    }
  }

  function onLogout(e) {
    e.preventDefault();
    clearSession();
    navigate("/key");
  }

  const downloadBlock = (
    <>
      <a
        className="btn btn-accent btn-block"
        href={downloadUrl}
        download={config.download?.filename || "Oxide.exe"}
        onClick={onDownload}
      >
        {release ? `Download Oxide.exe v${release.version}` : "Download Oxide.exe"}
      </a>
      <p className="hint">{config.download?.note || "Direct EXE download — no source code."}</p>
      {release && (
        <p className="release-inline">
          Latest: v{release.version}
          {release.title ? ` — ${release.title}` : ""} ·{" "}
          <Link to={`/changelog#v${release.version}`}>What changed</Link>
        </p>
      )}
    </>
  );

  if (!hasLicense && owner) {
    return (
      <PageMotion>
        <div className="gate-page">
          <Topography className="gate-topo" />
          <main className="gate-main">
            <motion.div
              className="account-panel"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
            >
              <span className="release-tag">Owner</span>
              <h1 style={{ marginTop: "0.6rem", marginBottom: "1.25rem" }}>Account</h1>
              <dl>
                <dt>Access</dt>
                <dd>Owner session — no license key needed</dd>
                <dt>Discord</dt>
                <dd>{owner.discordUsername ? `@${owner.discordUsername}` : owner.discordUserId}</dd>
                <dt>Session ends</dt>
                <dd>{owner.expiresAt ? new Date(owner.expiresAt).toLocaleString() : "—"}</dd>
              </dl>
              {downloadBlock}
              <div className="admin-owner-links">
                <Link className="btn btn-ghost" to="/admin">
                  License admin
                </Link>
                <Link className="btn btn-ghost" to="/changelog">
                  Changelog
                </Link>
                <Link className="btn btn-ghost" to="/offsets">
                  Offsets
                </Link>
              </div>
            </motion.div>
          </main>
          {footer}
        </div>
      </PageMotion>
    );
  }

  return (
    <PageMotion>
      <div className="gate-page">
        <Topography className="gate-topo" />
        <main className="gate-main">
          <motion.div
            className="account-panel"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <h1 style={{ marginTop: 0, marginBottom: "1.25rem" }}>Account</h1>
            <dl>
              <dt>Plan</dt>
              <dd>{session.plan || "—"}</dd>
              <dt>Key</dt>
              <dd>{session.key}</dd>
              <dt>Expires</dt>
              <dd>
                {session.expiresAt
                  ? new Date(session.expiresAt).toLocaleString()
                  : "Never"}
              </dd>
              <dt>Discord</dt>
              <dd>
                {session.discordLinked
                  ? session.discordUser || "Linked"
                  : "Not linked"}
              </dd>
            </dl>

            {downloadBlock}
            <button
              type="button"
              className="btn btn-ghost btn-block"
              style={{ marginTop: "0.75rem" }}
              onClick={onLogout}
            >
              Sign out
            </button>
          </motion.div>
        </main>

        {footer}
      </div>
    </PageMotion>
  );
}
