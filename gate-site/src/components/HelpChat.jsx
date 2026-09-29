import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { config } from "../config";
import "./HelpChat.css";

const STORAGE_KEY = "oxide-help-chat";
const MAX_INPUT = 800;
const SITE_HOSTS = new Set(["oxide-gate-site.vercel.app", typeof window !== "undefined" ? window.location.host : ""]);

const GREETING = {
  role: "assistant",
  content:
    "Hey, I'm the OXIDE Assistant. Ask me about buying or redeeming a key, downloading Oxide.exe, HWID, updates, offsets or status.",
};

const SUGGESTIONS = [
  "How do I get a key?",
  "Where do I download Oxide.exe?",
  "I need to move my key to a new PC",
  "How do I get help on Discord?",
];

function loadHistory() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(raw) ? raw.slice(-30) : [];
  } catch {
    return [];
  }
}

const TOKEN_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)|`([^`]+)`|\*\*([^*]+)\*\*/g;

function RichText({ text, onInternal }) {
  const renderLink = (href, label, key) => {
    let url;
    try {
      url = new URL(href);
    } catch {
      return label;
    }
    if (SITE_HOSTS.has(url.host)) {
      const path = url.pathname + url.search + url.hash;
      return (
        <a key={key} href={path} onClick={(e) => { e.preventDefault(); onInternal(path); }}>
          {label}
        </a>
      );
    }
    return (
      <a key={key} href={url.href} target="_blank" rel="noreferrer noopener">
        {label}
      </a>
    );
  };

  return text.split("\n").map((line, li) => {
    const parts = [];
    let last = 0;
    let m;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(line))) {
      if (m.index > last) parts.push(line.slice(last, m.index));
      const key = `${li}-${m.index}`;
      if (m[1]) {
        parts.push(renderLink(m[2], m[1], key));
      } else if (m[3]) {
        const trail = m[3].match(/[.,;:!?)\]]+$/)?.[0] || "";
        const href = trail ? m[3].slice(0, -trail.length) : m[3];
        parts.push(renderLink(href, href, key));
        if (trail) parts.push(trail);
      } else if (m[4]) {
        parts.push(<code key={key}>{m[4]}</code>);
      } else if (m[5]) {
        parts.push(<strong key={key}>{m[5]}</strong>);
      }
      last = m.index + m[0].length;
    }
    if (last < line.length) parts.push(line.slice(last));
    return (
      <p key={li} className={line.trim() ? undefined : "help-chat-gap"}>
        {parts}
      </p>
    );
  });
}

export default function HelpChat() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(loadHistory);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const discord = config.discordInvite;

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    } catch {
      /* storage full or disabled */
    }
  }, [messages]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, open]);

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => inputRef.current?.focus(), 150);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (pathname.startsWith("/admin")) return null;

  function goInternal(path) {
    navigate(path);
    if (window.matchMedia("(max-width: 560px)").matches) setOpen(false);
  }

  async function send(text) {
    const content = String(text || "").trim().slice(0, MAX_INPUT);
    if (!content || busy) return;
    const history = [...messages.filter((m) => !m.error), { role: "user", content }];
    setMessages((prev) => [...prev, { role: "user", content }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map(({ role, content: c }) => ({ role, content: c })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.reply) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            error: true,
            content: data.message || `The assistant is unavailable right now. Ask in Discord: ${discord}`,
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          error: true,
          content: `Couldn't reach the assistant. Check your connection, or ask in Discord: ${discord}`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    send(input);
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  }

  function clearChat() {
    setMessages([]);
    inputRef.current?.focus();
  }

  const shown = [GREETING, ...messages];

  return (
    <div className="help-chat">
      <AnimatePresence>
        {open && (
          <motion.section
            key="panel"
            className="help-chat-panel"
            role="dialog"
            aria-label="OXIDE Assistant"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <header className="help-chat-head">
              <img className="help-chat-avatar" src="/oxide-app-icon.png" alt="" width={32} height={32} />
              <div className="help-chat-title">
                <strong>OXIDE Assistant</strong>
                <span>
                  <i className="help-chat-dot" aria-hidden="true" /> AI help · replies in seconds
                </span>
              </div>
              <a
                className="help-chat-discord"
                href={discord}
                target="_blank"
                rel="noreferrer noopener"
                title="Open the OXIDE Discord"
              >
                Discord
              </a>
              <button type="button" className="help-chat-icon" onClick={() => setOpen(false)} aria-label="Close chat">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </header>

            <div className="help-chat-list" ref={listRef} aria-live="polite">
              {shown.map((m, i) => (
                <div
                  key={i}
                  className={`help-chat-msg ${m.role === "user" ? "from-user" : "from-bot"}${m.error ? " is-error" : ""}`}
                >
                  <RichText text={m.content} onInternal={goInternal} />
                </div>
              ))}
              {busy && (
                <div className="help-chat-msg from-bot help-chat-typing" aria-label="Assistant is typing">
                  <span />
                  <span />
                  <span />
                </div>
              )}
              {!messages.length && !busy && (
                <div className="help-chat-suggest">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <form className="help-chat-form" onSubmit={onSubmit}>
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                maxLength={MAX_INPUT}
                placeholder="Ask about keys, download, HWID…"
                aria-label="Message the OXIDE Assistant"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
              />
              <button type="submit" className="help-chat-send" disabled={busy || !input.trim()} aria-label="Send">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path d="M4 12l16-8-6 16-2.5-6.5L4 12z" fill="currentColor" />
                </svg>
              </button>
            </form>
            <div className="help-chat-foot">
              <span>AI answers can be wrong. Staff are on Discord.</span>
              {messages.length > 0 && (
                <button type="button" onClick={clearChat}>
                  Clear
                </button>
              )}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        className={`help-chat-launcher${open ? " is-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close OXIDE Assistant" : "Open OXIDE Assistant"}
        aria-expanded={open}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        {open ? (
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        ) : (
          <>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path
                d="M4 5.5A2.5 2.5 0 016.5 3h11A2.5 2.5 0 0120 5.5v8a2.5 2.5 0 01-2.5 2.5H10l-4.2 3.6c-.5.4-1.3 0-1.3-.6V16A2.5 2.5 0 014 13.5v-8z"
                fill="currentColor"
              />
            </svg>
            <span className="help-chat-launcher-label">Help</span>
          </>
        )}
      </motion.button>
    </div>
  );
}
