import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageMotion, Reveal } from "../components/Layout";
import { fetchReleases, formatReleaseDate, formatSize } from "../lib/releases";

export default function Changelog() {
  const [state, setState] = useState({ loading: true, releases: [], message: "" });

  useEffect(() => {
    let alive = true;
    fetchReleases().then((r) => {
      if (alive) setState({ loading: false, releases: r.releases, message: r.ok ? "" : r.message });
    });
    return () => {
      alive = false;
    };
  }, []);

  const [latest, ...older] = state.releases;

  return (
    <PageMotion>
      <section className="section section-dark changelog-page" style={{ paddingTop: "3rem" }}>
        <div className="wrap">
          <Reveal>
            <p className="section-kicker">Updates</p>
            <h2>Changelog</h2>
            <p className="section-lead">
              Every Oxide.exe release, newest first. The download button always serves the latest build.
            </p>
          </Reveal>

          {state.loading && <p className="hint">Loading releases…</p>}
          {state.message && <p className="status err">{state.message}</p>}

          {latest && (
            <Reveal delay={0.04}>
              <article className="release-card release-latest" id={`v${latest.version}`}>
                <header className="release-head">
                  <div>
                    <span className="release-tag">Latest</span>
                    <h3>
                      v{latest.version}
                      {latest.title ? <span className="release-title"> — {latest.title}</span> : null}
                    </h3>
                    <p className="release-meta">
                      {formatReleaseDate(latest.date)} · {formatSize(latest.sizeBytes)}
                      {latest.clientVersion ? ` · Roblox ${latest.clientVersion}` : ""}
                    </p>
                  </div>
                  <a className="btn btn-accent" href={latest.downloadUrl} download="Oxide.exe">
                    Download v{latest.version}
                  </a>
                </header>
                <ul className="release-changes">
                  {latest.changes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                {latest.sha256 && (
                  <p className="release-hash">
                    SHA256 <code>{latest.sha256}</code>
                  </p>
                )}
              </article>
            </Reveal>
          )}

          {older.map((r, i) => (
            <Reveal key={r.version} delay={0.06 + i * 0.03}>
              <article className="release-card" id={`v${r.version}`}>
                <header className="release-head">
                  <div>
                    <h3>
                      v{r.version}
                      {r.title ? <span className="release-title"> — {r.title}</span> : null}
                    </h3>
                    <p className="release-meta">
                      {formatReleaseDate(r.date)} · {formatSize(r.sizeBytes)}
                    </p>
                  </div>
                </header>
                <ul className="release-changes">
                  {r.changes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </article>
            </Reveal>
          ))}

          <Reveal delay={0.1}>
            <p className="offsets-footnote">
              Need a key first? <Link to="/buy">Buy</Link> · <Link to="/key">Redeem</Link> ·{" "}
              <Link to="/status">System status</Link>
            </p>
          </Reveal>
        </div>
      </section>
    </PageMotion>
  );
}
