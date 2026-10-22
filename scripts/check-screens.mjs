/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
/* Checks that every game screen only reads fields the engine publishes.
 *
 * A screen that reads a field the engine never sends is not a crash. It
 * is a screen that quietly shows nothing, or shows the wrong thing, and
 * nobody notices until somebody is playing that game. Three of the
 * social games shipped that way: the engine published "results" and the
 * screen read "result", so the reveal never appeared.
 *
 * The public view and the player's own view are checked apart, because
 * they are not the same thing. A screen that reads a field off the
 * public game when only the player view has it shows nothing at all,
 * and nothing on the screen says so.
 *
 * This walks the client screens and the engine together and says when
 * they disagree.
 */

import { readFileSync } from "node:fs";
import { GAME_LIST, getGame } from "../server/games/index.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/* The fields a screen reads, kept apart by where they are read from. */
function fieldsReadBy(source) {
  const fromGame = new Set();
  const fromMine = new Set();
  for (const match of source.matchAll(/\bgame\.([a-zA-Z_][a-zA-Z0-9_]*)/g)) {
    fromGame.add(match[1]);
  }
  for (const match of source.matchAll(/\bmine\.([a-zA-Z_][a-zA-Z0-9_]*)/g)) {
    fromMine.add(match[1]);
  }
  return { fromGame, fromMine };
}

function union(...sets) {
  const all = new Set();
  for (const set of sets) for (const value of set) all.add(value);
  return all;
}

function difference(a, b) {
  const out = new Set();
  for (const value of a) if (!b.has(value)) out.add(value);
  return out;
}

/* The fields the engine publishes, over every state the game goes
 * through. */
function fieldsPublished(engine, room) {
  const publicFields = new Set();
  const playerFields = new Set();
  const game = engine.create(room);
  const playerId = room.players[0].id;

  const collect = (view, into) => {
    if (!view || typeof view !== "object") return;
    for (const key of Object.keys(view)) into.add(key);
    /* The result objects are read field by field, so their fields
     * count too. */
    for (const key of ["result", "results"]) {
      const nested = view[key];
      if (!nested || typeof nested !== "object") continue;
      if (Array.isArray(nested)) {
        for (const item of nested) {
          if (item && typeof item === "object") {
            for (const itemKey of Object.keys(item)) into.add(`${key}.${itemKey}`);
          }
        }
      } else {
        for (const nestedKey of Object.keys(nested)) {
          into.add(`${key}.${nestedKey}`);
        }
      }
    }
  };

  collect(engine.publicView(game, room), publicFields);
  collect(engine.playerView(game, playerId), playerFields);

  /* Walk the game through: vote, guess, finish. Every state is a state
   * a screen can be in. */
  const actions = {
    "would-you-rather": [
      { type: "vote", choice: "a" },
      { type: "explain", text: "Because" },
    ],
    "caption-this": [
      { type: "caption", caption: "A caption" },
      { type: "vote", captionId: null },
    ],
    "emoji-guess": [{ type: "guess", guess: "x" }],
    "two-truths-one-lie": [
      { type: "statements", statements: ["One", "Two", "Three"], lieIndex: 0 },
      { type: "guess", statementIndex: 0 },
    ],
    spyfall: [{ type: "ready" }, { type: "vote", targetId: null }],
    "who-am-i": [{ type: "guess", guess: "x" }],
    "where-am-i": [{ type: "guess", guess: "x" }],
    "who-is-it": [{ type: "vote", targetId: null }],
    "who-wrote-that": [{ type: "match", authorId: null }],
    "act-it-out": [{ type: "guess", guess: "x" }],
    "one-of-us": [{ type: "ready" }, { type: "clue", text: "A clue" }],
    "truth-or-dare": [{ type: "submit", text: "x" }],
    "draw-it": [{ type: "guess", text: "x" }],
  };

  for (const action of actions[engine.meta.id] ?? []) {
    for (const player of room.players) {
      const payload = { ...action };
      if (payload.targetId === null) payload.targetId = room.players[1].id;
      if (payload.captionId === null) {
        payload.captionId = game.captions?.[0]?.id ?? "none";
      }
      if (payload.authorId === null) {
        payload.authorId = room.players[1].id;
      }
      try {
        engine.action(room, game, player.id, payload);
      } catch {
        // An action that does not apply is not a problem here.
      }
      collect(engine.publicView(game, room), publicFields);
      collect(engine.playerView(game, player.id), playerFields);
    }
  }

  /* The end of the game, where the reveal lives. */
  for (const type of ["reveal", "skipToVoting", "finish", "nextRound"]) {
    try {
      engine.adminAction(room, game, type);
    } catch {
      // Not every game has that control.
    }
    collect(engine.publicView(game, room), publicFields);
    collect(engine.playerView(game, playerId), playerFields);
  }

  return { publicFields, playerFields };
}

/* The client screens, split so each game can be checked on its own. */
function clientScreens() {
  const source = readFileSync(
    new URL("../web/games.js", import.meta.url),
    "utf8",
  );
  const registry = source.slice(source.indexOf("const RENDERERS = {"));
  const entries = [...registry.matchAll(/"([a-z-]+)":\s*(\w+)/g)];

  /* The body of each function, up to the next one at the same level. */
  const bodies = new Map();
  const starts = [...source.matchAll(/^function (\w+)\(/gm)];
  for (const [index, match] of starts.entries()) {
    const from = match.index;
    const to = starts[index + 1]?.index ?? source.length;
    bodies.set(match[1], source.slice(from, to));
  }

  const screens = new Map();
  for (const match of entries) {
    screens.set(match[1], {
      ...fieldsReadBy(bodies.get(match[2]) ?? ""),
      fn: match[2],
    });
  }

  /* A screen that several games share branches on the game id, so the
   * branches can be split and each one checked against the game it
   * belongs to. */
  const branches = new Map();
  for (const match of entries) {
    const fn = match[2];
    const body = bodies.get(fn) ?? "";
    const marks = [...body.matchAll(/game\.id === "([a-z-]+)"/g)];
    if (marks.length < 2) continue;

    /* The branch after the last one is the fallback, and it belongs to
     * whichever game in this screen has no branch of its own. */
    const fallbackAt = body.lastIndexOf("} else {");
    const claimed = new Set(marks.map((mark) => mark[1]));
    const fallback = entries
      .filter((entry) => entry[2] === fn)
      .map((entry) => entry[1])
      .find((id) => !claimed.has(id));

    for (const [index, mark] of marks.entries()) {
      const from = mark.index;
      const to =
        index + 1 < marks.length
          ? marks[index + 1].index
          : fallbackAt > from
            ? fallbackAt
            : body.length;
      const id = mark[1];
      const read = fieldsReadBy(body.slice(from, to));
      if (!branches.has(id)) {
        branches.set(id, { fromGame: new Set(), fromMine: new Set() });
      }
      for (const field of read.fromGame) branches.get(id).fromGame.add(field);
      for (const field of read.fromMine) branches.get(id).fromMine.add(field);
    }

    if (fallback && fallbackAt > 0) {
      const tail = fieldsReadBy(body.slice(fallbackAt));
      if (!branches.has(fallback)) {
        branches.set(fallback, { fromGame: new Set(), fromMine: new Set() });
      }
      for (const field of tail.fromGame) branches.get(fallback).fromGame.add(field);
      for (const field of tail.fromMine) branches.get(fallback).fromMine.add(field);
    }
  }

  /* The helpers every screen uses. They may read a field only one game
   * has, so they are checked against everything. */
  const shared = ["scoreboard", "sessionScoreboard", "phaseLabel", "gameHeader"];
  const sharedFields = fieldsReadBy(
    shared.map((name) => bodies.get(name) ?? "").join("\n"),
  );

  return { screens, sharedFields, branches };
}

export function checkScreensMatchEngines() {
  const { screens, sharedFields, branches } = clientScreens();
  const problems = [];

  const publishedByGame = new Map();
  for (const meta of GAME_LIST) {
    const engine = getGame(meta.id);
    const room = {
      players: Array.from({ length: 4 }, (_, index) => ({
        id: `p${index + 1}`,
        name: `Player ${index + 1}`,
        connected: true,
      })),
      scores: {},
      sessionScores: {},
    };
    publishedByGame.set(meta.id, fieldsPublished(engine, room));
  }

  const everyPublic = new Set();
  const everyPlayer = new Set();
  for (const fields of publishedByGame.values()) {
    for (const field of fields.publicFields) everyPublic.add(field);
    for (const field of fields.playerFields) everyPlayer.add(field);
  }

  const byRenderer = new Map();
  for (const meta of GAME_LIST) {
    const screen = screens.get(meta.id);
    if (!screen) {
      problems.push(`${meta.id} has no client screen in the RENDERERS map`);
      continue;
    }
    if (!byRenderer.has(screen.fn)) byRenderer.set(screen.fn, []);
    byRenderer.get(screen.fn).push(meta.id);
  }

  for (const [fn, ids] of byRenderer) {
    const groupPublic = new Set();
    const groupPlayer = new Set();
    for (const id of ids) {
      const published = publishedByGame.get(id) ?? {};
      for (const field of published.publicFields ?? []) groupPublic.add(field);
      for (const field of published.playerFields ?? []) groupPlayer.add(field);
    }

    for (const id of ids) {
      const screen = screens.get(id);
      const branch = branches.get(id);
      const published = publishedByGame.get(id) ?? {};

      /* A branch of a shared screen is checked against its own game.
       * The rest of the screen is checked against the group. */
      const readGame = branch ? branch.fromGame : screen.fromGame;
      const readMine = branch ? branch.fromMine : screen.fromMine;
      const allowedGame = branch ? published.publicFields : groupPublic;
      const allowedMine = branch ? published.playerFields : groupPlayer;

      for (const field of difference(readGame, allowedGame)) {
        problems.push(
          `${id}: the screen reads game.${field}, which it never publishes`,
        );
      }
      for (const field of difference(readMine, allowedMine)) {
        problems.push(
          `${id}: the screen reads mine.${field}, which it never publishes`,
        );
      }
    }
  }

  /* The shared helpers are checked against everything there is. */
  for (const field of difference(sharedFields.fromGame, everyPublic)) {
    problems.push(`a shared screen helper reads game.${field}, which no game publishes`);
  }
  for (const field of difference(sharedFields.fromMine, everyPlayer)) {
    problems.push(`a shared screen helper reads mine.${field}, which no game publishes`);
  }

  assert(
    problems.length === 0,
    `The screens and the engines disagree:\n- ${problems.join("\n- ")}`,
  );
}
