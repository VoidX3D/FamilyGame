/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
import { spawn } from "node:child_process";
import { FRONTEND_ORIGINS } from "../web/endpoints.js";

/* Checks that the server only answers the frontend it was configured for.
 * A wrong FRONTEND_ORIGINS value makes the browser block every request from
 * the site, which is very hard to diagnose from the browser alone. */

const port = 3100 + Math.floor(Math.random() * 300);
const base = `http://127.0.0.1:${port}`;
const allowed = FRONTEND_ORIGINS[FRONTEND_ORIGINS.length - 1];
const pattern = "https://*.vercel.app";

const child = spawn(process.execPath, ["server/index.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    NODE_ENV: "test",
    ADMIN_PASSCODE: "test-passcode-for-cors",
    FRONTEND_ORIGINS: `${allowed},${pattern}`,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
child.stdout.on("data", (chunk) => (output += chunk));
child.stderr.on("data", (chunk) => (output += chunk));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/* The server carries its own list of allowed frontends, because the
 * `backend` branch is a split of `server/` alone and cannot reach
 * web/endpoints.js. This checks that the two lists still agree, because
 * a front end the server does not allow is a site that silently fails to
 * talk to its own API. */
async function checkOriginListsAgree() {
  const { config } = await import("../server/config.js");
  const serverOrigins = config.allowedOrigins.map((origin) =>
    String(origin).replace(/\/+$/, ""),
  );
  for (const origin of FRONTEND_ORIGINS) {
    assert(
      serverOrigins.includes(origin),
      `The server does not allow ${origin}. web/endpoints.js and server/config.js have drifted apart.`,
    );
  }
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${base}/healthz`);
      if (response.ok) return response;
    } catch {
      // server not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Server did not become healthy.\n${output}`);
}

function grantFor(origin) {
  return fetch(`${base}/api/games`, { headers: { Origin: origin } }).then(
    (response) => response.headers.get("access-control-allow-origin"),
  );
}

try {
  await checkOriginListsAgree();
  await waitForHealth();
  // The port is random, but a server left over from an earlier run could
  // still be listening on it. Make sure this is our own server.
  assert(
    child.exitCode === null && output.includes("Family Game API listening"),
    `The test server did not start (exit code ${child.exitCode}).
${output}`,
  );

  assert(
    (await grantFor(allowed)) === allowed,
    `The configured origin was not allowed: ${await grantFor(allowed)}`,
  );

  const wildcard = "https://familygame-abc123.vercel.app";
  assert(
    (await grantFor(wildcard)) === wildcard,
    `The wildcard pattern did not match ${wildcard}`,
  );

  assert(
    (await grantFor("https://evil.example.com")) === null,
    "An origin that was not configured was allowed",
  );

  // A request without an Origin header is not a browser and is always fine.
  const plain = await fetch(`${base}/api/games`);
  assert(plain.ok, "A request without an Origin header was refused");

  // The Socket.IO handshake refuses an origin that is not configured, so a
  // direct WebSocket upgrade cannot slip past the browser's CORS check.
  const handshake = await fetch(
    `${base}/socket.io/?EIO=4&transport=polling`,
    { headers: { Origin: "https://evil.example.com" } },
  );
  assert(
    handshake.status === 403,
    `The Socket.IO handshake allowed an unknown origin (status ${handshake.status})`,
  );

  const goodHandshake = await fetch(
    `${base}/socket.io/?EIO=4&transport=polling`,
    { headers: { Origin: allowed } },
  );
  assert(
    goodHandshake.ok,
    `The Socket.IO handshake refused the configured origin (status ${goodHandshake.status})`,
  );

  console.log("cors smoke ok");
} catch (error) {
  console.error(error);
  console.error(output);
  process.exitCode = 1;
} finally {
  child.kill();
  await new Promise((resolve) => {
    if (child.exitCode !== null) resolve();
    else child.once("exit", resolve);
    setTimeout(resolve, 3000);
  });
}
