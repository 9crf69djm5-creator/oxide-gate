/**
 * OXIDE Gate — payment & product config
 * Edit this file (or override via window.__OXIDE_CONFIG) to plug in real checkout.
 *
 * Payment: set payment.checkoutUrl (and per-plan checkoutUrl) to your SellApp product links.
 * After checkout, SellApp delivers a key; user redeems on key.html against API_BASE_URL.
 * Future: POST /api/webhooks/sellapp can auto-insert keys (stub on gate-api).
 */
window.OXIDE_CONFIG = Object.assign(
  {
    brand: "OXIDE",
    tagline: "Roblox, read from the outside.",
    discordInvite: "https://discord.gg/3PXJ8r56T",
    siteUrl: "/",

    /** License API (gate-api). Change when deploying (e.g. https://oxide-gate-api.onrender.com). */
    API_BASE_URL: "http://127.0.0.1:8787",

    payment: {
      provider: "roblox",
      checkoutUrl: "",
      robloxPassUrl: "https://www.roblox.com/game-pass/1999478401",
      currencyLabel: "USD",
      note:
        "Buy the OXIDE Access gamepass on Roblox, then claim your license key. Redeem the same key in Oxide.exe.",
    },

    discord: {
      oauthUrl: "",
      inviteUrl: "https://discord.gg/3PXJ8r56T",
    },

    download: {
      // Fallback if API redeem does not return downloadUrl
      url: "http://127.0.0.1:8787",
      filename: "Oxide.exe",
      note: "After redeem, enter the same key in Oxide.exe. API must be running for EXE auth.",
    },

    plans: [
      {
        id: "premium",
        name: "Premium",
        price: 15,
        priceLabel: null,
        unit: "USD",
        blurb: "One payment. Access stays on your license key.",
        cta: "Buy OXIDE",
        featured: true,
        checkoutUrl: null,
      },
      {
        id: "week",
        name: "Week",
        price: 5,
        unit: "USD",
        blurb: "Seven days. Full build.",
        cta: "Get week",
        featured: false,
        checkoutUrl: null,
      },
      {
        id: "month",
        name: "Month",
        price: 12,
        unit: "USD",
        blurb: "Thirty days. Same download.",
        cta: "Get month",
        featured: false,
        checkoutUrl: null,
      },
      {
        id: "lifetime",
        name: "Lifetime",
        price: 40,
        unit: "USD",
        blurb: "No renewals. Key is yours.",
        cta: "Get lifetime",
        featured: false,
        checkoutUrl: null,
      },
    ],

    /**
     * Demo keys are seeded in gate-api SQLite (unused until redeemed).
     * Keep listed here for UI hints only — validation is server-side.
     */
    demoKeys: {
      "OXIDE-DEMO-WEEK": { plan: "Week", expiresInDays: 7 },
      "OXIDE-DEMO-MONTH": { plan: "Month", expiresInDays: 30 },
      "OXIDE-DEMO-LIFE": { plan: "Lifetime", expiresInDays: null },
    },

    features: {
      tour: [
        {
          title: "One target. Four features.",
          body: "Aimbot, silent aim, triggerbot and rage share a single lock — crosshair and shot never disagree.",
        },
        {
          title: "See it before the round does.",
          body: "Boxes, skeletons and chams with live preview so settings get judged in the menu, not mid-fight.",
        },
        {
          title: "Share a setup. In one click.",
          body: "Upload from the menu, browse what others shared, apply without touching a file.",
        },
      ],
      why: [
        {
          title: "Nothing injected.",
          body: "No module loaded, no Lua in the client. Memory is read and input is sent — both from outside.",
        },
        {
          title: "Idle costs nothing.",
          body: "Workers back off when a feature is off. Nothing writes when there is nothing to say.",
        },
        {
          title: "Updates same day.",
          body: "Offsets heal against the running build so a Roblox update does not leave features silent.",
        },
        {
          title: "Built for your game.",
          body: "Generic aim and ESP everywhere. Dedicated tabs where the game stores its own state.",
        },
      ],
      games: [
        { name: "Universal", items: ["Aimbot", "Silent aim", "ESP", "Chams", "Triggerbot", "Fly"] },
        { name: "Da Hood", items: ["Gun tracking", "Auto parry", "Anti grab", "Anti cuff"] },
        { name: "Fisch", items: ["Auto cast", "Auto shake", "Auto reel", "Zone ESP"] },
        { name: "More", items: ["Strucid", "Blade Ball", "Arsenal", "Custom tabs"] },
      ],
    },
  },
  window.__OXIDE_CONFIG || {}
);
