import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { config } from "../config";
import { claimRobloxKey, fetchProducts } from "../lib/api";
import { PageMotion } from "../components/Layout";
import { Topography } from "../components/Topography";

/** Client-side feature copy — merges onto API products by plan id. */
const PLAN_DETAILS = {
  week: {
    cta: "Get week",
    duration: "7-day key",
    blurb: "7-day key. Universal only (Aim / ESP / Chams / Fly) — no Games pack.",
    includes: ["Aim, ESP, Chams, Fly (Universal)", "Expires after 7 days"],
    excludes: ["Games tabs / dedicated game pack"],
  },
  month: {
    cta: "Get month",
    duration: "30-day key",
    blurb: "30-day key. Universal + Games tabs.",
    includes: ["Universal features", "Games tabs (Da Hood, Fisch, …)", "Expires after 30 days"],
    excludes: [],
  },
  lifetime: {
    cta: "Get lifetime",
    duration: "Forever",
    blurb: "Forever. Full OXIDE — all games + priority.",
    includes: ["Full OXIDE — Universal + all games", "Priority updates", "No renewals"],
    excludes: [],
  },
};

const FALLBACK_PLANS = [
  {
    plan: "week",
    name: "Week",
    price: 5,
    unit: "USD",
    blurb: PLAN_DETAILS.week.blurb,
    buyUrl: "https://www.roblox.com/game-pass/1999442394",
    assetId: "1999442394",
    configured: true,
    productKind: "GamePass",
  },
  {
    plan: "month",
    name: "Month",
    price: 12,
    unit: "USD",
    blurb: PLAN_DETAILS.month.blurb,
    buyUrl: "https://www.roblox.com/game-pass/1999370393",
    assetId: "1999370393",
    configured: true,
    productKind: "GamePass",
  },
  {
    plan: "lifetime",
    name: "Lifetime",
    price: 40,
    unit: "USD",
    blurb: PLAN_DETAILS.lifetime.blurb,
    buyUrl: "https://www.roblox.com/game-pass/1999478401",
    assetId: "1999478401",
    configured: true,
    productKind: "GamePass",
  },
];

function enrich(product) {
  const detail = PLAN_DETAILS[product.plan] || {};
  return {
    ...product,
    blurb: detail.blurb || product.blurb,
    cta: detail.cta || `Get ${product.plan}`,
    duration: detail.duration || "",
    includes: detail.includes || [],
    excludes: detail.excludes || [],
  };
}

export default function Buy() {
  const discord = config.discordInvite;
  const fromPrice = config.plans?.[0]?.price ?? 5;

  const [products, setProducts] = useState(FALLBACK_PLANS.map(enrich));
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
        const enriched = result.products
          .filter((p) => PLAN_DETAILS[p.plan])
          .map(enrich);
        if (enriched.length) {
          setProducts(enriched);
          setDemo(!!result.demo);
          const firstConfigured = enriched.find((p) => p.configured) || enriched[0];
          if (firstConfigured) setSelected(firstConfigured.plan);
        }
      } else if (!result.ok) {
        setLoadErr(result.message || "Products unavailable — using listed gamepass links.");
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
    setStatus({
      kind: "",
      text: demo ? "Demo mode — skipping ownership…" : "Checking Roblox ownership…",
    });
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
              Buy OXIDE
            </motion.h1>
            <div className="price-row">
              <span className="from-label">from</span>
              <span className="amount">{fromPrice}</span>
              <span className="unit">USD</span>
            </div>
            <p className="gate-blurb">
              Three licenses — different length and access. Week is Universal only; Month adds
              Games tabs; Lifetime is full OXIDE forever.
            </p>
            <p className="hint" style={{ marginTop: "1rem" }}>
              {config.payment.note}
            </p>
          </div>

          <div className="plans" aria-label="License plans">
            {products.map((p, i) => (
              <motion.article
                key={p.plan}
                className={`plan${selected === p.plan ? " is-selected" : ""}`}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 * i + 0.15 }}
                whileHover={{ y: -3 }}
                onClick={() => setSelected(p.plan)}
              >
                <div className="plan-card-top">
                  <h3>{p.name}</h3>
                  {p.duration ? <span className="plan-duration">{p.duration}</span> : null}
                </div>
                <div className="plan-price">
                  {p.price} {p.unit}
                </div>
                <p>{p.blurb}</p>
                {p.includes?.length ? (
                  <ul className="plan-features">
                    {p.includes.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                    {p.excludes?.map((line) => (
                      <li key={line} className="is-excluded">
                        Not included: {line}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <button
                  type="button"
                  className="btn btn-accent btn-block"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(p.plan);
                    openRobloxBuy(p);
                  }}
                >
                  {p.cta}
                </button>
              </motion.article>
            ))}
          </div>

          <motion.section
            className="roblox-pay"
            aria-label="Claim Roblox purchase"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.45 }}
          >
            <div className="roblox-pay-head">
              <h2>Claim your key</h2>
              <p>
                After buying the gamepass for your plan on Roblox, enter your username to claim a
                matching license key.
                {demo ? " Demo mode is on — ownership checks are skipped." : ""}
              </p>
              {loadErr ? <p className="status err">{loadErr}</p> : null}
            </div>

            <form className="roblox-claim" onSubmit={onClaim}>
              <h3>Claim for selected plan</h3>
              <p className="hint" style={{ marginTop: "0.35rem" }}>
                Selected: <strong>{active?.name || "—"}</strong>
                {active?.assetId ? (
                  <>
                    {" "}
                    · Gamepass <code>{active.assetId}</code>
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
                {busy ? "Claiming…" : `Claim ${active?.name || "OXIDE"} key`}
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
