import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { config } from "../config";
import { redeemKey } from "../lib/api";
import { loadSession, saveSession } from "../lib/session";
import { PageMotion } from "../components/Layout";
import { Topography } from "../components/Topography";

export default function Key() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [status, setStatus] = useState({ kind: "", text: "" });
  const [busy, setBusy] = useState(false);
  const discord = config.discordInvite;

  function linkDiscord() {
    const existing = loadSession() || {
      key: null,
      plan: "Guest",
      redeemedAt: Date.now(),
      expiresAt: null,
    };
    existing.discordLinked = true;
    existing.discordUser =
      "oxide_user#" + String(Math.floor(Math.random() * 9000) + 1000);
    saveSession(existing);
    window.open(discord, "_blank", "noopener,noreferrer");
    setStatus({
      kind: "ok",
      text: "Discord opened. Paste your OXIDE key with /redeem (or /bind) there — site redeem does not auto-link Discord.",
    });
  }

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setStatus({ kind: "", text: "Checking key…" });
    const result = await redeemKey(value);
    setBusy(false);
    setStatus({ kind: result.ok ? "ok" : "err", text: result.message });
    if (result.ok) {
      setTimeout(() => navigate("/account"), 700);
    }
  }

  return (
    <PageMotion>
      <div className="gate-page">
        <Topography className="gate-topo" />
        <main className="gate-main">
          <div className="gate-stack">
            <h1>Get a key</h1>
            <p className="gate-blurb">
              Already have a key? Redeem it here for Oxide.exe, or in Discord with{" "}
              <code>/redeem</code> / <code>/bind</code>. Site redeem alone does{" "}
              <strong>not</strong> auto-link Discord — run{" "}
              <code>/redeem</code> once in Discord so <code>/mykey</code> can
              recover your key.
            </p>

            <motion.button
              type="button"
              className="btn btn-ghost btn-block"
              style={{ marginTop: "1.5rem" }}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={linkDiscord}
            >
              Open Discord (then /redeem)
            </motion.button>

            <form onSubmit={onSubmit} style={{ marginTop: "1.75rem" }}>
              <div className="field">
                <label htmlFor="license-key">License key</label>
                <input
                  id="license-key"
                  name="key"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="OXIDE-XXXX-XXXX-XXXX"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </div>
              <motion.button
                type="submit"
                className="btn btn-accent btn-block"
                style={{ marginTop: "1rem" }}
                disabled={busy}
                whileHover={{ scale: busy ? 1 : 1.02 }}
                whileTap={{ scale: busy ? 1 : 0.98 }}
              >
                {busy ? "Redeeming…" : "Redeem"}
              </motion.button>
            </form>

            <p className={`status ${status.kind}`}>{status.text}</p>

            <p className="hint">
              No key yet?{" "}
              <Link to="/buy">Buy on Roblox</Link> and claim your license, then
              redeem it here.
            </p>
          </div>
        </main>

        <footer className="gate-footer">
          <a href={discord} target="_blank" rel="noreferrer">
            Discord
          </a>
          <Link to="/buy">Buy</Link>
          <Link to="/account">Account</Link>
        </footer>
      </div>
    </PageMotion>
  );
}
