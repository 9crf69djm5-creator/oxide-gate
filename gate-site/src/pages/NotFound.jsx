import { Link } from "react-router-dom";
import { PageMotion } from "../components/Layout";

export default function NotFound() {
  return (
    <PageMotion>
      <div className="gate-page">
        <main className="gate-main">
          <div className="empty-state">
            <h1>Page not found</h1>
            <p className="gate-blurb">That page doesn&apos;t exist.</p>
            <Link className="btn btn-accent" to="/" style={{ marginTop: "1.5rem" }}>
              Back to home
            </Link>
          </div>
        </main>
      </div>
    </PageMotion>
  );
}
