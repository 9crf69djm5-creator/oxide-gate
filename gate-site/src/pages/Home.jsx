import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { config } from "../config";
import { Nav, Footer, PageMotion, Reveal } from "../components/Layout";
import { Topography } from "../components/Topography";
import { HeroShowcase } from "../components/HeroShowcase";

const trust = [
  { k: "0", label: "Injected code" },
  { k: "External", label: "Memory + input" },
  { k: "Same-day", label: "Offset healing" },
  { k: "Cloud", label: "Shared configs" },
];

export default function Home() {
  const { tour, why, games } = config.features;
  const discord = config.discordInvite;

  return (
    <PageMotion>
      <header className="hero">
        <Nav onHero />
        <Topography className="hero-topo" />
        <div className="hero-inner">
          <div className="hero-copy">
            <motion.p
              className="hero-brand"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              <img
                className="hero-brand-logo"
                src="/oxide-banner.png"
                alt="OXIDE"
                decoding="async"
              />
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            >
              {config.tagline}
            </motion.h1>
            <motion.p
              className="hero-lead"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.22 }}
            >
              OXIDE never loads code into the game. It reads memory and drives real
              input from its own process — nothing inside the client to find.
            </motion.p>
            <motion.div
              className="hero-ctas"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.34 }}
            >
              <Link className="btn btn-light" to="/key">
                Get a key
              </Link>
              <a className="btn btn-ghost" href="#tour">
                See the menu
              </a>
            </motion.div>
          </div>

          <HeroShowcase />
        </div>

        <motion.div
          className="hero-trust"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.5 }}
        >
          {trust.map((t) => (
            <div key={t.label} className="hero-trust-item">
              <strong>{t.k}</strong>
              <span>{t.label}</span>
            </div>
          ))}
        </motion.div>
      </header>

      <section className="section section-strip" id="signals">
        <div className="wrap strip-row">
          {["Aimbot", "Silent aim", "Triggerbot", "ESP", "Chams", "Config cloud"].map(
            (label, i) => (
              <Reveal key={label} delay={0.04 * i}>
                <span className="strip-chip">{label}</span>
              </Reveal>
            )
          )}
        </div>
      </section>

      <section className="section section-dark" id="tour">
        <div className="wrap">
          <Reveal>
            <p className="section-kicker">Tour</p>
            <h2>Meet every tab.</h2>
            <p className="section-lead">A walk through the parts you will actually use.</p>
          </Reveal>

          <Reveal delay={0.08}>
            <div className="tour-visual">
              <motion.div
                className="menu-mock"
                aria-hidden="true"
                whileHover={{ y: -6, rotate: -0.5 }}
                transition={{ type: "spring", stiffness: 260, damping: 18 }}
              >
                <div className="menu-rail">
                  <span /><span /><span /><span /><span /><span />
                </div>
                <div className="menu-body">
                  <strong>OXIDE // AIM</strong>
                  <div className="menu-row accent" />
                  <div className="menu-row" />
                  <div className="menu-row short" />
                  <div className="menu-row" />
                  <div className="menu-row short" />
                </div>
              </motion.div>
            </div>
          </Reveal>

          <div className="tour-grid">
            {tour.map((t, i) => (
              <Reveal key={t.title} delay={0.06 * i}>
                <article className="tour-card">
                  <h3>{t.title}</h3>
                  <p>{t.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-dark" id="why">
        <div className="wrap">
          <Reveal>
            <p className="section-kicker">Why external</p>
            <h2>Why you&apos;ll choose OXIDE.</h2>
          </Reveal>
          <div className="why-grid">
            {why.map((t, i) => (
              <Reveal key={t.title} delay={0.05 * i}>
                <article className="why-card">
                  <h3>{t.title}</h3>
                  <p>{t.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-dark" id="games">
        <div className="wrap">
          <Reveal>
            <p className="section-kicker">Games</p>
            <h2>Every game.</h2>
            <p className="section-lead">
              Generic aim and ESP work anywhere. These have a tab of their own.
            </p>
          </Reveal>
          <div className="games-grid">
            {games.map((g, i) => (
              <Reveal key={g.name} delay={0.05 * i}>
                <div className="game-col">
                  <h3>{g.name}</h3>
                  <ul>
                    {g.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.15}>
            <p style={{ marginTop: "1.75rem" }}>
              <Link className="btn btn-ghost" to="/features">
                Full feature list
              </Link>
            </p>
          </Reveal>
        </div>
      </section>

      <section className="cta-band" id="get">
        <Reveal>
          <h2>Join the community.</h2>
          <p>
            Grab a key, then read the setup post in Discord. You are running in a
            couple of minutes.
          </p>
          <div className="hero-ctas">
            <Link className="btn btn-accent" to="/key">
              Get a key
            </Link>
            <Link className="btn btn-ghost" to="/buy">
              Buy
            </Link>
            <a className="btn btn-ghost" href={discord} target="_blank" rel="noreferrer">
              Join the Discord
            </a>
          </div>
        </Reveal>
      </section>

      <Footer />
    </PageMotion>
  );
}
