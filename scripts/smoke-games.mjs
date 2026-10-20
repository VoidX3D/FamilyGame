/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
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

const publicGame = (holder) => holder.state?.public?.game ?? null;
const privateGame = (player) => player.holder.state?.you?.game ?? null;

/* Waits for the game to reach one of the given phases. */
function waitForPhase(admin, phases, label) {
  const wanted = Array.isArray(phases) ? phases : [phases];
  return waitUntil(
    () => {
      const game = publicGame(admin.holder);
      return game && wanted.includes(game.phase);
    },
    `${label} (${wanted.join("/")})`,
  );
}

/* Every player except `exclude` — used to find a valid vote target. */
function otherPlayer(players, excludeId) {
  const other = players.find((player) => player.id !== excludeId);
  assert(other, "No other player available");
  return other;
}

async function playOneOfUs(admin, players) {
  const done = new Set();
  let guard = 0;

  while (guard < 240) {
    guard += 1;
    const game = publicGame(admin.holder);
    assert(game, "One of Us state missing");

    // Nothing about the secret may appear before the reveal.
    if (
      game.phase !== "results" &&
      game.phase !== "complete" &&
      (game.word != null || game.imposterId != null)
    ) {
      throw new Error("Word or imposter leaked before reveal");
    }

    if (game.phase === "complete") return;

    if (game.phase === "results") {
      expectOk(await emit(admin.socket, "admin:nextRound", {}), "nextRound");
      await waitForPhase(admin, ["reveal"], "next one-of-us round");
      continue;
    }

    let acted = false;
    for (const player of players) {
      const mine = privateGame(player);
      if (!mine) continue;
      const key = `${game.round}:${game.hintRound ?? 1}:${game.phase}:${player.name}`;
      if (done.has(key)) continue;

      if (game.phase === "reveal" && mine.canReady) {
        done.add(key);
        expectOk(
          await emit(player.socket, "game:action", { type: "ready" }),
          "ready",
        );
        acted = true;
      } else if (game.phase === "hints" && mine.canNextHint) {
        // The clue is spoken out loud. The screen only hands the turn on.
        done.add(key);
        expectOk(
          await emit(player.socket, "game:action", { type: "nextHint" }),
          "nextHint",
        );
        acted = true;
      } else if (game.phase === "vote" && mine.canVote) {
        done.add(key);
        const target = otherPlayer(players, player.id);
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

    if (acted) {
      await sleep(60);
    } else {
      await sleep(120);
    }
  }

  throw new Error("One of Us did not finish in time");
}

/* The imposter must never see the secret word in their own payload. */
async function assertImposterIsBlind(admin, players) {
  const game = publicGame(admin.holder);
  if (!game || game.phase === "results" || game.phase === "complete") return;

  for (const player of players) {
    const mine = privateGame(player);
    if (!mine?.isImposter) continue;
    assert(
      mine.word == null,
      `Imposter ${player.name} received the secret word before the reveal`,
    );
  }
}

async function playWhoIsIt(admin, players) {
  const done = new Set();
  let guard = 0;

  while (guard < 120) {
    guard += 1;
    const game = publicGame(admin.holder);
    assert(game, "Who Is It state missing");

    if (game.phase === "complete") return;

    if (game.phase === "results") {
      expectOk(await emit(admin.socket, "admin:nextRound", {}), "nextRound");
      await waitForPhase(admin, ["vote"], "next who-is-it round");
      continue;
    }

    let acted = false;
    for (const player of players) {
      const mine = privateGame(player);
      if (!mine) continue;
      const key = `${game.round}:${player.name}`;
      if (done.has(key)) continue;
      if (game.phase !== "vote") continue;

      done.add(key);
      const target = otherPlayer(players, player.id);
      expectOk(
        await emit(player.socket, "game:action", {
          type: "vote",
          targetId: target.id,
        }),
        "who-is-it vote",
      );
      acted = true;
    }

    await sleep(acted ? 60 : 120);
  }

  throw new Error("Who Is It did not finish in time");
}

async function playTurnGuess(admin, players, label) {
  // The guesser never sees the answer. A different player does, so the
  // test can learn it and submit a correct guess.
  const done = new Set();
  const guessedInPass = new Set();
  let guard = 0;

  while (guard < 120) {
    guard += 1;
    const game = publicGame(admin.holder);
    assert(game, `${label} state missing`);

    if (game.phase === "complete") return;

    if (game.phase === "guess") {
      const activeId = game.activePlayerId;
      const active = players.find((player) => player.id === activeId);
      assert(active, `${label}: no active guesser`);

      const helper = players.find(
        (player) => player.id !== activeId && privateGame(player)?.assignment?.name,
      );
      assert(helper, `${label}: nobody else can see the assignment`);

      const answer = privateGame(helper).assignment.name;

      const key = `${game.pass}:${game.turnNumber}`;
      if (!done.has(key)) {
        done.add(key);
        expectOk(
          await emit(active.socket, "game:action", {
            type: "guess",
            guess: answer,
          }),
          `${label} guess`,
        );
        guessedInPass.add(activeId);
      }

      await waitForPhase(admin, ["reveal"], `${label} reveal`);
      expectOk(
        await emit(active.socket, "game:action", { type: "next" }),
        `${label} next turn`,
      );
      await waitForPhase(admin, ["guess", "complete"], `${label} next guesser`);

      // This game has no automatic ending: the host ends it once everyone
      // has had a turn.
      if (guessedInPass.size >= players.length) {
        expectOk(
          await emit(admin.socket, "admin:gameAction", { type: "finish" }),
          `${label} finish`,
        );
        await waitForPhase(admin, ["complete"], `${label} complete`);
      }
      continue;
    }

    if (game.phase === "reveal") {
      // The player did not advance (stale state). The host can.
      expectOk(
        await emit(admin.socket, "admin:gameAction", { type: "nextTurn" }),
        `${label} next turn`,
      );
      await waitForPhase(admin, ["guess", "complete"], `${label} next guesser`);
      continue;
    }

    await sleep(120);
  }

  throw new Error(`${label} did not finish in time`);
}

async function playActItOut(admin, players) {
  const done = new Set();
  let guard = 0;

  while (guard < 120) {
    guard += 1;
    const game = publicGame(admin.holder);
    assert(game, "Act It Out state missing");

    if (game.phase === "complete") return;

    if (game.phase === "act") {
      const actor = players.find(
        (player) => player.id === game.actorId && privateGame(player)?.isActor,
      );

      if (actor) {
        const key = `${game.turnNumber}`;
        if (!done.has(key)) {
          done.add(key);
          const target = otherPlayer(players, actor.id);
          expectOk(
            await emit(actor.socket, "game:action", {
              type: "correct",
              playerId: target.id,
            }),
            "act-it-out correct",
          );
        }
        await waitForPhase(admin, ["results"], "act-it-out result");
        expectOk(
          await emit(actor.socket, "game:action", { type: "next" }),
          "act-it-out next",
        );
        await waitForPhase(admin, ["act", "complete"], "act-it-out next actor");
        continue;
      }
    }

    if (game.phase === "results") {
      // The actor already moved on; this state is stale.
      await waitForPhase(admin, ["act", "complete"], "act-it-out next actor");
      continue;
    }

    await sleep(120);
  }

  throw new Error("Act It Out did not finish in time");
}

async function playTruthOrDare(admin, players) {
  const submitted = new Set();
  const done = new Set();
  let guard = 0;

  while (guard < 160) {
    guard += 1;
    const game = publicGame(admin.holder);
    assert(game, "Truth or Dare state missing");

    if (game.phase === "complete") return;

    if (game.phase === "collect") {
      for (const player of players) {
        if (submitted.has(player.name)) continue;
        const mine = privateGame(player);
        if (!mine?.canSubmit) continue;
        submitted.add(player.name);
        expectOk(
          await emit(player.socket, "game:action", {
            type: "submit",
            truth: `Truth from ${player.name}`,
            dare: `Dare from ${player.name}`,
          }),
          "truth-or-dare submit",
        );
      }
      await waitForPhase(admin, ["play"], "truth-or-dare play");
      continue;
    }

    if (game.phase === "play") {
      const current = players.find(
        (player) => player.id === game.currentPlayerId,
      );
      assert(current, "truth-or-dare: no current player");
      const key = `${game.round}:${game.completedTurns}`;
      if (!done.has(key)) {
        done.add(key);
        expectOk(
          await emit(current.socket, "game:action", { type: "done" }),
          "truth-or-dare done",
        );
      }
      await sleep(60);
      continue;
    }

    await sleep(120);
  }

  throw new Error("Truth or Dare did not finish in time");
}

async function playWhoWroteThat(admin, players) {
  const answered = new Set();
  const guessed = new Set();
  let guard = 0;

  while (guard < 200) {
    guard += 1;
    const game = publicGame(admin.holder);
    assert(game, "Who Wrote That state missing");

    if (game.phase === "complete") return;

    if (game.phase === "results") {
      expectOk(await emit(admin.socket, "admin:nextRound", {}), "nextRound");
      await waitForPhase(admin, ["writing"], "next who-wrote-that round");
      continue;
    }

    if (game.phase === "writing") {
      let sent = 0;
      for (const player of players) {
        const key = `${game.round}:${player.name}`;
        if (answered.has(key)) continue;
        const mine = privateGame(player);
        if (!mine?.canSubmitAnswer) continue;
        answered.add(key);
        sent += 1;
        expectOk(
          await emit(player.socket, "game:action", {
            type: "answer",
            answer: `Answer from ${player.name}`,
          }),
          "who-wrote-that answer",
        );
      }

      const allAnswered = players.every((player) =>
        answered.has(`${game.round}:${player.name}`),
      );
      if (allAnswered) {
        await waitForPhase(admin, ["guessing"], "who-wrote-that guessing");
      } else {
        await sleep(60);
      }
      continue;
    }

    if (game.phase === "guessing") {
      let sent = 0;
      for (const player of players) {
        const key = `${game.round}:${player.name}`;
        if (guessed.has(key)) continue;
        const mine = privateGame(player);
        if (!mine?.canSubmitGuesses) continue;
        guessed.add(key);
        sent += 1;

        // Match every answer to some other player.
        const guesses = {};
        for (const answer of game.answers ?? []) {
          if (answer.id === mine.yourAnswerId) continue;
          guesses[answer.id] = otherPlayer(players, player.id).id;
        }
        expectOk(
          await emit(player.socket, "game:action", { type: "guesses", guesses }),
          "who-wrote-that guesses",
        );
      }
      await sleep(sent ? 60 : 120);
      continue;
    }

    await sleep(120);
  }

  throw new Error("Who Wrote That did not finish in time");
}

/* Waits for a stroke to arrive on any of the given sockets. */
function waitForStroke(sockets, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for a stroke"));
    }, timeout);

    const onStroke = (stroke) => {
      cleanup();
      resolve(stroke);
    };

    function cleanup() {
      clearTimeout(timer);
      for (const socket of sockets) socket.off("draw:stroke", onStroke);
    }

    for (const socket of sockets) socket.on("draw:stroke", onStroke);
  });
}

async function playDrawIt(admin, players) {
  // The host picks the turn length, and the first turn starts.
  expectOk(
    await emit(admin.socket, "admin:gameAction", { type: "time30" }),
    "draw-it setup",
  );
  await waitForPhase(admin, ["drawing"], "draw-it drawing");

  const game = publicGame(admin.holder);
  const drawer = players.find((player) => player.id === game.drawerId);
  assert(drawer, "draw-it: there is no drawer");

  // The word reaches the drawer alone.
  await waitUntil(
    () => privateGame(drawer)?.yourWord?.text,
    "draw-it word for the drawer",
  );
  const word = privateGame(drawer)?.yourWord?.text;
  assert(word, "draw-it: the drawer has no word");
  for (const player of players) {
    if (player.id === drawer.id) continue;
    assert(
      privateGame(player)?.yourWord === null,
      "draw-it: the word reached another player",
    );
  }

  // The drawer draws, and the room receives the stroke.
  const strokeSeen = waitForStroke(players.map((player) => player.socket));
  expectOk(
    await emit(drawer.socket, "draw:stroke", {
      id: "stroke-1",
      points: [
        [0.1, 0.1],
        [0.2, 0.25],
        [0.3, 0.2],
      ],
    }),
    "draw:stroke",
  );
  const stroke = await strokeSeen;
  assert(stroke?.id === "stroke-1", "draw-it: the wrong stroke arrived");

  // The stroke count travels in the state, on a throttle.
  await waitUntil(
    () => publicGame(admin.holder)?.strokeCount === 1,
    "draw-it stroke count",
  );

  // A guesser cannot draw.
  const guesser = otherPlayer(players, drawer.id);
  const refused = await emit(guesser.socket, "draw:stroke", {
    id: "stroke-2",
    points: [
      [0.4, 0.4],
      [0.5, 0.5],
    ],
  });
  assert(!refused?.ok, "draw-it: a guesser was allowed to draw");

  // The room guesses. A wrong guess first, then the right one.
  const wrong = await emit(guesser.socket, "game:action", {
    type: "guess",
    text: "definitely not the word",
  });
  expectOk(wrong, "draw-it wrong guess");
  assert(wrong.correct === false, "draw-it: the wrong guess was accepted");

  const right = await emit(guesser.socket, "game:action", {
    type: "guess",
    text: word,
  });
  expectOk(right, "draw-it right guess");
  assert(right.correct === true, "draw-it: the right guess was refused");

  // Everybody else guesses, and the turn ends on its own.
  for (const player of players) {
    if (player.id === drawer.id) continue;
    if (player.id === guesser.id) continue;
    expectOk(
      await emit(player.socket, "game:action", { type: "guess", text: word }),
      "draw-it guess",
    );
  }
  await waitForPhase(admin, ["reveal"], "draw-it reveal");

  // The word is public once the turn is over.
  assert(
    publicGame(admin.holder)?.word?.text === word,
    "draw-it: the word was not revealed",
  );

  // The host moves on, and the game runs to the end.
  let guard = 0;
  while (publicGame(admin.holder)?.phase !== "complete" && guard < 40) {
    guard += 1;
    const phase = publicGame(admin.holder)?.phase;
    if (phase === "drawing") {
      expectOk(
        await emit(admin.socket, "admin:gameAction", { type: "skipTurn" }),
        "draw-it skip",
      );
    } else if (phase === "reveal") {
      expectOk(
        await emit(admin.socket, "admin:gameAction", { type: "nextTurn" }),
        "draw-it next",
      );
    } else {
      break;
    }
    await sleep(60);
  }
  assert(
    publicGame(admin.holder)?.phase === "complete",
    "draw-it did not finish in time",
  );
}

/* Starts a game, plays it, and returns the room to the lobby. */
async function playGame(admin, players, gameId, play) {  expectOk(await emit(admin.socket, "admin:startGame", { gameId }), `start ${gameId}`);
  await waitUntil(
    () => publicGame(admin.holder)?.id === gameId,
    `${gameId} state`,
  );
  await play(admin, players);
  expectOk(await emit(admin.socket, "admin:endGame", {}), `end ${gameId}`);
  await waitUntil(
    () => admin.holder.state?.public?.phase === "lobby",
    `lobby after ${gameId}`,
  );
}

try {
  await waitForHealth();
  assert(
    child.exitCode === null,
    `The test server exited early (code ${child.exitCode}).\n${serverOutput}`,
  );

  const catalogResponse = await fetch(`${base}/api/games`);
  const catalog = await catalogResponse.json();
  assert(catalog.ok && catalog.games.length >= 7, "Game catalog is not complete");
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
  assert(/^[A-Z2-9]{5}$/.test(code), `createRoom returned no usable code: ${code}`);

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

  // One of Us, with the privacy check for the imposter.
  expectOk(
    await emit(adminSocket, "admin:startGame", { gameId: "one-of-us" }),
    "start one-of-us",
  );
  await waitUntil(
    () => publicGame(admin.holder)?.id === "one-of-us",
    "one-of-us state",
  );
  await playOneOfUs(admin, players);

  expectOk(await emit(adminSocket, "admin:endGame", {}), "end one-of-us");
  await waitUntil(
    () => admin.holder.state?.public?.phase === "lobby",
    "lobby after one-of-us",
  );

  // The remaining games, each played over the real socket.
  await playGame(admin, players, "who-is-it", playWhoIsIt);
  await playGame(admin, players, "draw-it", playDrawIt);
  await playGame(admin, players, "who-am-i", (a, p) => playTurnGuess(a, p, "who-am-i"));
  await playGame(admin, players, "where-am-i", (a, p) => playTurnGuess(a, p, "where-am-i"));
  await playGame(admin, players, "act-it-out", playActItOut);
  await playGame(admin, players, "truth-or-dare", playTruthOrDare);
  await playGame(admin, players, "who-wrote-that", playWhoWroteThat);

  // Leave the room clean so the next run starts from nothing.
  expectOk(await emit(adminSocket, "admin:resetRoom", {}), "resetRoom");

  console.log("games smoke ok");
} catch (error) {
  console.error(error);
  console.error(serverOutput);
  process.exitCode = 1;
} finally {
  for (const socket of sockets) socket.disconnect();
  child.kill();
  await new Promise((resolve) => {
    if (child.exitCode !== null) resolve();
    else child.once("exit", resolve);
    setTimeout(resolve, 3000);
  });
}
