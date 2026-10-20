import http from "node:http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";

import {
  cleanupSessions,
  clearLoginAttempts,
  createSession,
  loginAllowed,
  revokeSession,
  sessionCount,
  verifyPasscode,
  verifySession,
} from "./auth.js";
import { config } from "./config.js";
import {
  ContentValidationError,
  contentSnapshot,
  loadContent,
  replaceCollection,
  resetAllCollections,
  resetCollection,
} from "./contentStore.js";
import { GAME_LIST } from "./games/index.js";
import { attachProtocol } from "./protocol.js";
import { RoomStore } from "./rooms.js";

await loadContent();

const app = express();
app.disable("x-powered-by");

// How many proxies sit in front of this process. "1" is correct for a single
// reverse proxy (Wispbyte / Vercel). Set TRUST_PROXY=false when the API is
// exposed directly, so a client cannot spoof its address with
// X-Forwarded-For and slip the IP rate limits.
const trustProxy = String(process.env.TRUST_PROXY ?? "1").trim();
app.set(
  "trust proxy",
  trustProxy === "true"
    ? true
    : trustProxy === "false"
      ? false
      : Number(trustProxy) || 0,
);

app.use(
  cors({
    origin: config.allowedOrigins,
    methods: ["GET", "POST", "PUT"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json({ limit: "256kb" }));
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "no-referrer");
  if (config.nodeEnv === "production") {
    res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

const store = new RoomStore();
const startedAt = Date.now();

function bearerToken(req) {
  const header = req.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim() || null;
}

app.get("/", (req, res) => {
  res.json({ service: "familygame-api", status: "ok", version: "0.1.0" });
});

app.get("/healthz", (req, res) => {
  res.json({
    ok: true,
    service: "familygame-api",
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    rooms: store.size,
    adminSessions: sessionCount(),
    games: GAME_LIST.length,
  });
});

app.get("/api/games", (req, res) => {
  res.json({ ok: true, locale: "en", games: GAME_LIST });
});

app.post("/api/admin/login", (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const gate = loginAllowed(ip);
  if (!gate.ok) {
    res.set("Retry-After", String(Math.ceil(gate.retryAfterMs / 1000)));
    return res.status(429).json({ ok: false, error: "too_many_attempts" });
  }

  const passcode = typeof req.body?.passcode === "string" ? req.body.passcode : "";
  if (!verifyPasscode(passcode)) {
    return res.status(401).json({ ok: false, error: "invalid_passcode" });
  }

  clearLoginAttempts(ip);
  const session = createSession();
  return res.json({ ok: true, token: session.token, expiresAt: session.expiresAt });
});

app.get("/api/admin/me", (req, res) => {
  const token = bearerToken(req);
  const session = verifySession(token);
  if (!session) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  return res.json({ ok: true, expiresAt: session.expiresAt });
});

app.post("/api/admin/logout", (req, res) => {
  const token = bearerToken(req);
  if (token) revokeSession(token);
  return res.json({ ok: true });
});

function requireAdmin(req, res) {
  const token = bearerToken(req);
  if (!token || !verifySession(token)) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return null;
  }
  return token;
}

app.get("/api/admin/content", (req, res) => {
  if (!requireAdmin(req, res)) return;
  return res.json({ ok: true, ...contentSnapshot() });
});

app.put("/api/admin/content/:key", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const items = await replaceCollection(req.params.key, req.body?.items);
    if (!items) {
      return res.status(404).json({ ok: false, error: "collection_not_found" });
    }
    return res.json({ ok: true, key: req.params.key, items, ...contentSnapshot() });
  } catch (error) {
    if (error instanceof ContentValidationError) {
      return res.status(400).json({
        ok: false,
        error: error.code,
        message: error.message,
        errors: error.details,
      });
    }
    console.error("[content] save failed", error);
    return res.status(500).json({ ok: false, error: "content_save_failed" });
  }
});

app.post("/api/admin/content/:key/reset", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const reset = await resetCollection(req.params.key);
  if (!reset) {
    return res.status(404).json({ ok: false, error: "collection_not_found" });
  }
  return res.json({ ok: true, ...contentSnapshot() });
});

app.post("/api/admin/content/reset", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  await resetAllCollections();
  return res.json({ ok: true, ...contentSnapshot() });
});

app.use((req, res) => {
  res.status(404).json({ ok: false, error: "not_found" });
});

app.use((err, req, res, next) => {
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ ok: false, error: "invalid_json" });
  }
  console.error("[http]", err);
  if (res.headersSent) return next(err);
  return res.status(500).json({ ok: false, error: "internal_error" });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: config.allowedOrigins, methods: ["GET", "POST"] },
  transports: ["websocket", "polling"],
  pingInterval: 25000,
  pingTimeout: 20000,
  maxHttpBufferSize: 100_000,
});

attachProtocol(io, store);

setInterval(() => {
  store.cleanup();
  cleanupSessions();
}, 60_000).unref();

server.listen(config.port, config.host, () => {
  console.log(
    `Family Game API listening on http://${config.host}:${config.port} (${config.nodeEnv})`,
  );
  console.log(
    `Allowed frontend origins: ${
      Array.isArray(config.allowedOrigins)
        ? config.allowedOrigins.join(", ")
        : config.allowedOrigins
    }`,
  );

  if (config.generatedPasscode) {
    console.log(
      `[admin] generated passcode: ${config.generatedPasscode} (set ADMIN_PASSCODE to keep it stable)`,
    );
  } else {
    console.log("[admin] passcode configured from ADMIN_PASSCODE");
  }
});

function shutdown(signal) {
  console.log(`[${signal}] shutting down`);
  io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
