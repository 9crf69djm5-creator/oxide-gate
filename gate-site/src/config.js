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

  /** License API — production Render fallback so local misconfig still hits cloud */
  API_BASE_URL: (envApi || "https://oxide-gate-api.onrender.com").replace(/\/$/, ""),

  /** Discord bot HTTP health (Render free web service) */
  discordBotHealthUrl:
    import.meta.env.VITE_DISCORD_BOT_HEALTH_URL ||
    "https://oxide-discord-bot-fra.onrender.com/",

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
    /** Direct EXE only — never the GitHub source repo. Served by gate-api. */
    url: "https://oxide-gate-api.onrender.com/downloads/Oxide.exe",
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

  features: {
    tour: [
      {
        title: "Blade Ball auto parry",
        body: "One press per approach on the Blade Ball page. Timing, Ping Offset, and Ping Compensation set the lead. Target Check still parries an unknown ball that is coming at you, and skips a ball named for someone else.",
      },
      {
        title: "Murder Mystery 2 roles",
        body: "At round start, players are labeled Murderer, Sheriff, or Innocent. MM2 Murderer Only on the Aim page locks aim to the murderer.",
      },
      {
        title: "Coin Farm, Teleport to Gun, Players List",
        body: "Coin Farm and Teleport to Gun are on the World page, with Auto Pickup Gun, Coin ESP, and Dropped Gun ESP. Players List teleports, spectates, and unspectates.",
      },
      {
        title: "Aim and ESP",
        body: "After those: mouse, memory, and silent aim, FOV, smoothing, prediction, Visible Check, triggerbot, boxes, names, health, skeleton, and mesh chams.",
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
        title: "Offsets follow the build.",
        body: "The offsets page shows the client version this Oxide build was made for. There is no separate live offset feed.",
      },
      {
        title: "Divinity menu",
        body: "The in-app menu is Divinity: a left tab rail and two columns. Every Oxide control is on that menu.",
      },
    ],
    games: [
      {
        name: "Blade Ball",
        items: ["Auto Parry", "Curve Aware", "Target Check", "Spam On Clash", "Visualize"],
      },
      {
        name: "Murder Mystery 2",
        items: ["Murderer", "Sheriff", "Innocent", "Coin Farm", "Teleport to Gun"],
      },
      {
        name: "Aim and ESP",
        items: ["Aimbot", "Silent aim", "Visible Check", "ESP", "Mesh chams"],
      },
      {
        name: "Other games",
        items: ["Da Hood", "Fisch", "Strucid", "Arsenal", "Rivals", "Sniper Duels"],
      },
    ],
    catalog: [
      {
        group: "Blade Ball",
        items: [
          { name: "Auto Parry", desc: "One press when a ball coming at you enters the timing window." },
          { name: "Target Check", desc: "An unknown target still parries. A name that is someone else does not." },
          { name: "Curve Aware", desc: "Curve from velocity changes, then coast. A hit drops the curve." },
          { name: "Spam On Clash", desc: "Repeats the parry input inside Clash Distance, capped by Max Spam Rate." },
        ],
      },
      {
        group: "Murder Mystery 2",
        items: [
          { name: "Role labels", desc: "Murderer, Sheriff, and Innocent at round start." },
          { name: "MM2 Murderer Only", desc: "Aim locks onto the murderer only." },
          { name: "Coin Farm", desc: "Flies to each dropped coin while it is on." },
          { name: "Teleport to Gun", desc: "Teleport to the dropped gun. Auto Pickup Gun is the separate toggle." },
        ],
      },
      {
        group: "Players List",
        items: [
          { name: "Teleport", desc: "Teleport to a player from the list." },
          { name: "Spectate", desc: "Spectate a player." },
          { name: "Unspectate", desc: "Return the camera." },
        ],
      },
      {
        group: "Aim",
        items: [
          { name: "Aimbot", desc: "Mouse, memory, or silent aim, with FOV, smoothing, and prediction." },
          { name: "Visible Check", desc: "Raycast so aim ignores targets that are not visible." },
          { name: "Triggerbot", desc: "Fires when the crosshair is on the locked target." },
          { name: "Crosshair", desc: "On-screen crosshair. The label is Oxide." },
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
          { name: "Watermark", desc: "FPS and build on the Divinity menu." },
          { name: "Keybinds", desc: "Per-feature binds with toggle or hold modes." },
        ],
      },
    ],
  },
};
