import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { io } from "socket.io-client";

const port = 3102;
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForHealth() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${base}/healthz`);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await sleep(250);
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

function emit(socket, event, payload, timeout = 5000) {
  return new Promise((resolve, reject) => {
    socket.timeout(timeout).emit(event, payload, (error, response) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
}

function expectOk(result, label) {
  assert(result?.ok, `${label} failed: ${JSON.stringify(result)}`);
}

async function waitUntil(predicate, label, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (predicate()) return;
    await sleep(40);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function watch(socket) {
  const holder = { state: null };
  socket.on("state", (state) => {
    holder.state = state;
  });
  return holder;
}

async function playOneOfUs(admin, players) {
  const done = new Set();
  let guard = 0;

  while (guard < 240) {
    guard += 1;
    const publicState = admin.holder.state?.public;
    const game = publicState?.game;
    assert(game, "One of Us state missing");

    if (
      game.phase !== "results" &&
      game.phase !== "complete" &&
      (game.word !== null || game.imposterId !== null)
    ) {
      throw new Error("Word or imposter leaked before reveal");
    }

    if (game.phase === "complete") return;

    if (game.phase === "results") {
      expectOk(await emit(admin.socket, "admin:nextRound", {}), "nextRound");
      await sleep(120);
      continue;
    }

    if (game.phase === "discuss") {
      expectOk(
        await emit(admin.socket, "admin:gameAction", { type: "startVote" }),
        "startVote",
      );
      await sleep(120);
      continue;
    }

    let acted = false;
    for (const player of players) {
      const mine = player.holder.state?.you?.game;
      if (!mine) continue;
      const key = `${game.round}:${game.phase}:${player.name}`;
      if (done.has(key)) continue;

      if (game.phase === "reveal" && mine.canReady) {
        done.add(key);
        expectOk(
          await emit(player.socket, "game:action", { type: "ready" }),
          "ready",
        );
        acted = true;
      } else if (game.phase === "clues" && mine.canClue) {
        done.add(key);
        expectOk(
          await emit(player.socket, "game:action", {
            type: "clue",
            clue: `Clue from ${player.name}`,
          }),
          "clue",
        );
        acted = true;
      } else if (game.phase === "vote" && mine.canVote) {
        done.add(key);
        const target = publicState.players.find(
          (candidate) => candidate.id !== player.id,
        );
        expectOk(
          await emit(player.socket, "game:action", {
            type: "vote",
            targetId: target.id,
          }),
          "vote",
        );
        acted = true;
      } else if (game.phase === "imposter-guess" && mine.canGuess) {
        done.add(key);
        expectOk(
          await emit(player.socket, "game:action", {
            type: "guess",
            guess: "a definitely wrong answer",
          }),
          "imposter guess",
        );
        acted = true;
      }
    }

    await sleep(acted ? 120 : 200);
  }

  throw new Error("One of Us did not finish in time");
}

try {
  await waitForHealth();

  const catalogResponse = await fetch(`${base}/api/games`);
  const catalog = await catalogResponse.json();
  assert(catalog.ok && catalog.games.length === 7, "Game catalog is not complete");
  assert(
    !catalog.games.some((game) => game.id === "number"),
    "Parked Number prototype must not be in the catalog",
  );

  const login = await fetch(`${base}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passcode }),
  });
  const loginBody = await login.json();
  assert(loginBody.ok && loginBody.token, "Admin login failed");

  const adminSocket = await connect({ role: "admin", token: loginBody.token });
  const admin = { socket: adminSocket, holder: watch(adminSocket) };
  const created = await emit(adminSocket, "admin:createRoom", {});
  expectOk(created, "createRoom");
  const code = created.code;

  const names = ["Aarati", "Bikash", "Chhaya", "Dipesh"];
  const players = [];
  for (const name of names) {
    const socket = await connect({ role: "player" });
    const holder = watch(socket);
    const joined = await emit(socket, "room:join", { code, name });
    expectOk(joined, `join ${name}`);
    players.push({ socket, holder, name, id: joined.playerId });
  }

  await waitUntil(
    () => admin.holder.state?.admin?.connectedCount === 4,
    "four connected players",
  );

  expectOk(
    await emit(adminSocket, "admin:setLocked", { locked: true }),
    "lock room",
  );
  const late = await connect({ role: "player" });
  const lateJoin = await emit(late, "room:join", { code, name: "Late" });
  assert(
    lateJoin.ok === false && lateJoin.code === "room_locked",
    "Locked room accepted a new player",
  );
  expectOk(
    await emit(adminSocket, "admin:setLocked", { locked: false }),
    "unlock room",
  );

  expectOk(
    await emit(adminSocket, "admin:startGame", { gameId: "one-of-us" }),
    "start one-of-us",
  );
  await waitUntil(
    () => admin.holder.state?.public?.game?.id === "one-of-us",
    "one-of-us state",
  );
  await playOneOfUs(admin, players);
  expectOk(await emit(adminSocket, "admin:endGame", {}), "end one-of-us");
  await waitUntil(
    () => admin.holder.state?.public?.phase === "lobby",
    "lobby after one-of-us",
  );

  console.log("games smoke ok");
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
