/**
 * Dot topography canvas for gate pages.
 * Sparse copper dots + faint grid on dark ink.
 */
(function () {
  function paint(canvas) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const gap = 18;
    const accent = "rgba(230, 133, 46,";
    const mute = "rgba(179, 173, 163,";

    for (let y = gap / 2; y < h; y += gap) {
      for (let x = gap / 2; x < w; x += gap) {
        const n =
          Math.sin(x * 0.035 + y * 0.02) * Math.cos(x * 0.012 - y * 0.028);
        const spark = (n + 1) * 0.5;
        const hot = spark > 0.82;
        const r = hot ? 1.35 : 0.85;
        const a = hot ? 0.55 + (spark - 0.82) * 1.2 : 0.08 + spark * 0.12;
        ctx.beginPath();
        ctx.fillStyle = (hot ? accent : mute) + a + ")";
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function bind(canvas) {
    const draw = () => paint(canvas);
    draw();
    let t;
    window.addEventListener("resize", () => {
      clearTimeout(t);
      t = setTimeout(draw, 80);
    });
  }

  document.querySelectorAll("[data-topo]").forEach(bind);
})();
