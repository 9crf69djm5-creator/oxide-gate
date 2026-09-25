import { Link } from "react-router-dom";
import { config } from "../config";
import { PageMotion, Reveal } from "../components/Layout";

export default function Features() {
  const { catalog, games } = config.features;
  const discord = config.discordInvite;

  return (
    <PageMotion>
      <section className="section section-dark" style={{ paddingTop: "3rem" }}>
        <div className="wrap">
          <Reveal>
            <p className="section-kicker">OXIDE</p>
            <h2>Feature list</h2>
            <p className="section-lead">
              Universal combat and visuals everywhere — plus dedicated game tabs.
            </p>
          </Reveal>

          <div className="catalog-grid" style={{ marginTop: "2.5rem" }}>
            {catalog.map((group, i) => (
              <Reveal key={group.group} delay={0.05 * i}>
                <div className="catalog-group">
                  <h3>{group.group}</h3>
                  <ul>
                    {group.items.map((item) => (
                      <li key={item.name}>
                        <span className="catalog-item-name">{item.name}</span>
                        <span className="catalog-item-desc">{item.desc}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-dark">
        <div className="wrap">
          <Reveal>
            <p className="section-kicker">Games</p>
            <h2>Universal + game tabs</h2>
            <p className="section-lead">
              Same aim/ESP stack on every experience. Extra tools where the game
              exposes its own state.
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

          <Reveal delay={0.2}>
            <div className="hero-ctas" style={{ marginTop: "2.5rem" }}>
              <Link className="btn btn-accent" to="/buy">
                Buy
              </Link>
              <Link className="btn btn-ghost" to="/key">
                Redeem key
              </Link>
              <a className="btn btn-ghost" href={discord} target="_blank" rel="noreferrer">
                Discord
              </a>
            </div>
          </Reveal>
        </div>
      </section>
    </PageMotion>
  );
}
