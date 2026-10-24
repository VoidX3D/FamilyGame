/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { io } from "socket.io-client";

// A free port per run, so a leftover server from an earlier run can never
// be mistaken for this one.
const port = 3100 + Math.floor(Math.random() * 400);
const base = `http://127.0.0.1:${port}`;
const passcode = crypto.randomBytes(12).toString("hex");

const child = spawn(process.execPath, ["server/index.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    NODE_ENV: "test",
    ADMIN_PASSCODE: passcode,
    FRONTEND_ORIGINS: "*",
    // The suite must not depend on whatever the host last saved.
    CONTENT_FILE: ":memory:",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";
child.stdout.on("data", (chunk) => (serverOutput += chunk));
child.stderr.on("data", (chunk) => (serverOutput += chunk));

const sockets = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
  throw new Error(`Server did not become healthy.\n${serverOutput}`);
}

function connect(auth) {
  return new Promise((resolve, reject) => {
    const socket = io(base, {
      auth,
      transports: ["websocket"],
      reconnection: false,
      timeout: 4000,
    });
    sockets.push(socket);
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

function emit(socket, event, payload, timeout = 4000) {
  return new Promise((resolve, reject) => {
    socket.timeout(timeout).emit(event, payload, (error, response) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
}

function waitForState(socket, predicate, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("state", handler);
      reject(new Error("Timed out waiting for state"));
    }, timeout);

    function handler(state) {
      if (!predicate || predicate(state)) {
        clearTimeout(timer);
        socket.off("state", handler);
        resolve(state);
      }
    }

    socket.on("state", handler);
  });
}

function waitForEvent(socket, event, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeout);

    function handler(payload) {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }

    socket.on(event, handler);
  });
}

try {
  await waitForHealth();

  const wrongLogin = await fetch(`${base}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passcode: "wrong" }),
  });
  assert(wrongLogin.status === 401, `Expected 401 for wrong passcode, got ${wrongLogin.status}`);

  const login = await fetch(`${base}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passcode }),
  });
  assert(login.ok, `Admin login failed: ${login.status}`);
  const loginBody = await login.json();
  assert(loginBody.ok && loginBody.token, "Admin login did not return a token");

  const admin = await connect({ role: "admin", token: loginBody.token });
  const adminRoomState = waitForState(admin, (state) => state.admin?.playerCount === 0);
  const created = await emit(admin, "admin:createRoom", {});
  assert(created.ok, `Create room failed: ${JSON.stringify(created)}`);
  const code = created.code;
  assert(/^[A-Z2-9]{5}$/.test(code), `Unexpected room code: ${code}`);
  await adminRoomState;

  const names = ["Aarati", "Bikash", "Chhaya"];
  const players = [];
  const adminThree = waitForState(admin, (state) => state.admin?.connectedCount === 3);
  for (const name of names) {
    const socket = await connect({ role: "player" });
    const statePromise = waitForState(
      socket,
      (state) => state.public?.players?.length === names.indexOf(name) + 1,
    );
    const joined = await emit(socket, "room:join", { code, name });
    assert(joined.ok, `Join failed for ${name}: ${JSON.stringify(joined)}`);
    assert(joined.token, `No token for ${name}`);
    const state = await statePromise;
    assert(state.you?.name === name, `Private state mismatch for ${name}`);
    assert(!("token" in state.you), "Token leaked into player state");
    players.push({ socket, name, token: joined.token, id: joined.playerId });
  }

  assert(new Set(players.map((player) => player.id)).size === 3, "Player IDs are not unique");
  assert(new Set(players.map((player) => player.token)).size === 3, "Player tokens are not unique");

  /* A host closing the tab must not create a second room. A new tab uses the
   * same authenticated session and createRoom restores the server-side room
   * mapping, including the players already seated in it. */
  const replacementAdmin = await connect({ role: "admin", token: loginBody.token });
  const replacementState = waitForState(
    replacementAdmin,
    (state) => state.admin?.playerCount === 3,
  );
  const restored = await emit(replacementAdmin, "admin:createRoom", {});
  assert(
    restored.ok && restored.code === code,
    `Host room was not restored: ${JSON.stringify(restored)}`,
  );
  await replacementState;
  replacementAdmin.disconnect();

  const duplicate = await connect({ role: "player" });
  const duplicateResult = await emit(duplicate, "room:join", { code, name: "Aarati" });
  assert(duplicateResult.ok === false && duplicateResult.code === "name_taken", "Duplicate name was accepted");

  await adminThree;

  const adminTwo = waitForState(admin, (state) => state.admin?.connectedCount === 2);
  players[1].socket.disconnect();
  await adminTwo;

  const reconnected = await connect({ role: "player" });
  const adminThreeAgain = waitForState(admin, (state) => state.admin?.connectedCount === 3);
  const resumed = await emit(reconnected, "room:join", { code, token: players[1].token });
  assert(resumed.ok && resumed.resumed === true, `Resume failed: ${JSON.stringify(resumed)}`);
  await adminThreeAgain;
  players[1].socket = reconnected;

  const removedEvent = waitForEvent(players[2].socket, "room:removed");
  const adminTwoAfterRemove = waitForState(admin, (state) => state.admin?.playerCount === 2);
  const removed = await emit(admin, "admin:removePlayer", { playerId: players[2].id });
  assert(removed.ok, `Remove player failed: ${JSON.stringify(removed)}`);
  await removedEvent;
  await adminTwoAfterRemove;

  const closedEvents = players
    .slice(0, 2)
    .map((player) => waitForEvent(player.socket, "room:closed"));
  const newRoomState = waitForState(admin, (state) => state.admin?.playerCount === 0);
  const reset = await emit(admin, "admin:resetRoom", {});
  assert(reset.ok && reset.code !== code, "Reset did not create a new room");
  await Promise.all(closedEvents);
  await newRoomState;

  console.log("foundation smoke ok");
} catch (error) {
  console.error(error);
  console.error(serverOutput);
  process.exitCode = 1;
} finally {
  for (const socket of sockets) socket.disconnect();
  child.kill();
  await new Promise((resolve) => {
    child.once("exit", resolve);
    setTimeout(resolve, 3000);
  });
}
