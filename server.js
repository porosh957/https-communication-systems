
require("dotenv").config();
const express = require("express");
const http = require("http");
const crypto = require("crypto");
const path = require("path");
const { WebSocketServer } = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/bridge" });
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 8787);
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

// Prototype storage: in-memory only. Restarting this server clears sessions.
const sessions = new Map();
const sockets = new Map();
app.use(express.json({ limit: "64kb" }));
// CORS support for browser clients (website and PenguinMod extension).
// Token authentication uses request headers, not cookies.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-session-id, x-username, x-session-token");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.static(path.join(__dirname, "public")));

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function getAuthorizedSession(req) {
  const id = req.header("x-session-id") || req.query.sessionId;
  const username = req.header("x-username") || req.query.username;
  const token = req.header("x-session-token") || req.query.token;
  const s = sessions.get(id);
  if (!s || !safeEqual(s.username, username) || !safeEqual(s.token, token)) return null;
  return s;
}
function cleanUsername(value) {
  return typeof value === "string" ? value.trim().slice(0, 32) : "";
}

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "https-communication-systems", sessions: sessions.size }));

app.post("/api/sessions", (req, res) => {
  const username = cleanUsername(req.body.username);
  if (!/^[a-zA-Z0-9_.-]{2,32}$/.test(username)) {
    return res.status(400).json({ error: "Username must be 2â€“32 characters: letters, numbers, _, . or -" });
  }
  // UUID collision is extraordinarily unlikely; still verify uniqueness before storing.
  let sessionId;
  do { sessionId = crypto.randomUUID(); } while (sessions.has(sessionId));
  const token = crypto.randomBytes(32).toString("base64url");
  const session = { sessionId, username, token, createdAt: Date.now(), connectionId: null, queue: [] };
  sessions.set(sessionId, session);
  res.status(201).json({ sessionId, username, token, createdAt: session.createdAt });
});

app.get("/api/session", (req, res) => {
  const s = getAuthorizedSession(req);
  if (!s) return res.status(401).json({ error: "Session verification failed" });
  res.json({ sessionId: s.sessionId, username: s.username, connected: Boolean(s.connectionId) });
});

app.post("/api/commands", (req, res) => {
  const s = getAuthorizedSession(req);
  if (!s) return res.status(401).json({ error: "Session verification failed" });
  const program = req.body.program;
  if (!Array.isArray(program) || program.length > 100) {
    return res.status(400).json({ error: "Program must be an array of at most 100 commands" });
  }
  const allowed = new Set(["say", "move", "turn", "goto", "setX", "setY", "wait"]);
  for (const cmd of program) {
    if (!cmd || typeof cmd !== "object" || !allowed.has(cmd.type)) {
      return res.status(400).json({ error: "Unsupported or malformed command" });
    }
  }
  const command = { id: crypto.randomUUID(), createdAt: Date.now(), program };
  s.queue.push(command);
  if (s.queue.length > 50) s.queue.shift();
  res.status(202).json({ accepted: true, commandId: command.id });
});

app.get("/api/commands", (req, res) => {
  const s = getAuthorizedSession(req);
  if (!s) return res.status(401).json({ error: "Session verification failed" });
  res.json({ commands: s.queue.splice(0, 10) });
});

wss.on("connection", (ws) => {
  let current = null;
  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return ws.close(1003, "Invalid JSON"); }
    if (msg.type === "hello") {
      const s = sessions.get(msg.sessionId);
      if (!s || !safeEqual(s.username, msg.username) || !safeEqual(s.token, msg.token)) {
        ws.send(JSON.stringify({ type: "auth_error", message: "Session/username verification failed" }));
        return ws.close(1008, "Unauthorized session");
      }
      if (s.connectionId && s.connectionId !== msg.connectionId) {
        const previous = sockets.get(s.connectionId);
        if (previous && previous.readyState === 1) previous.close(4001, "Replaced by a newer connection");
      }
      current = s;
      s.connectionId = msg.connectionId;
      sockets.set(msg.connectionId, ws);
      ws.send(JSON.stringify({ type: "connected", sessionId: s.sessionId, username: s.username, connectionId: s.connectionId }));
    }
  });
  ws.on("close", () => {
    if (current && current.connectionId) {
      sockets.delete(current.connectionId);
      current.connectionId = null;
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`HTTP local server: http://${HOST}:${PORT}`);
  console.log("For remote/public deployment, add HTTPS, persistent storage, real user authentication, and rate limits.");
});

