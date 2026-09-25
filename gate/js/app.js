/**
 * OXIDE Gate — front-end flows (buy, redeem via API, session).
 */
(function () {
  const cfg = window.OXIDE_CONFIG || {};
  const STORAGE_KEY = "oxide_gate_session";

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $$(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function apiBase() {
    return String(cfg.API_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
  }

  function checkoutUrlFor(plan) {
    if (plan && plan.checkoutUrl) return plan.checkoutUrl;
    const p = cfg.payment || {};
    if (p.provider === "roblox" && p.robloxPassUrl) return p.robloxPassUrl;
    return p.checkoutUrl || "#checkout-placeholder";
  }

  function openCheckout(plan) {
    const url = checkoutUrlFor(plan);
    if (!url || url === "#checkout-placeholder") {
      alert(
        "Checkout URL not configured yet.\n\nEdit gate/js/config.js → payment.checkoutUrl\n(SellApp product link recommended).\n\nAfter payment, redeem your key on Get a key."
      );
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function loadSession() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch {
      return null;
    }
  }

  function saveSession(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function clearSession() {
    localStorage.removeItem(STORAGE_KEY);
  }

  async function redeemKey(raw) {
    const key = String(raw || "")
      .trim()
      .toUpperCase();
    if (!key) return { ok: false, message: "Enter a license key." };

    try {
      const res = await fetch(apiBase() + "/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (!res.ok || !data || !data.ok) {
        return {
          ok: false,
          message:
            (data && data.message) ||
            "Redeem failed. Is gate-api running at " + apiBase() + "?",
        };
      }

      const expiresAt = data.expires ? new Date(data.expires).getTime() : null;
      const session = {
        key: data.key || key,
        plan: data.plan || "Premium",
        redeemedAt: Date.now(),
        expiresAt,
        token: data.token || null,
        downloadUrl: data.downloadUrl || (cfg.download && cfg.download.url) || "",
        discordLinked: !!(loadSession() || {}).discordLinked,
        discordUser: (loadSession() || {}).discordUser || null,
      };
      saveSession(session);
      return { ok: true, message: "Key redeemed. Access unlocked.", session };
    } catch (err) {
      return {
        ok: false,
        message:
          "Can't reach auth server (" +
          apiBase() +
          "). Start gate-api with npm start.",
      };
    }
  }

  function linkDiscordDemo() {
    const invite =
      (cfg.discord && (cfg.discord.oauthUrl || cfg.discord.inviteUrl)) ||
      cfg.discordInvite ||
      "#";
    const existing = loadSession() || {
      key: null,
      plan: "Guest",
      redeemedAt: Date.now(),
      expiresAt: null,
    };
    existing.discordLinked = true;
    existing.discordUser = "oxide_user#" + String(Math.floor(Math.random() * 9000) + 1000);
    saveSession(existing);

    if (cfg.discord && cfg.discord.oauthUrl) {
      window.location.href = cfg.discord.oauthUrl;
      return;
    }
    if (invite && invite !== "#") {
      window.open(invite, "_blank", "noopener,noreferrer");
    }
    return existing;
  }

  /* —— Buy page —— */
  function initBuy() {
    const featured = (cfg.plans || []).find((p) => p.featured) || (cfg.plans || [])[0];
    if (!featured) return;

    const title = $("#buy-title");
    const amount = $("#buy-amount");
    const unit = $("#buy-unit");
    const blurb = $("#buy-blurb");
    const cta = $("#buy-cta");
    const note = $("#buy-payment-note");

    if (title) title.textContent = featured.name;
    if (amount)
      amount.textContent =
        featured.priceLabel != null ? featured.priceLabel : featured.price;
    if (unit)
      unit.textContent =
        featured.unit || (cfg.payment && cfg.payment.currencyLabel) || "";
    if (blurb) blurb.textContent = featured.blurb || "";
    if (note && cfg.payment && cfg.payment.note) note.textContent = cfg.payment.note;
    if (cta) {
      cta.textContent = featured.cta || "Buy OXIDE";
      cta.addEventListener("click", (e) => {
        e.preventDefault();
        openCheckout(featured);
      });
    }

    const discord = $("#buy-discord");
    if (discord) {
      discord.href = cfg.discordInvite || (cfg.discord && cfg.discord.inviteUrl) || "#";
    }

    const extras = (cfg.plans || []).filter((p) => !p.featured);
    const plansEl = $("#buy-plans");
    if (plansEl && extras.length) {
      plansEl.innerHTML = extras
        .map(
          (p) => `
        <article class="plan" data-plan="${p.id}">
          <h3>${escapeHtml(p.name)}</h3>
          <div class="plan-price">${escapeHtml(String(p.price))} ${escapeHtml(p.unit || "")}</div>
          <p>${escapeHtml(p.blurb || "")}</p>
          <button type="button" class="btn btn-ghost btn-block" data-checkout="${p.id}">${escapeHtml(p.cta || "Buy")}</button>
        </article>`
        )
        .join("");
      plansEl.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-checkout]");
        if (!btn) return;
        const plan = (cfg.plans || []).find(
          (x) => x.id === btn.getAttribute("data-checkout")
        );
        openCheckout(plan);
      });
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* —— Key page —— */
  function initKey() {
    const form = $("#redeem-form");
    const status = $("#redeem-status");
    const discordBtn = $("#discord-link");

    if (discordBtn) {
      discordBtn.addEventListener("click", (e) => {
        e.preventDefault();
        linkDiscordDemo();
        if (status) {
          status.className = "status ok";
          status.textContent =
            "Discord linked (demo). Redeem a key to unlock download.";
        }
        setTimeout(() => {
          if (loadSession() && loadSession().key) {
            window.location.href = "account.html";
          }
        }, 600);
      });
    }

    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = $("#license-key");
        if (status) {
          status.className = "status";
          status.textContent = "Checking key…";
        }
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        const result = await redeemKey(input && input.value);
        if (submitBtn) submitBtn.disabled = false;
        if (status) {
          status.className = "status " + (result.ok ? "ok" : "err");
          status.textContent = result.message;
        }
        if (result.ok) {
          setTimeout(() => {
            window.location.href = "account.html";
          }, 700);
        }
      });
    }
  }

  /* —— Account page —— */
  function initAccount() {
    const session = loadSession();
    const empty = $("#account-empty");
    const filled = $("#account-filled");

    if (!session || !session.key) {
      if (empty) empty.hidden = false;
      if (filled) filled.hidden = true;
      return;
    }

    if (empty) empty.hidden = true;
    if (filled) filled.hidden = false;

    const planEl = $("#acc-plan");
    const keyEl = $("#acc-key");
    const expEl = $("#acc-expires");
    const discEl = $("#acc-discord");
    const dl = $("#acc-download");
    const note = $("#acc-download-note");

    if (planEl) planEl.textContent = session.plan || "—";
    if (keyEl) keyEl.textContent = session.key;
    if (expEl) {
      expEl.textContent = session.expiresAt
        ? new Date(session.expiresAt).toLocaleString()
        : "Never";
    }
    if (discEl) {
      discEl.textContent = session.discordLinked
        ? session.discordUser || "Linked"
        : "Not linked";
    }
    if (dl) {
      const url =
        session.downloadUrl ||
        (cfg.download && cfg.download.url) ||
        "#download-placeholder";
      dl.href = url;
      dl.textContent =
        "Download " + ((cfg.download && cfg.download.filename) || "Oxide.exe");
      dl.addEventListener("click", (e) => {
        if (!url || url === "#download-placeholder" || url === apiBase()) {
          e.preventDefault();
          alert(
            "Set DOWNLOAD_URL in gate-api/.env and download.url in config.js.\n\nBuilt EXE (dev):\nExternal/x64/Release/Oxide.exe"
          );
        }
      });
    }
    if (note) {
      note.textContent =
        (cfg.download && cfg.download.note) ||
        "Enter this key in Oxide.exe on launch.";
    }

    const logout = $("#acc-logout");
    if (logout) {
      logout.addEventListener("click", (e) => {
        e.preventDefault();
        clearSession();
        window.location.href = "key.html";
      });
    }
  }

  /* —— Landing —— */
  function initLanding() {
    const tour = $("#tour-grid");
    if (tour && cfg.features && cfg.features.tour) {
      tour.innerHTML = cfg.features.tour
        .map(
          (t) => `
        <article class="tour-card">
          <h3>${escapeHtml(t.title)}</h3>
          <p>${escapeHtml(t.body)}</p>
        </article>`
        )
        .join("");
    }

    const why = $("#why-grid");
    if (why && cfg.features && cfg.features.why) {
      why.innerHTML = cfg.features.why
        .map(
          (t) => `
        <article class="why-card">
          <h3>${escapeHtml(t.title)}</h3>
          <p>${escapeHtml(t.body)}</p>
        </article>`
        )
        .join("");
    }

    const games = $("#games-grid");
    if (games && cfg.features && cfg.features.games) {
      games.innerHTML = cfg.features.games
        .map(
          (g) => `
        <div class="game-col">
          <h3>${escapeHtml(g.name)}</h3>
          <ul>${(g.items || []).map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
        </div>`
        )
        .join("");
    }

    $$("[data-discord]").forEach((a) => {
      a.href = cfg.discordInvite || (cfg.discord && cfg.discord.inviteUrl) || "#";
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const page = document.body.getAttribute("data-page");
    if (page === "buy") initBuy();
    if (page === "key") initKey();
    if (page === "account") initAccount();
    if (page === "home") initLanding();
  });

  window.OXIDE_GATE = { redeemKey, openCheckout, loadSession, clearSession, apiBase };
})();
