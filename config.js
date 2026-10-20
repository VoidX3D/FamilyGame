import crypto from "node:crypto";

const DEFAULT_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173";

/* An origin is a scheme + host, with no path, no trailing slash and no
 * capital letters. Comparing the normalised form means
 * "https://Site.com/" and "https://site.com" are the same origin. */
function normalizeOrigin(value) {
  return String(value ?? "")
    .trim()
    .replace(/\/+$/, "")
    .toLowerCase();
}

function parseOrigins(raw) {
  const value = String(raw ?? "").trim();
  if (value === "*") return ["*"];
  return value
    .split(",")
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);
}

/* A pattern may use a single "*" in the host part, for example
 * "https://*.vercel.app", so a project keeps working when its domain or a
 * preview domain changes. */
function matchesPattern(pattern, origin) {
  if (pattern === origin) return true;
  if (!pattern.includes("*")) return false;

  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^.]+");
  return new RegExp(`^${escaped}$`).test(origin);
}

const allowedOrigins = parseOrigins(
  process.env.FRONTEND_ORIGINS ?? DEFAULT_ORIGINS,
);

const nodeEnv = process.env.NODE_ENV || "development";
const configuredPasscode = process.env.ADMIN_PASSCODE ?? "";
const hasConfiguredPasscode = configuredPasscode.trim().length > 0;

if (nodeEnv === "production" && !hasConfiguredPasscode) {
  throw new Error("ADMIN_PASSCODE is required when NODE_ENV=production.");
}

if (
  nodeEnv === "production" &&
  Array.from(configuredPasscode).length < 12
) {
  throw new Error("ADMIN_PASSCODE must be at least 12 characters in production.");
}

const generatedPasscode = hasConfiguredPasscode
  ? null
  : crypto.randomBytes(8).toString("hex").toUpperCase();

const defaultLoginAttempts = nodeEnv === "production" ? 5 : 50;

/* One decision for both the REST API and the Socket.IO handshake, so the two
 * can never disagree about which site is allowed to talk to the server. */
function isOriginAllowed(origin) {
  // A request without an Origin header is not a browser (curl, a health
  // check, a server-to-server call). There is nothing to protect against.
  if (!origin) return true;

  const value = normalizeOrigin(origin);
  if (allowedOrigins.includes("*")) return true;
  return allowedOrigins.some((pattern) => matchesPattern(pattern, value));
}

export const config = {
  port: Number(process.env.PORT || process.env.SERVER_PORT || 3000),
  host: process.env.HOST || "0.0.0.0",
  nodeEnv,
  adminPasscode: hasConfiguredPasscode ? configuredPasscode : generatedPasscode,
  generatedPasscode,
  allowedOrigins,
  isOriginAllowed,
  maxPlayers: 10,
  minPlayers: 3,
  roomCodeLength: 5,
  adminSessionTtlMs: 12 * 60 * 60 * 1000,
  roomTtlMs: 30 * 60 * 1000,
  loginWindowMs: 10 * 60 * 1000,
  loginAttempts: Number(
    process.env.ADMIN_LOGIN_ATTEMPTS || defaultLoginAttempts,
  ),
};
