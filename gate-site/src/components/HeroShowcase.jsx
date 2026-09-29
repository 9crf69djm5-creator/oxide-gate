import { motion } from "framer-motion";

const ease = [0.22, 1, 0.36, 1];

export function HeroShowcase() {
  return (
    <motion.div
      className="hero-stage"
      initial={{ opacity: 0, x: 36, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.85, delay: 0.2, ease }}
    >
      <div className="hero-stage-glow" />
      <motion.figure
        className="hero-product"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="hero-product-bar" aria-hidden="true">
          <span className="hero-viewport-dot" />
          <span>OXIDE · EXTERNAL UI</span>
          <span className="hero-product-live">LIVE PRODUCT</span>
        </div>
        <img
          src="/oxide-external-ui.webp"
          alt="The real OXIDE external control window open over Roblox, showing aim and visibility settings"
          width="847"
          height="672"
          fetchPriority="high"
          decoding="async"
        />
        <figcaption>
          Real interface. Separate process. No injected menu.
        </figcaption>
      </motion.figure>
    </motion.div>
  );
}
