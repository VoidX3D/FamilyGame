/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/* Prints the passcode the server is using for the host console.
 *
 * It comes from server/.env, or from server/data/admin-passcode when the
 * server made one for itself. */

const envFile = path.join("server", ".env");
const generatedFile = path.join("server", "data", "admin-passcode");

function fromEnvFile() {
  try {
    const text = readFileSync(envFile, "utf8");
    const line = text
      .split(/\r?\n/)
      .find((entry) => entry.trim().startsWith("ADMIN_PASSCODE="));
    const value = line
      ?.slice(line.indexOf("=") + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    return value || "";
  } catch {
    return "";
  }
}

function fromGeneratedFile() {
  try {
    return readFileSync(generatedFile, "utf8").trim();
  } catch {
    return "";
  }
}

const passcode = fromEnvFile() || fromGeneratedFile();

if (!passcode) {
  console.error(
    "No passcode yet. Set ADMIN_PASSCODE in server/.env, or start the " +
      "server once so it generates one.",
  );
  process.exit(1);
}

console.log(passcode);
