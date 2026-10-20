import crypto from "node:crypto";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeRoomCode(length = 5) {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += ROOM_CODE_ALPHABET[crypto.randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export function makeToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function normalizeCode(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function normalizeName(value) {
  const name = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const chars = Array.from(name);
  if (chars.length < 1 || chars.length > 16) return null;
  if (chars.some((char) => /[\u0000-\u001F\u007F]/.test(char))) return null;
  return name;
}

export function sameSecret(left, right) {
  const a = crypto.createHash("sha256").update(String(left ?? "")).digest();
  const b = crypto.createHash("sha256").update(String(right ?? "")).digest();
  return crypto.timingSafeEqual(a, b);
}

export function now() {
  return Date.now();
}

export function clientIpFromSocket(socket) {
  return (
    socket.handshake.headers["cf-connecting-ip"] ||
    socket.handshake.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    socket.handshake.address ||
    "unknown"
  );
}
