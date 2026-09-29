import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { exchangeLoginCode, fetchAdminSession } from "../lib/admin";
import NotFound from "./NotFound";

const AdminPanel = lazy(() => import("./AdminPanel"));

/** One-time codes must be exchanged exactly once even if the effect re-runs. */
let pendingExchange = null;

/**
 * Anyone without a server-confirmed owner session gets the same view as any
 * unknown URL. Only a visitor arriving with a login code sees a blank screen
 * while it is exchanged.
 */
export default function Admin() {
  const [hasCode] = useState(() => /(^#|&)code=/.test(window.location.hash));
  const [state, setState] = useState(hasCode ? "exchanging" : "hidden");
  const [session, setSession] = useState(null);

  const hide = useCallback(() => {
    setSession(null);
    setState("hidden");
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const code = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("code");
      if (code) {
        window.history.replaceState(null, "", window.location.pathname);
        pendingExchange = exchangeLoginCode(code);
      }
      if (pendingExchange) {
        const ex = await pendingExchange;
        if (!alive) return;
        pendingExchange = null;
        if (!ex.ok) return hide();
      }
      const s = await fetchAdminSession();
      if (!alive) return;
      if (!s.ok) return hide();
      setSession(s);
      setState("owner");
    })();
    return () => {
      alive = false;
    };
  }, [hide]);

  if (state === "owner" && session) {
    return (
      <Suspense fallback={null}>
        <AdminPanel session={session} onSessionLost={hide} />
      </Suspense>
    );
  }
  if (state === "exchanging") return null;
  return <NotFound />;
}
