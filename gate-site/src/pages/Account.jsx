import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { config } from "../config";
import { apiBase } from "../lib/api";
import { clearSession, loadSession } from "../lib/session";
import { PageMotion } from "../components/Layout";
import { Topography } from "../components/Topography";

export default function Account() {
  const navigate = useNavigate();
  const session = loadSession();
  const discord = config.discordInvite;

  if (!session || !session.key) {
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
    session.downloadUrl || config.download?.url || "#download-placeholder";

  function onDownload(e) {
    if (
      !downloadUrl ||
      downloadUrl === "#download-placeholder" ||
      downloadUrl === apiBase()
    ) {
      e.preventDefault();
      window.alert(
        "Set DOWNLOAD_URL in gate-api/.env (or Render env).\n\nBuilt EXE (dev):\nExternal/x64/Release/Oxide.exe"
      );
    }
  }

  function onLogout(e) {
    e.preventDefault();
    clearSession();
    navigate("/key");
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

            <a
              className="btn btn-accent btn-block"
              href={downloadUrl}
              onClick={onDownload}
            >
              Download {config.download?.filename || "Oxide.exe"}
            </a>
            <p className="hint">{config.download?.note}</p>
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

        <footer className="gate-footer">
          <a href={discord} target="_blank" rel="noreferrer">
            Discord
          </a>
          <Link to="/features">Features</Link>
          <Link to="/">Site</Link>
        </footer>
      </div>
    </PageMotion>
  );
}
