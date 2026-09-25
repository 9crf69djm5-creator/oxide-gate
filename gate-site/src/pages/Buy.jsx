import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { config } from "../config";
import { claimRobloxKey, fetchProducts, openCheckout } from "../lib/api";
import { PageMotion } from "../components/Layout";
import { Topography } from "../components/Topography";

const FALLBACK_PLANS = [
  {
    plan: "week",
    name: "Week",
    price: 5,
    unit: "USD",
    blurb: "Seven days. Buy the Week gamepass on Roblox, then claim.",
    buyUrl: null,
    configured: false,
    productKind: "GamePass",
  },
  {
    plan: "month",
    name: "Month",
    price: 12,
    unit: "USD",
    blurb: "Thirty days. Buy the Month gamepass on Roblox, then claim.",
    buyUrl: null,
    configured: false,
    productKind: "GamePass",
  },
  {
    plan: "lifetime",
    name: "Lifetime",
    price: 40,
    unit: "USD",
    blurb: "No renewals. Buy the Lifetime gamepass, then claim.",
    buyUrl: null,
    configured: false,
    productKind: "GamePass",
  },
];

export default function Buy() {
  const featured = config.plans.find((p) => p.featured) || config.plans[0];
  const extras = config.plans.filter((p) => !p.featured);
  const discord = config.discordInvite;

  const [products, setProducts] = useState(FALLBACK_PLANS);
  const [demo, setDemo] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [selected, setSelected] = useState("week");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ kind: "", text: "" });
  const [claimedKey, setClaimedKey] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchProducts();
      if (cancelled) return;
      if (result.ok && result.products?.length) {
        setProducts(result.products);
        setDemo(!!result.demo);
        const firstConfigured = result.products.find((p) => p.configured) || result.products[0];
        if (firstConfigured) setSelected(firstConfigured.plan);
      } else if (!result.ok) {
        setLoadErr(result.message || "Products unavailable.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const active = products.find((p) => p.plan === selected) || products[0];

  function openRobloxBuy(product) {
    if (!product?.buyUrl) {
      window.alert(
        "Roblox product ID not configured yet.\n\nSet ROBLOX_GAMEPASS_WEEK / ROBLOX_GAMEPASS_MONTH / ROBLOX_GAMEPASS_LIFETIME on gate-api and redeploy."
      );
      return;
    }
    window.open(product.buyUrl, "_blank", "noopener,noreferrer");
  }

  async function onClaim(e) {
    e.preventDefault();
    if (!active) return;
    setBusy(true);
    setClaimedKey("");
    setStatus({ kind: "", text: demo ? "Demo mode — skipping ownership…" : "Checking Roblox ownership…" });
    const result = await claimRobloxKey({ username, plan: active.plan });
    setBusy(false);
    if (!result.ok) {
      setStatus({ kind: "err", text: result.message });
      return;
    }
    setClaimedKey(result.key);
    setStatus({
      kind: "ok",
      text: result.alreadyClaimed
        ? "Already claimed for this purchase — here’s your key."
        : result.message,
    });
  }

  function copyKey() {
    if (!claimedKey) return;
    navigator.clipboard?.writeText(claimedKey).catch(() => {});
    setStatus({ kind: "ok", text: "Key copied. Redeem it on Get a key." });
  }

  return (
    <PageMotion>
      <div className="gate-page">
        <Topography className="gate-topo" />
        <main className="gate-main wide">
          <div className="gate-stack">
            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
            >
              {featured.name}
            </motion.h1>
            <div className="price-row">
              <span className="amount">{featured.price}</span>
              <span className="unit">{featured.unit}</span>
            </div>
            <p className="gate-blurb">{featured.blurb}</p>
            <motion.button
              type="button"
              className="btn btn-accent btn-block"
              style={{ marginTop: "1.5rem" }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => openCheckout(featured)}
            >
              {featured.cta}
            </motion.button>
            <p className="hint" style={{ marginTop: "1rem" }}>
              {config.payment.note}
            </p>
          </div>

          <div className="plans" aria-label="Other plans">
            {extras.map((p, i) => (
              <motion.article
                key={p.id}
                className="plan"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 * i + 0.15 }}
                whileHover={{ y: -3 }}
              >
                <h3>{p.name}</h3>
                <div className="plan-price">
                  {p.price} {p.unit}
                </div>
                <p>{p.blurb}</p>
                <button
                  type="button"
                  className="btn btn-ghost btn-block"
                  onClick={() => openCheckout(p)}
                >
                  {p.cta}
                </button>
              </motion.article>
            ))}
          </div>

          <motion.section
            className="roblox-pay"
            aria-label="Pay with Roblox"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.45 }}
          >
            <div className="roblox-pay-head">
              <h2>Pay with Roblox</h2>
              <p>
                Buy the shirt or gamepass on Roblox, then claim your OXIDE key with your username.
                {demo ? " Demo mode is on — ownership checks are skipped." : ""}
              </p>
              {loadErr ? <p className="status err">{loadErr}</p> : null}
            </div>

            <div className="roblox-cards">
              {products.map((p, i) => (
                <motion.article
                  key={p.plan}
                  className={`roblox-card${selected === p.plan ? " is-selected" : ""}`}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 * i + 0.4 }}
                  whileHover={{ y: -4 }}
                  onClick={() => setSelected(p.plan)}
                >
                  <div className="roblox-card-top">
                    <h3>{p.name}</h3>
                    <span className="roblox-kind">
                      {p.productKind === "GamePass" ? "Gamepass" : "Shirt"}
                    </span>
                  </div>
                  <div className="plan-price">
                    {p.price} {p.unit}
                  </div>
                  <p>{p.blurb}</p>
                  <motion.button
                    type="button"
                    className="btn btn-accent btn-block"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(p.plan);
                      openRobloxBuy(p);
                    }}
                  >
                    Buy {p.productKind === "GamePass" ? "Gamepass" : "Shirt"} on Roblox
                  </motion.button>
                </motion.article>
              ))}
            </div>

            <form className="roblox-claim" onSubmit={onClaim}>
              <h3>Claim your key</h3>
              <p className="hint" style={{ marginTop: "0.35rem" }}>
                Selected: <strong>{active?.name || "—"}</strong>
                {active?.assetId ? (
                  <>
                    {" "}
                    · Asset <code>{active.assetId}</code>
                  </>
                ) : (
                  " · configure asset IDs on the API"
                )}
              </p>
              <div className="field">
                <label htmlFor="roblox-username">Roblox username</label>
                <input
                  id="roblox-username"
                  name="username"
                  autoComplete="username"
                  spellCheck={false}
                  placeholder="YourRobloxName"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <motion.button
                type="submit"
                className="btn btn-light btn-block"
                style={{ marginTop: "1rem" }}
                disabled={busy}
                whileHover={{ scale: busy ? 1 : 1.02 }}
                whileTap={{ scale: busy ? 1 : 0.98 }}
              >
                {busy ? "Claiming…" : "Claim OXIDE key"}
              </motion.button>
              <p className={`status ${status.kind}`}>{status.text}</p>

              <AnimatePresence>
                {claimedKey ? (
                  <motion.div
                    className="roblox-key-reveal"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.35 }}
                  >
                    <label>Your license key</label>
                    <code className="roblox-key-value">{claimedKey}</code>
                    <div className="roblox-key-actions">
                      <button type="button" className="btn btn-ghost" onClick={copyKey}>
                        Copy
                      </button>
                      <Link className="btn btn-accent" to="/key">
                        Redeem now
                      </Link>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </form>
          </motion.section>
        </main>

        <footer className="gate-footer">
          <a href={discord} target="_blank" rel="noreferrer">
            Discord
          </a>
          <Link to="/key">Get a key</Link>
          <Link to="/">Site</Link>
        </footer>
      </div>
    </PageMotion>
  );
}
