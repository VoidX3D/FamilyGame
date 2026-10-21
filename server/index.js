/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  contentStatus,
  loadContent,
  replaceCollection,
  resetAllCollections,
  resetCollection,
} from "./contentStore.js";
import { GAME_LIST } from "./games/index.js";
import { attachProtocol } from "./protocol.js";
import { RoomStore } from "./rooms.js";
import { docsPage } from "./docsPage.js";
import { openapi } from "./openapi.js";

/* The version comes from the package file, so it is never out of date. */
const packageVersion = (() => {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(path.join(here, "package.json"), "utf8");
    return JSON.parse(raw).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

await loadContent();

const app = express();
app.disable("x-powered-by");

// How many proxies sit in front of this process. "1" is correct for a single
// reverse proxy (Wispbyte / Vercel). Set TRUST_PROXY=false when the API is
// exposed directly, so a client cannot spoof its address with
// X-Forwarded-For and slip the IP rate limits.
app.set(
  "trust proxy",
  config.trustProxy,
);

/* The same rule decides for the REST API and for the Socket.IO handshake,
 * so a browser is never allowed on one and blocked on the other. */
const corsOptions = {
  origin(origin, callback) {
    if (config.isOriginAllowed(origin)) {
      callback(null, true);
      return;
    }
    noteRejectedOrigin(origin);
    callback(null, false);
  },
  methods: ["GET", "POST", "PUT"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

/* A rejected origin is nearly always a wrong FRONTEND_ORIGINS value. The
 * operator should see it in the server log instead of guessing. */
const rejectedOrigins = new Map();
function noteRejectedOrigin(origin) {
  if (!origin) return;
  const key = String(origin).slice(0, 120);
  if (!rejectedOrigins.has(key) && rejectedOrigins.size >= 1000) {
    rejectedOrigins.delete(rejectedOrigins.keys().next().value);
  }
  const seen = rejectedOrigins.get(key) ?? 0;
  rejectedOrigins.set(key, seen + 1);
  if (seen === 0) {
    console.warn(
      `[cors] Refused ${key}. Add it to FRONTEND_ORIGINS on the backend.`,
    );
  }
}

app.use(cors(corsOptions));
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
  res.json({
    service: "familygame-api",
    status: "ok",
    version: packageVersion,
  });
});

app.get("/healthz", (req, res) => {
  const memory = process.memoryUsage();
  res.json({
    ok: true,
    service: "familygame-api",
    version: packageVersion,
    environment: config.nodeEnv,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    startedAt: new Date(startedAt).toISOString(),
    rooms: store.size,
    players: store.playerCount(),
    activePlayers: store.connectedPlayerCount(),
    games: GAME_LIST.length,
    adminSessions: sessionCount(),
    content: contentStatus(),
    allowedOrigins: config.allowedOrigins,
    node: process.version,
    memory: {
      rssMb: Math.round((memory.rss / 1024 / 1024) * 10) / 10,
      heapUsedMb: Math.round((memory.heapUsed / 1024 / 1024) * 10) / 10,
    },
    time: new Date().toISOString(),
  });
});

/* What every open room is doing. It has no secrets in it: only the room
 * code, the phase, how many people are in it and who is connected. */
app.get("/api/rooms", (req, res) => {
  res.json({
    ok: true,
    rooms: store.summary().map((room) => ({
      code: room.code,
      phase: room.phase,
      game: room.game,
      players: room.players,
      connected: room.connected,
      createdAt: room.createdAt,
      lastActivity: room.lastActivity,
      idleSeconds: room.idleSeconds,
    })),
  });
});

/* The API description, in the OpenAPI format a Swagger UI, Postman or a
 * code generator understands. The page on /api/docs reads this same file. */
app.get("/api/openapi.json", (req, res) => {
  res.json(openapi);
});

app.get("/api/docs", (req, res) => {
  res.type("html").send(docsPage);
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
  // The same allowlist as the REST API.
  cors: {
    origin: corsOptions.origin,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  },
  // A browser blocks a response that carries no CORS grant, but a direct
  // WebSocket upgrade is not covered by CORS at all. The handshake is
  // refused here instead.
  allowRequest(req, callback) {
    const origin = req.headers.origin;
    if (config.isOriginAllowed(origin)) {
      callback(null, true);
      return;
    }
    noteRejectedOrigin(origin);
    callback("Not allowed by CORS", false);
  },
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
  console.log(
    `Content file: ${config.contentFile}${
      config.contentFile === ":memory:" ? " (memory only)" : ""}`,
  );

  if (config.generatedPasscode) {
    console.log(
      `[admin] passcode: ${config.generatedPasscode}`,
    );
    console.log(
      `[admin] it is stored in ${config.passcodeFile} and stays the same after a restart. Set ADMIN_PASSCODE in server/.env to choose your own.`,
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
