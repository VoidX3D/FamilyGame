import { spawn } from "node:child_process";

const port = 3100;
const base = `http://127.0.0.1:${port}`;

const child = spawn(process.execPath, ["server/index.js"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port), NODE_ENV: "test" },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
child.stdout.on("data", (chunk) => (output += chunk));
child.stderr.on("data", (chunk) => (output += chunk));

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

try {
  const health = await waitForHealth();
  const healthBody = await health.json();
  if (!healthBody.ok) throw new Error(`Unexpected /healthz: ${JSON.stringify(healthBody)}`);

  const root = await fetch(`${base}/`);
  const rootBody = await root.json();
  if (rootBody.service !== "familygame-api") throw new Error(`Unexpected /: ${JSON.stringify(rootBody)}`);

  const missing = await fetch(`${base}/does-not-exist`);
  if (missing.status !== 404) throw new Error(`Expected 404, got ${missing.status}`);

  console.log(`smoke ok: health=${health.status} root=${root.status} 404=${missing.status}`);
} finally {
  child.kill();
  await new Promise((resolve) => {
    child.once("exit", resolve);
    setTimeout(resolve, 3000);
  });
}
