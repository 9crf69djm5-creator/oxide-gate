import { Link, NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { config } from "../config";

export function Nav({ onHero = false }) {
  const discord = config.discordInvite;

  return (
    <nav className={`site-nav${onHero ? " on-hero" : ""}`}>
      <Link className="brand" to="/">
        <img
          className="brand-logo"
          src="/oxide-app-icon.png"
          alt=""
          width={28}
          height={28}
          decoding="async"
        />
        OXIDE
      </Link>
      <div className="nav-actions">
        <NavLink className="nav-link hide-sm" to="/features">
          Features
        </NavLink>
        <NavLink className="nav-link hide-sm" to="/status">
          Status
        </NavLink>
        <a className="nav-link hide-sm" href={discord} target="_blank" rel="noreferrer">
          Discord
        </a>
        <NavLink className="nav-link" to="/buy">
          Buy
        </NavLink>
        <Link className="btn btn-light" to="/key" style={{ height: 40, padding: "0 1.1rem" }}>
          Get a key
        </Link>
      </div>
    </nav>
  );
}

export function Footer() {
  const discord = config.discordInvite;
  return (
    <footer className="site-footer">
      <span>© OXIDE — ink + copper.</span>
      <nav>
        <Link to="/buy">Buy</Link>
        <Link to="/key">Key</Link>
        <Link to="/account">Account</Link>
        <Link to="/features">Features</Link>
        <Link to="/status">Status</Link>
        <a href={discord} target="_blank" rel="noreferrer">
          Discord
        </a>
      </nav>
    </footer>
  );
}

export default function Layout({ children }) {
  const { pathname } = useLocation();
  const isHome = pathname === "/";

  return (
    <div className="site-shell">
      {!isHome && <Nav />}
      <div className="site-main">{children}</div>
      {!isHome && <Footer />}
    </div>
  );
}

export function PageMotion({ children, className = "" }) {
  return (
    <motion.div
      className={`page-enter ${className}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function Reveal({ children, delay = 0, className = "" }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
