import { motion } from "framer-motion";

const ease = [0.22, 1, 0.36, 1];

const tabs = ["Aim", "Visuals", "Movement", "Games", "System"];
const subs = ["Blade Ball", "Da Hood", "Fisch"];

export function HeroShowcase() {
  return (
    <motion.div
      className="hero-stage"
      initial={{ opacity: 0, x: 36, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.85, delay: 0.2, ease }}
    >
      <div
        className="hero-divinity"
        style={{
          width: "100%",
          maxWidth: 520,
          height: 340,
          background: "#0f0f0f",
          border: "1px solid #202020",
          borderRadius: 4,
          display: "grid",
          gridTemplateColumns: "148px 1fr",
          overflow: "hidden",
          color: "#d7d7d7",
          fontFamily: "Kanit, Segoe UI, sans-serif",
        }}
      >
        <div style={{ background: "#090909", borderRight: "2px solid #bdcbf2", padding: "14px 10px" }}>
          <div style={{ textAlign: "center", fontSize: 22, marginBottom: 12 }}>OXIDE</div>
          {tabs.map((name, i) => (
            <div
              key={name}
              style={{
                background: "#0c0c0c",
                border: "1px solid #202020",
                borderRadius: i === 0 ? "4px 4px 0 0" : i === tabs.length - 1 ? "0 0 4px 4px" : 0,
                padding: "7px 10px",
                fontSize: 13,
                color: i === 3 ? "#d7d7d7" : "#505050",
              }}
            >
              {name}
              {i === 3 &&
                subs.map((s, si) => (
                  <div key={s} style={{ color: si === 0 ? "#bdcbf2" : "#505050", padding: "3px 0 0 8px", fontSize: 12 }}>
                    {s}
                  </div>
                ))}
            </div>
          ))}
        </div>
        <div style={{ padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Panel title="Blade Ball" rows={["Auto Parry", "Target Check", "Curve Aware"]} />
          <Panel title="Murder Mystery 2" rows={["Murderer", "Sheriff", "Innocent", "Coin Farm"]} />
        </div>
      </div>
      <p style={{ marginTop: 10, color: "#9a9a9a", fontSize: 13 }}>
        Divinity menu. No gameplay clip.
      </p>
    </motion.div>
  );
}

function Panel({ title, rows }) {
  return (
    <div style={{ background: "#0f0f0f", border: "1px solid #202020", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ background: "#090909", padding: "8px 10px", fontSize: 13 }}>{title}</div>
      <div style={{ height: 2, background: "#bdcbf2" }} />
      <div style={{ padding: 10, display: "grid", gap: 8 }}>
        {rows.map((row) => (
          <div key={row} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#d7d7d7" }}>
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: 3,
                background: "#bdcbf2",
                display: "inline-block",
              }}
            />
            {row}
          </div>
        ))}
      </div>
    </div>
  );
}
