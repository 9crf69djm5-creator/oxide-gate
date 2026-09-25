import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { config } from "../config";
import { openCheckout } from "../lib/api";
import { PageMotion } from "../components/Layout";
import { Topography } from "../components/Topography";

export default function Buy() {
  const featured = config.plans.find((p) => p.featured) || config.plans[0];
  const extras = config.plans.filter((p) => !p.featured);
  const discord = config.discordInvite;

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
