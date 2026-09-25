import { motion } from "framer-motion";

const ease = [0.22, 1, 0.36, 1];

const chips = ["Aimbot", "Silent", "ESP", "Chams", "External"];

const boxes = [
  { x: "18%", y: "22%", w: 72, h: 118, label: "84m", delay: 0.45 },
  { x: "58%", y: "28%", w: 64, h: 108, label: "41m", delay: 0.55 },
  { x: "38%", y: "48%", w: 78, h: 128, label: "12m", delay: 0.65 },
];

export function HeroShowcase() {
  return (
    <motion.div
      className="hero-stage"
      aria-hidden="true"
      initial={{ opacity: 0, x: 36, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.85, delay: 0.2, ease }}
    >
      <div className="hero-stage-glow" />

      <motion.div
        className="hero-viewport"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="hero-viewport-bar">
          <span className="hero-viewport-dot" />
          <span>OXIDE · LIVE READ</span>
          <span className="hero-viewport-fps">144 FPS</span>
        </div>

        <div className="hero-viewport-scene">
          <motion.div
            className="hero-fov"
            animate={{ opacity: [0.35, 0.7, 0.35], scale: [1, 1.04, 1] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          />

          {boxes.map((b) => (
            <motion.div
              key={b.label}
              className="hero-esp"
              style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: b.delay, ease }}
            >
              <span className="hero-esp-label">{b.label}</span>
              <span className="hero-esp-skel" />
            </motion.div>
          ))}

          <div className="hero-crosshair" />
        </div>
      </motion.div>

      <motion.div
        className="hero-menu"
        initial={{ opacity: 0, y: 28, rotate: 2 }}
        animate={{ opacity: 1, y: 0, rotate: -2.5 }}
        transition={{ duration: 0.7, delay: 0.42, ease }}
        whileHover={{ y: -6, rotate: -1 }}
      >
        <div className="menu-rail">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="menu-body">
          <strong>OXIDE // AIM</strong>
          <div className="hero-menu-toggle">
            <em>Enabled</em>
            <i />
          </div>
          <div className="menu-row accent" />
          <div className="menu-row" />
          <div className="menu-row short" />
          <div className="menu-row" />
          <div className="hero-menu-slider">
            <span>Smooth</span>
            <b />
          </div>
        </div>
      </motion.div>

      <div className="hero-chip-float">
        {chips.map((chip, i) => (
          <motion.span
            key={chip}
            className="hero-chip"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.55 + i * 0.07, ease }}
          >
            {chip}
          </motion.span>
        ))}
      </div>
    </motion.div>
  );
}
