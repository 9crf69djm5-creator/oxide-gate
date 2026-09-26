import { Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Buy from "./pages/Buy";
import Key from "./pages/Key";
import Account from "./pages/Account";
import Features from "./pages/Features";
import Status from "./pages/Status";
import Offsets from "./pages/Offsets";

export default function App() {
  const location = useLocation();

  return (
    <Layout>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<Home />} />
          <Route path="/buy" element={<Buy />} />
          <Route path="/key" element={<Key />} />
          <Route path="/account" element={<Account />} />
          <Route path="/features" element={<Features />} />
          <Route path="/status" element={<Status />} />
          <Route path="/offsets" element={<Offsets />} />
        </Routes>
      </AnimatePresence>
    </Layout>
  );
}
