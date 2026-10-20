import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/* The server is deployed straight from the repository, so it has to come up
 * correctly with no configuration at all. This checks that the default
 * frontend is the real one, that the host passcode is generated, and that
 * the passcode survives a restart. */

const port = 3100 + Math.floor(Math.random() * 300);
const base = `http://127.0.0.1:${port}`;
const deployedFrontend = "https://funfamilygame.vercel.app";
const passcodeFile = path.join("server", "data", "admin-passcode");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function startServer() {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "production",
      // Nothing else: the defaults have to be enough.
      FRONTEND_ORIGINS: undefined,
      ADMIN_PASSCODE: undefined,
      // The repository ships server/.env, so the test runs without it.
      ENV_FILE: path.join("scripts", "no-such-env-file"),
      ADMIN_LOGIN_ATTEMPTS: undefined,
      TRUST_PROXY: undefined,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  return { child, output: () => output };
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${base}/healthz`);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Server did not become healthy.");
}

async function stop(child) {
  child.kill();
  await new Promise((resolve) => {
    if (child.exitCode !== null) resolve();
    else child.once("exit", resolve);
    setTimeout(resolve, 3000);
  });
}

const hadPasscodeFile = existsSync(passcodeFile);
const savedPasscode = hadPasscodeFile ? readFileSync(passcodeFile, "utf8") : "";

try {
  // First start: nothing is configured.
  const first = startServer();
  await waitForHealth();
  assert(
    first.child.exitCode === null && first.output().includes("Family Game API listening"),
    `The test server did not start (exit code ${first.child.exitCode}).
${first.output()}`,
  );

  const log = first.output();
  assert(
    log.includes(deployedFrontend),
    `The startup log does not mention the deployed frontend:\n${log}`,
  );

  const grant = await fetch(`${base}/api/games`, {
    headers: { Origin: deployedFrontend },
  }).then((response) => response.headers.get("access-control-allow-origin"));
  assert(
    grant === deployedFrontend,
    `The deployed frontend was not allowed by default: ${grant}`,
  );

  const passcodeMatch = /\[admin\] passcode: ([A-Z0-9]+)/.exec(log);
  assert(passcodeMatch, `No passcode was printed:\n${log}`);
  const passcode = passcodeMatch[1];
  assert(passcode.length >= 12, `The generated passcode is too short: ${passcode}`);

  assert(
    existsSync(passcodeFile),
    "The passcode was not stored, so a restart would lock the host out",
  );

  // The generated passcode really works.
  const login = await fetch(`${base}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passcode }),
  }).then((response) => response.json());
  assert(login.ok && login.token, `The generated passcode did not work: ${JSON.stringify(login)}`);

  await stop(first.child);

  // Second start: the same passcode must come back.
  const second = startServer();
  await waitForHealth();
  assert(
    second.child.exitCode === null && second.output().includes("Family Game API listening"),
    `The test server did not start again (exit code ${second.child.exitCode}).
${second.output()}`,
  );
  const secondLog = second.output();
  const secondMatch = /\[admin\] passcode: ([A-Z0-9]+)/.exec(secondLog);
  assert(
    secondMatch && secondMatch[1] === passcode,
    `The passcode changed after a restart: ${secondMatch?.[1]}`,
  );
  await stop(second.child);

  console.log("config smoke ok");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  // Put the local passcode file back the way it was.
  if (hadPasscodeFile) writeFileSync(passcodeFile, savedPasscode, "utf8");
  else if (existsSync(passcodeFile)) {
    const { rmSync } = await import("node:fs");
    rmSync(passcodeFile, { force: true });
  }
}
