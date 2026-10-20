import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/* The server is started in different ways: "npm start", "npm run dev", or a
 * plain "node index.js" on the hosting panel. The settings file is read here
 * so it always applies, no matter how the process was started. */
function readEnvFile() {
  const values = {};
  let text;
  try {
    // ENV_FILE points at a different settings file, or at nothing.
    const file = process.env.ENV_FILE ?? path.join(here, ".env");
    if (!file) return values;
    text = fs.readFileSync(file, "utf8");
  } catch {
    return values;
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) continue;

    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
}

const fileValues = readEnvFile();

/* The frontend that may talk to this server. The deployed site is listed
 * here so the server works with no configuration at all; a settings file or
 * an environment variable can add more. */
const DEFAULT_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://funfamilygame.vercel.app",
].join(",");

/* The frontends that may talk to this server.
 *
 * The settings file and the hosting panel are both sources, so the two are
 * merged rather than one replacing the other. A stale value left in the
 * panel can then only ever add an origin, never take the deployed site
 * away. */
const rawOrigins =
  [process.env.FRONTEND_ORIGINS, fileValues.FRONTEND_ORIGINS]
    .filter(Boolean)
    .join(",") || DEFAULT_ORIGINS;

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
  return [
    ...new Set(
      value
        .split(",")
        .map((origin) => normalizeOrigin(origin))
        .filter(Boolean),
    ),
  ];
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

const allowedOrigins = parseOrigins(rawOrigins);

/* A setting comes from the environment first, then from the settings file. */
function setting(key, fallback = "") {
  const value = process.env[key];
  if (value !== undefined && value !== "") return value;
  const fromFile = fileValues[key];
  if (fromFile !== undefined && fromFile !== "") return fromFile;
  return fallback;
}

const nodeEnv = setting("NODE_ENV", "production");
const configuredPasscode = setting("ADMIN_PASSCODE");
const hasConfiguredPasscode = configuredPasscode.trim().length > 0;

if (
  nodeEnv === "production" &&
  hasConfiguredPasscode &&
  Array.from(configuredPasscode).length < 12
) {
  throw new Error(
    "ADMIN_PASSCODE must be at least 12 characters. Remove it to have one generated instead.",
  );
}

/* Without a configured passcode one is generated. It is kept in a file so a
 * restart or a redeploy does not lock the host out of their own console. */
const passcodeFile = path.join(here, "data", "admin-passcode");

function readStoredPasscode() {
  try {
    const value = fs.readFileSync(passcodeFile, "utf8").trim();
    return value.length >= 12 ? value : "";
  } catch {
    return "";
  }
}

function storePasscode(value) {
  try {
    fs.mkdirSync(path.dirname(passcodeFile), { recursive: true });
    fs.writeFileSync(passcodeFile, `${value}\n`, "utf8");
  } catch {
    // A read-only disk only means the passcode changes on the next restart.
  }
}

let generatedPasscode = null;
if (!hasConfiguredPasscode) {
  generatedPasscode = readStoredPasscode();
  if (!generatedPasscode) {
    generatedPasscode = crypto.randomBytes(12).toString("hex").toUpperCase();
    storePasscode(generatedPasscode);
  }
}

const defaultLoginAttempts = 10;

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
  port: Number(setting("PORT") || setting("SERVER_PORT") || 3000),
  host: setting("HOST", "0.0.0.0"),
  nodeEnv,
  adminPasscode: hasConfiguredPasscode ? configuredPasscode : generatedPasscode,
  generatedPasscode,
  passcodeFile,
  allowedOrigins,
  isOriginAllowed,
  maxPlayers: 10,
  minPlayers: 3,
  roomCodeLength: 5,
  adminSessionTtlMs: 12 * 60 * 60 * 1000,
  roomTtlMs: 30 * 60 * 1000,
  loginWindowMs: 10 * 60 * 1000,
  loginAttempts: Number(setting("ADMIN_LOGIN_ATTEMPTS", defaultLoginAttempts)),
  rateLimits: {
    check: Number(setting("RATE_LIMIT_CHECK", 60)),
    join: Number(setting("RATE_LIMIT_JOIN", 30)),
    action: Number(setting("RATE_LIMIT_ACTION", 180)),
    stroke: Number(setting("RATE_LIMIT_STROKE", 900)),
  },
};
