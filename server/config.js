import crypto from "node:crypto";

const DEFAULT_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173";
const rawOrigins = process.env.FRONTEND_ORIGINS ?? DEFAULT_ORIGINS;
const allowedOrigins =
  rawOrigins.trim() === "*"
    ? "*"
    : rawOrigins
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);

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

export const config = {
  port: Number(process.env.PORT || process.env.SERVER_PORT || 3000),
  host: process.env.HOST || "0.0.0.0",
  nodeEnv,
  adminPasscode: hasConfiguredPasscode ? configuredPasscode : generatedPasscode,
  generatedPasscode,
  allowedOrigins,
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
