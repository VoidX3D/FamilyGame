/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
import { config } from "./config.js";
import { createRateLimiter } from "./rateLimit.js";
import { makeToken, now, sameSecret } from "./util.js";

const sessions = new Map();
const loginLimiter = createRateLimiter({
  limit: config.loginAttempts,
  windowMs: config.loginWindowMs,
});

export function verifyPasscode(input) {
  return sameSecret(input, config.adminPasscode);
}

export function loginAllowed(ip) {
  return loginLimiter(ip);
}

export function clearLoginAttempts(ip) {
  loginLimiter.reset(ip);
}

export function createSession() {
  const token = makeToken(32);
  const createdAt = now();
  const expiresAt = createdAt + config.adminSessionTtlMs;
  sessions.set(token, { createdAt, expiresAt });
  return { token, expiresAt };
}

export function verifySession(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

export function revokeSession(token) {
  sessions.delete(token);
}

export function cleanupSessions() {
  const time = now();
  for (const [token, session] of sessions) {
    if (session.expiresAt <= time) sessions.delete(token);
  }
}

export function sessionCount() {
  return sessions.size;
}
