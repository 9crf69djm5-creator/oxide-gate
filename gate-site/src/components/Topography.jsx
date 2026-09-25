import { useEffect, useRef } from "react";

/**
 * Subtle copper topography lines — reactive to pointer.
 */
export function Topography({ className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf = 0;
    let w = 0;
    let h = 0;
    let mx = 0.5;
    let my = 0.4;
    let t = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      w = parent?.clientWidth || window.innerWidth;
      h = parent?.clientHeight || window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const onMove = (e) => {
      mx = e.clientX / (w || 1);
      my = e.clientY / (h || 1);
    };

    const draw = () => {
      t += 0.008;
      ctx.clearRect(0, 0, w, h);
      const lines = 14;
      for (let i = 0; i < lines; i++) {
        const yBase = (h / (lines + 1)) * (i + 1);
        ctx.beginPath();
        for (let x = 0; x <= w; x += 8) {
          const nx = x / w;
          const wave =
            Math.sin(nx * 6 + t + i * 0.35) * 10 +
            Math.sin(nx * 14 - t * 0.7 + i) * 4 +
            (mx - 0.5) * 28 * Math.sin(nx * Math.PI) +
            (my - 0.5) * 12;
          const y = yBase + wave;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        const alpha = 0.04 + (i / lines) * 0.06;
        ctx.strokeStyle = `rgba(230, 133, 46, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
