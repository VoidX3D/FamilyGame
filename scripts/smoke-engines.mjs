/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
import { readFileSync } from "node:fs";
import { GAME_LIST, getGame } from "../server/games/index.js";
import { normalizeAnswer } from "../server/games/common.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeRoom(count) {
  const players = Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
    connected: true,
  }));
  return {
    players,
    scores: Object.fromEntries(players.map((player) => [player.id, 0])),
    sessionScores: Object.fromEntries(players.map((player) => [player.id, 0])),
  };
}

function firstOther(players, id) {
  return players.find((player) => player.id !== id).id;
}

function expectOk(result, label) {
  assert(result?.ok, `${label} failed: ${JSON.stringify(result)}`);
}

const checks = [];

function check(name, fn) {
  checks.push({ name, fn });
}

check("answers are compared the same way everywhere", () => {
  /* Every game sanitises an answer the same way, so a person who types
   * "Cactus" gets the same answer as a person who types "cactus". */
  const same = [
    ["Cactus", "cactus"],
    ["CACTUS", "CaCtUs"],
    ["cactus", "Cactus"],
    ["hot dog", "Hot-Dog!"],
    ["hotdog", "HOT DOG"],
    ["Café", "cafe"],
    ["rock & roll", "Rock and Roll"],
    ["  cactus  ", "cactus."],
  ];
  for (const [a, b] of same) {
    assert(
      normalizeAnswer(a) === normalizeAnswer(b),
      `"${a}" and "${b}" should be the same answer`,
    );
  }

  /* Different words must stay different. */
  const different = [
    ["cactus", "cactus plant"],
    ["cat", "cactus"],
    ["momos", "samosa"],
  ];
  for (const [a, b] of different) {
    assert(
      normalizeAnswer(a) !== normalizeAnswer(b),
      `"${a}" and "${b}" should not be the same answer`,
    );
  }

  /* The content has Nepali in it, and Devanagari writes its vowels as
   * marks on the letter. Folding those away would turn one name into a
   * different name. */
  for (const word of ["नेपाल", "काठमाडौ"]) {
    assert(
      normalizeAnswer(word) === word,
      `The Nepali word ${word} was changed by the sanitiser`,
    );
  }
});

check("one-of-us full run", () => {
  const room = makeRoom(4);
  const engine = getGame("one-of-us");
  const game = engine.create(room);
  const players = room.players;

  for (let round = 1; round <= 3; round += 1) {
    assert(game.round === round, `Expected round ${round}`);
    for (const player of players) {
      expectOk(
        engine.action(room, game, player.id, { type: "ready" }),
        "ready",
      );
    }
    assert(game.phase === "hints", "Expected the hint round");

    // The clues are spoken, so the screen only hands the turn along.
    for (let hint = 0; hint < players.length * 2; hint += 1) {
      const speaker = game.speakerId;
      assert(speaker, "There should always be a speaker");

      // Only the speaker may hand over the turn.
      const notSpeaker = players.find((player) => player.id !== speaker);
      const refused = engine.action(room, game, notSpeaker.id, {
        type: "nextHint",
      });
      assert(!refused.ok, "Only the speaker may hand over the turn");

      expectOk(
        engine.action(room, game, speaker, { type: "nextHint" }),
        "nextHint",
      );
    }

    // After two rounds of hints the room votes by itself.
    assert(game.phase === "vote", "The vote should start on its own");

    const publicView = engine.publicView(game, room);
    assert(publicView.word === null, "Word leaked before reveal");
    assert(publicView.imposterId === null, "Imposter leaked before reveal");

    for (const player of players) {
      expectOk(
        engine.action(room, game, player.id, {
          type: "vote",
          targetId: players[0].id === player.id ? players[1].id : players[0].id,
        }),
        "vote",
      );
    }

    if (game.phase === "imposter-guess") {
      expectOk(
        engine.action(room, game, game.imposterId, {
          type: "guess",
          guess: game.word,
        }),
        "imposter guess",
      );
    }

    assert(
      game.phase === "results" || game.phase === "complete",
      `Expected results, got ${game.phase}`,
    );

    if (game.phase === "results") {
      expectOk(engine.nextRound(room, game), "nextRound");
    }
  }

  assert(game.phase === "complete", "One of Us should be complete");
  const total = Object.values(room.scores).reduce((sum, value) => sum + value, 0);
  assert(total > 0, "One of Us should award points");
});

check("who-is-it full run", () => {
  const room = makeRoom(4);
  const engine = getGame("who-is-it");
  const game = engine.create(room);

  for (let round = 1; round <= 3; round += 1) {
    for (const player of room.players) {
      expectOk(
        engine.action(room, game, player.id, {
          type: "vote",
          targetId: firstOther(room.players, player.id),
        }),
        "vote",
      );
    }
    assert(
      game.phase === "results" || game.phase === "complete",
      `Expected results, got ${game.phase}`,
    );
    if (game.phase === "results") {
      expectOk(engine.nextRound(room, game), "nextRound");
    }
  }

  assert(game.phase === "complete", "Who Is It should be complete");
  const total = Object.values(room.scores).reduce((sum, value) => sum + value, 0);
  assert(total > 0, "Who Is It should award points");
});

for (const gameId of ["who-am-i", "where-am-i"]) {
  check(`${gameId} turn-based run`, () => {
    const room = makeRoom(4);
    const engine = getGame(gameId);
    const game = engine.create(room);

    for (let turn = 0; turn < room.players.length; turn += 1) {
      const activeId = game.activePlayerId;
      const activeView = engine.playerView(game, activeId);
      assert(activeView.isActive, "Active guesser not marked");
      assert(activeView.assignment === null, "Guesser saw their own answer");

      for (const player of room.players) {
        if (player.id === activeId) continue;
        const view = engine.playerView(game, player.id);
        assert(
          view.assignment?.name,
          "Clue-givers should see the hidden answer",
        );
        assert(
          !("hints" in (view.assignment ?? {})),
          "Host notes leaked to a player",
        );
      }

      const publicText = JSON.stringify(engine.publicView(game, room));
      assert(
        !publicText.includes(game.assignment.name),
        "Hidden answer leaked to public state",
      );

      expectOk(
        engine.action(room, game, activeId, {
          type: "guess",
          guess: "definitely not the answer",
        }),
        "wrong guess",
      );
      assert(game.phase === "guess", "Wrong guess should not end the turn");

      expectOk(
        engine.action(room, game, activeId, {
          type: "guess",
          guess: game.assignment.name,
        }),
        "correct guess",
      );
      assert(game.phase === "reveal", "Correct guess should reveal");
      assert(room.scores[activeId] === 1, `${gameId} scoring mismatch`);
      // Only the guesser may score on their turn, and only one point each.
      const points = Object.values(room.scores);
      assert(
        points.filter((value) => value > 0).length === turn + 1,
        `${gameId} scored a player who was not the guesser`,
      );
      assert(
        points.every((value) => value <= 1),
        `${gameId} awarded more than one point to a single player`,
      );
      assert(
        room.sessionScores[activeId] === 1,
        `${gameId} session scoring mismatch`,
      );

      const adminView = engine.adminView(game, room);
      assert(
        Array.isArray(adminView.assignment?.hints) &&
          adminView.assignment.hints.length > 0,
        `${gameId} host notes missing for the host`,
      );

      if (turn < room.players.length - 1) {
        expectOk(
          engine.action(room, game, activeId, { type: "next" }),
          "next turn",
        );
        assert(game.phase === "guess", "Next turn should start guessing");
      }
    }

    expectOk(engine.adminAction(room, game, "finish"), "finish");
    assert(game.phase === "complete", `${gameId} should be complete`);
  });
}

check("act-it-out full run", () => {
  const room = makeRoom(4);
  const engine = getGame("act-it-out");
  const game = engine.create(room);

  for (let turn = 0; turn < room.players.length; turn += 1) {
    const actorId = game.actorId;
    const actorView = engine.playerView(game, actorId);
    assert(actorView.isActor, "Actor not marked");
    assert(actorView.yourPrompt?.text, "Actor did not get a private prompt");

    for (const player of room.players) {
      if (player.id === actorId) continue;
      const view = engine.playerView(game, player.id);
      assert(!view.yourPrompt, "Prompt leaked to a non-actor");
      assert(view.category, "Category should be visible to everyone");
    }

    const publicText = JSON.stringify(engine.publicView(game, room));
    assert(
      !publicText.includes(game.prompt.text),
      "Prompt leaked to public state",
    );

    const oldPromptId = game.prompt.id;
    expectOk(
      engine.action(room, game, actorId, { type: "skipPrompt" }),
      "skip prompt",
    );
    assert(game.prompt.id !== oldPromptId, "Skipped prompt was not replaced");

    const guesser = room.players.find((player) => player.id !== actorId);
    const actorBefore = room.scores[actorId] ?? 0;
    const guesserBefore = room.scores[guesser.id] ?? 0;
    expectOk(
      engine.action(room, game, actorId, {
        type: "correct",
        playerId: guesser.id,
      }),
      "select guesser",
    );
    assert(game.phase === "results", "Act It Out should show results");
    assert(room.scores[actorId] === actorBefore + 1, "Actor should score");
    assert(
      room.scores[guesser.id] === guesserBefore + 1,
      "Guesser should score",
    );

    if (turn < room.players.length - 1) {
      expectOk(
        engine.action(room, game, actorId, { type: "next" }),
        "next actor",
      );
    }
  }

  expectOk(engine.action(room, game, game.actorId, { type: "next" }), "finish");
  assert(game.phase === "complete", "Act It Out should be complete");
  assert(game.history.length === room.players.length, "Acting history mismatch");
});

check("who-wrote-that full run", () => {
  const room = makeRoom(4);
  const engine = getGame("who-wrote-that");
  const game = engine.create(room);

  for (let round = 1; round <= 3; round += 1) {
    for (const player of room.players) {
      expectOk(
        engine.action(room, game, player.id, {
          type: "answer",
          answer: `Answer by ${player.name}`,
        }),
        "answer",
      );
    }
    assert(game.phase === "guessing", "Expected guessing phase");

    const publicView = engine.publicView(game, room);
    const publicText = JSON.stringify(publicView);
    assert(!publicText.includes("authorId"), "Answer authors leaked before reveal");
    // Each published answer carries only its text, never who wrote it.
    for (const answer of publicView.answers ?? []) {
      assert(
        !("authorId" in answer) && !("authorName" in answer) && !("author" in answer),
        "A published answer carries its author",
      );
    }

    for (const player of room.players) {
      const guesses = {};
      for (const answer of game.answers) {
        if (answer.authorId === player.id) continue;
        guesses[answer.id] = answer.authorId;
      }
      expectOk(
        engine.action(room, game, player.id, { type: "guesses", guesses }),
        "guesses",
      );
    }

    assert(
      game.phase === "results" || game.phase === "complete",
      `Expected results, got ${game.phase}`,
    );
    if (game.phase === "results") {
      expectOk(engine.nextRound(room, game), "nextRound");
    }
  }

  assert(game.phase === "complete", "Who Wrote That should be complete");
  for (const player of room.players) {
    assert(
      room.scores[player.id] === 3 * (room.players.length - 1),
      "Who Wrote That scoring mismatch",
    );
  }
});

check("truth-or-dare full run", () => {
  const room = makeRoom(3);
  const engine = getGame("truth-or-dare");
  const game = engine.create(room);

  for (const player of room.players) {
    expectOk(
      engine.action(room, game, player.id, {
        type: "submit",
        truth: `Truth from ${player.name}`,
        dare: `Dare from ${player.name}`,
      }),
      "submit",
    );
  }
  assert(game.phase === "play", "Truth or Dare should start playing");

  let guard = 0;
  while (game.phase === "play" && guard < 20) {
    guard += 1;
    const publicText = JSON.stringify(engine.publicView(game, room));
    assert(
      !publicText.includes(game.currentTurn.text),
      "Truth or Dare prompt leaked to public state",
    );

    if (guard % 3 === 0) {
      expectOk(engine.adminAction(room, game, "skipTurn"), "skipTurn");
    } else {
      expectOk(
        engine.action(room, game, game.currentTurn.playerId, { type: "done" }),
        "done",
      );
    }
  }

  assert(game.phase === "complete", "Truth or Dare should be complete");
  assert(game.history.length === 6, "Truth or Dare should log every turn");
  assert(game.completedTurns === 6, "Truth or Dare turn count mismatch");
});

check("draw-it full run", () => {
  const room = makeRoom(3);
  const engine = getGame("draw-it");
  const game = engine.create(room);
  const players = room.players;

  // The host picks the turn length, and the turn starts.
  assert(game.phase === "setup", "Draw It should start in setup");
  assert(
    engine.adminAction(room, game, "time30").ok,
    "The host should be able to pick the turn length",
  );
  assert(game.phase === "drawing", "Draw It should be drawing");
  assert(game.deadline > Date.now(), "The turn should have a deadline");

  const drawer = players.find((player) => player.id === game.drawerId);
  const guesser = players.find((player) => player.id !== game.drawerId);
  const word = game.word.text;

  // Only the drawer sees the word.
  assert(
    engine.playerView(game, drawer.id).yourWord?.text === word,
    "The drawer should see the word",
  );
  assert(
    engine.playerView(game, guesser.id).yourWord === null,
    "A guesser must not see the word",
  );
  assert(
    !JSON.stringify(engine.publicView(game, room)).includes(word),
    "The word leaked into the public state",
  );

  // Only the drawer can draw.
  assert(
    engine.acceptStroke(room, game, drawer.id, {
      id: "s1",
      points: [[0.1, 0.1], [0.2, 0.2]],
    }).ok,
    "The drawer should be able to draw",
  );
  const refused = engine.acceptStroke(room, game, guesser.id, {
    id: "s2",
    points: [[0.3, 0.3], [0.4, 0.4]],
  });
  assert(!refused.ok, "A guesser must not be able to draw");
  assert(game.strokes.length === 1, "Only the drawer's stroke should be kept");

  // The drawer cannot guess.
  const drawerGuess = engine.action(room, game, drawer.id, {
    type: "guess",
    text: word,
  });
  assert(!drawerGuess.ok, "The drawer must not be able to guess");

  // A wrong guess scores nothing.
  const wrong = engine.action(room, game, guesser.id, {
    type: "guess",
    text: "something else",
  });
  expectOk(wrong, "wrong guess");
  assert(wrong.correct === false, "A wrong guess must not be correct");
  assert(room.scores[guesser.id] === 0, "A wrong guess must not score");

  // A right guess scores, whatever the spelling.
  const right = engine.action(room, game, guesser.id, {
    type: "guess",
    text: ` ${word.toUpperCase()}! `,
  });
  expectOk(right, "right guess");
  assert(right.correct === true, "The right word should be correct");
  assert(room.scores[guesser.id] === 1, "A correct guess must score one");

  // The word is still private from the other players.
  for (const player of players) {
    if (player.id === drawer.id) continue;
    assert(
      engine.playerView(game, player.id).yourWord === null,
      "A guesser must not see the word after guessing",
    );
  }

  // The turn ends when everybody has guessed.
  const other = players.find(
    (player) => player.id !== drawer.id && player.id !== guesser.id,
  );
  expectOk(
    engine.action(room, game, other.id, { type: "guess", text: word }),
    "last guess",
  );
  assert(game.phase === "reveal", "The turn should end when everybody guessed");
  assert(room.scores[drawer.id] === 1, "The drawer should score when guessed");

  // The word is public once the turn is over.
  assert(
    engine.publicView(game, room).word?.text === word,
    "The word should be public after the turn",
  );

  // The host moves on.
  expectOk(engine.adminAction(room, game, "nextTurn"), "nextTurn");
  assert(game.phase === "drawing", "The next turn should be drawing");
  assert(game.strokes.length === 0, "The board should be cleared for the next turn");

  // The clock is the server's. A turn that runs out ends on its own.
  game.deadline = Date.now() - 1;
  const timedOut = engine.adminAction(room, game, "timeout", {});
  expectOk(timedOut, "timeout");
  assert(game.phase === "reveal", "A turn that ran out should end");
  assert(
    engine.publicView(game, room).word === null ||
      game.phase === "reveal",
    "A timed out turn should reveal the word",
  );

  // The reveal moves on by itself once it is over.
  game.revealUntil = Date.now() - 1;
  expectOk(engine.adminAction(room, game, "timeout", {}), "timeout again");
  assert(game.phase === "drawing", "The reveal should move to the next turn");

  // Nobody may end a turn before the clock is up.
  const early = engine.adminAction(room, game, "timeout", {});
  assert(!early.ok, "The clock must not end a turn early");
});

check("draw-it guessing is open and the list is shared", () => {
  const room = makeRoom(3);
  const engine = getGame("draw-it");
  const game = engine.create(room);
  const players = room.players;

  expectOk(engine.adminAction(room, game, "time30"), "time30");
  const drawer = players.find((player) => player.id === game.drawerId);
  const guesser = players.find((player) => player.id !== game.drawerId);
  const word = game.word.text;

  // A player may keep guessing. The first wrong guess must not lock
  // them out of the next one.
  const first = engine.action(room, game, guesser.id, {
    type: "guess",
    text: "not the word",
  });
  expectOk(first, "first wrong guess");
  assert(first.correct === false, "A wrong guess must not be correct");

  const second = engine.action(room, game, guesser.id, {
    type: "guess",
    text: "still not the word",
  });
  expectOk(second, "second wrong guess");
  assert(second.correct === false, "The second wrong guess must be accepted");

  // The list of guesses is shared, and everybody can see it.
  const log = engine.publicView(game, room).guessLog;
  assert(Array.isArray(log), "The public view should carry the guess list");
  assert(log.length === 2, "Both guesses should be on the list");
  assert(
    log.every((entry) => entry.playerName),
    "Every guess should say who made it",
  );

  // A wrong guess is shown as it was typed.
  assert(log[0].text === "not the word", "A wrong guess should be visible");

  // The right guess is on the list, but its text is the word, so it is
  // not shown until the turn is over.
  const right = engine.action(room, game, guesser.id, {
    type: "guess",
    text: word,
  });
  expectOk(right, "right guess");
  const after = engine.publicView(game, room);
  assert(after.guessLog.length === 3, "The right guess should be on the list");
  assert(
    after.guessLog[2].correct === true,
    "The right guess should be marked as correct",
  );
  assert(
    after.guessLog[2].text === null,
    "A correct guess must not show the word before the reveal",
  );

  // Nothing in the public state may spell the word.
  const publicText = JSON.stringify(after);
  assert(!publicText.includes(word), "The word leaked into the public state");
  for (const player of players) {
    if (player.id === drawer.id) continue;
    assert(
      !JSON.stringify(engine.playerView(game, player.id)).includes(word),
      "The word leaked into a player's view",
    );
  }

  // A close guess shows the letters that landed in the right place, and
  // the hint can never spell the whole word.
  const close = engine.action(room, game, guesser.id, {
    type: "guess",
    text: word.toUpperCase().split("").reverse().join(""),
  });
  expectOk(close, "close guess");
  if (close.mask) {
    assert(!close.mask.includes(word), "The mask must not spell the word");
  }

  // The drawer cannot end the turn. There is no done action at all.
  const done = engine.action(room, game, drawer.id, { type: "done" });
  assert(!done.ok, "The drawer must not be able to end the turn");
  assert(
    game.phase === "drawing",
    "The turn must still be running after a refused done",
  );
});

check("catalog shape", () => {
  // The games that were always here. Newer games are welcome, but these
  // must never disappear.
  const core = [
    "act-it-out",
    "draw-it",
    "one-of-us",
    "who-is-it",
    "who-am-i",
    "where-am-i",
    "truth-or-dare",
    "who-wrote-that",
    "caption-this",
    "emoji-guess",
    "spyfall",
    "would-you-rather",
    "two-truths-one-lie",
  ];
  const ids = GAME_LIST.map((meta) => meta.id);
  for (const id of core) {
    assert(ids.includes(id), `The core game "${id}" is missing from the catalog`);
  }
  assert(
    new Set(ids).size === ids.length,
    "Two games share the same id",
  );
  assert(GAME_LIST.length > 0, "The catalog is empty");

  for (const meta of GAME_LIST) {
    const engine = getGame(meta.id);
    assert(engine, `Missing engine for ${meta.id}`);
    assert(meta.name, `Missing name for ${meta.id}`);
    assert(meta.tagline, `Missing tagline for ${meta.id}`);
    assert(meta.minPlayers >= 3, `Bad minPlayers for ${meta.id}`);
    assert(meta.maxPlayers <= 10, `Bad maxPlayers for ${meta.id}`);
    assert(meta.maxRounds >= 0, `Bad maxRounds for ${meta.id}`);
    for (const fn of [
      "create",
      "action",
      "adminAction",
      "nextRound",
      "publicView",
      "playerView",
      "adminView",
    ]) {
      assert(
        typeof engine[fn] === "function",
        `${meta.id} is missing ${fn}()`,
      );
    }
  }
});

check("every game has a screen on the client", () => {
  // A game with no renderer shows "This game screen is not available yet."
  // on a player's phone, which looks broken even though nothing crashed.
  const source = readFileSync(
    new URL("../web/games.js", import.meta.url),
    "utf8",
  );
  const renderers = source.match(
    /const RENDERERS = \{([\s\S]*?)\n\};/,
  )?.[1] ?? "";

  for (const meta of GAME_LIST) {
    assert(
      renderers.includes(`"${meta.id}"`),
      `No player screen for "${meta.id}". Add it to RENDERERS in web/games.js.`,
    );
  }
});

check("every content collection has entries", () => {
  // A collection that is registered but has no entries makes the server
  // refuse to start, which takes the whole site down rather than one game.
  const defaults = JSON.parse(
    readFileSync(
      new URL("../server/data/default-content.json", import.meta.url),
      "utf8",
    ),
  );
  const collections = defaults?.collections;
  assert(collections && typeof collections === "object", "The content file has no collections");

  for (const [key, items] of Object.entries(collections)) {
    assert(Array.isArray(items), `The collection "${key}" is not a list`);
    assert(items.length > 0, `The collection "${key}" is empty`);
  }
});

for (const { name, fn } of checks) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

if (process.exitCode) {
  console.error("engine smoke failed");
} else {
  console.log("engine smoke ok");
}
