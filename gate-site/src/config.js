/**
 * OXIDE Gate — site config
 *
 * After deploying gate-api, set VITE_API_BASE_URL in Vercel env
 * (or edit the fallback below) to your Render URL, e.g.:
 *   https://oxide-gate-api.onrender.com
 */
const envApi = import.meta.env.VITE_API_BASE_URL;
const envDiscord = import.meta.env.VITE_DISCORD_INVITE;

export const config = {
  brand: "OXIDE",
  tagline: "Roblox, read from the outside.",
  discordInvite: envDiscord || "https://discord.gg/3PXJ8r56T",

  /** License API — localhost for dev; replace after free host deploy */
  API_BASE_URL: (envApi || "http://127.0.0.1:8787").replace(/\/$/, ""),

  payment: {
    provider: "roblox",
    checkoutUrl: "",
    /** Fallback only — each plan has its own gamepass; prefer /api/products. */
    robloxPassUrl: "https://www.roblox.com/game-pass/1999478401",
    currencyLabel: "USD",
    note:
      "Buy the Week, Month, or Lifetime gamepass on Roblox that matches the plan you want, then claim below. Redeem that key in Oxide.exe.",
  },

  download: {
    /** Direct EXE only — never the GitHub source repo. */
    url: "https://oxide-gate-site.vercel.app/downloads/Oxide.exe",
    filename: "Oxide.exe",
    note: "Download Oxide.exe, then enter your license key in the app.",
  },

  /** License tiers — length and access differ. Gamepass IDs live on gate-api. */
  plans: [
    {
      id: "week",
      name: "Week",
      price: 5,
      unit: "USD",
      blurb: "7-day key — Universal only (Aim / ESP / Chams / Fly). No Games pack.",
      cta: "Get week",
      featured: false,
      checkoutUrl: "https://www.roblox.com/game-pass/1999442394",
    },
    {
      id: "month",
      name: "Month",
      price: 12,
      unit: "USD",
      blurb: "30-day key — Universal + Games tabs.",
      cta: "Get month",
      featured: false,
      checkoutUrl: "https://www.roblox.com/game-pass/1999370393",
    },
    {
      id: "lifetime",
      name: "Lifetime",
      price: 40,
      unit: "USD",
      blurb: "Forever — full OXIDE including all games + priority.",
      cta: "Get lifetime",
      featured: true,
      checkoutUrl: "https://www.roblox.com/game-pass/1999478401",
    },
  ],

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
      {
        name: "Universal",
        items: ["Aimbot", "Silent aim", "ESP", "Chams", "Triggerbot", "Fly", "Rage"],
      },
      {
        name: "Da Hood",
        items: ["Gun tracking", "Auto parry", "Anti grab", "Anti cuff"],
      },
      {
        name: "Fisch",
        items: ["Auto cast", "Auto shake", "Auto reel", "Zone ESP"],
      },
      {
        name: "More",
        items: ["Strucid", "Blade Ball", "Arsenal", "Custom tabs"],
      },
    ],
    catalog: [
      {
        group: "Combat",
        items: [
          { name: "Aimbot", desc: "Smooth or snap lock with FOV, sticky, and prediction." },
          { name: "Silent aim", desc: "Redirects hits without moving your camera visibly." },
          { name: "Triggerbot", desc: "Fires when crosshair clears the locked target." },
          { name: "Rage", desc: "Aggressive aim modes for high-pressure fights." },
        ],
      },
      {
        group: "Visuals",
        items: [
          { name: "ESP boxes", desc: "2D / corner boxes with health and distance." },
          { name: "Skeletons", desc: "Bone overlays that track pose in real time." },
          { name: "Chams", desc: "Filled player silhouettes through walls." },
          { name: "Tracers", desc: "Lines from screen origin to targets." },
        ],
      },
      {
        group: "Movement",
        items: [
          { name: "Fly", desc: "External flight with speed and keybind control." },
          { name: "Speed", desc: "Walk / run multipliers where the game allows." },
        ],
      },
      {
        group: "Misc",
        items: [
          { name: "Config cloud", desc: "Share and apply setups from the menu." },
          { name: "Watermark", desc: "FPS, build, online count — ink + copper HUD." },
          { name: "Keybinds", desc: "Per-feature binds with toggle or hold modes." },
        ],
      },
    ],
  },
};
