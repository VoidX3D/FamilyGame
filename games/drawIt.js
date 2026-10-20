/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
import { getCollection } from "../contentStore.js";
import {
  award,
  cleanText,
  control,
  gameState,
  pickUnused,
  playerInGame,
  playerName,
  publicBase,
  roomMemory,
  shuffle,
} from "./common.js";

/* Draw It: one drawer draws a secret word, the room guesses it.
 *
 * This is the one game in the platform that runs on a clock. The server
 * owns the clock: it publishes a deadline with the game state and every
 * client counts down from it. A client that misses an event, or whose
 * phone sleeps, never decides that time is up.
 *
 * The drawing itself does not travel in the game state. Strokes are a
 * stream, so they go out on their own event and the state only carries
 * the stroke count. That keeps a full state push from happening on every
 * pointer move.
 */

export const meta = {
  id: "draw-it",
  name: "Draw It",
  tagline: "One drawer, one secret word. The room guesses while the clock runs.",
  minPlayers: 3,
  maxPlayers: 10,
  maxRounds: 0,
  hasScore: true,
  oneTurnEach: true,
  timed: true,
};

const FALLBACK_WORD = { id: "fallback-draw", text: "Momos", category: "Food" };
const TURN_LENGTHS = [30, 45, 60, 90];
const DEFAULT_TURN_SECONDS = 60;
const REVEAL_MS = 10_000;
const MAX_STROKES = 4000;

/* A guess is compared without case, punctuation or spaces, so "hot dog",
 * "Hot-Dog!" and "hotdog" all count as the same word. A different word
 * never counts, however close it looks. */
export function normalizeGuess(value) {
  return String(value ?? "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function guessMatches(guess, word) {
  const target = normalizeGuess(word);
  return target.length > 0 && normalizeGuess(guess) === target;
}

function currentDrawer(game) {
  return (
    game.players.find((player) => player.id === game.turnOrder[game.turnIndex]) ??
    null
  );
}

function totalTurns(game) {
  return game.turnOrder?.length ?? game.players.length;
}

function safeWord(word) {
  if (!word) return null;
  return {
    id: word.id,
    text: word.text,
    category: word.category ?? "Fun",
  };
}

/* The content collection calls the field "word". The engine works with
 * "text", so the two shapes meet in one place. */
function normalizeWord(item) {
  if (!item) return null;
  const text = String(item.word ?? item.text ?? "").trim();
  if (!text) return null;
  return {
    id: item.id,
    text,
    category: item.category ?? "Fun",
  };
}

function safeResult(result) {
  if (!result) return null;
  return {
    drawerId: result.drawerId,
    drawerName: result.drawerName,
    word: result.word,
    category: result.category,
    guessed: result.guessed,
    guessers: result.guessers,
    reason: result.reason,
    points: result.points,
  };
}

function revealed(game) {
  return game.phase === "reveal" || game.phase === "complete";
}

function beginTurn(game) {
  const drawer = currentDrawer(game);
  if (!drawer) {
    game.phase = "complete";
    game.drawerId = null;
    return;
  }

  const [picked] = pickUnused(getCollection("drawingWords"), game.usedWordIds, 1);

  game.phase = "drawing";
  game.drawerId = drawer.id;
  game.word = normalizeWord(picked) ?? FALLBACK_WORD;
  game.strokes = [];
  game.strokeSeq = 0;
  game.guessers = [];
  game.wrongGuesses = 0;
  game.result = null;
  game.turnStartedAt = Date.now();
  game.deadline = Date.now() + game.turnLengthMs;
  game.revealUntil = 0;
}

export function create(room) {
  const game = gameState(meta, room);
  game.phase = "setup";
  game.turnOrder = shuffle(game.players.map((player) => player.id));
  game.turnIndex = 0;
  // The words a room has already used, for the whole session.
  game.usedWordIds = roomMemory(room, "drawingWords");
  game.history = [];
  game.word = null;
  game.drawerId = null;
  game.strokes = [];
  game.strokeSeq = 0;
  game.guessers = [];
  game.wrongGuesses = 0;
  game.result = null;
  game.turnLengthMs = DEFAULT_TURN_SECONDS * 1000;
  game.deadline = 0;
  game.revealUntil = 0;
  game.turnStartedAt = 0;
  return game;
}

/* Ends the turn and scores it.
 *
 * A correct guess is worth a point and is awarded the moment it happens,
 * so the guesser sees their tile appear at once. The drawer gets a point
 * when the word was guessed at all. A turn that ran out of time with
 * nobody guessing is worth nothing. */
function endTurn(room, game, reason) {
  if (game.phase !== "drawing") return null;

  const drawer = currentDrawer(game);
  const guessers = game.guessers.map(
    (id) => game.players.find((player) => player.id === id) ?? null,
  );

  const guessed = guessers.length > 0;
  if (guessed && drawer) award(room, drawer.id, 1);

  game.phase = "reveal";
  game.deadline = 0;
  game.revealUntil = Date.now() + REVEAL_MS;
  game.result = {
    drawerId: drawer?.id ?? null,
    drawerName: drawer?.name ?? "Player",
    word: safeWord(game.word),
    category: game.word?.category ?? "Fun",
    guessed,
    guessers: guessers.map((player) => ({
      id: player?.id ?? null,
      name: player?.name ?? "Player",
    })),
    reason,
    points: {
      drawer: guessed ? 1 : 0,
      guessers: guessers.map((player) => ({ id: player?.id ?? null, points: 1 })),
    },
  };

  game.history.push({
    drawerId: drawer?.id ?? null,
    drawerName: drawer?.name ?? "Player",
    word: game.word?.text ?? "",
    category: game.word?.category ?? "Fun",
    guessed,
    guesserCount: guessers.length,
    reason,
    at: Date.now(),
  });
  game.history = game.history.slice(-40);

  return game.result;
}

function advanceTurn(game) {
  if (game.turnIndex + 1 >= totalTurns(game)) {
    game.phase = "complete";
    game.drawerId = null;
    game.deadline = 0;
    game.revealUntil = 0;
    return;
  }
  game.turnIndex += 1;
  beginTurn(game);
}

function everyoneGuessed(game) {
  return game.guessers.length >= game.players.length - 1;
}

/* Accepts a stroke from the drawer. The protocol layer calls this
 * directly, so strokes never travel through the rate limited game
 * action channel. */
export function acceptStroke(room, game, playerId, payload) {
  if (game.phase !== "drawing") {
    return { ok: false, code: "wrong_phase", message: "The board is closed." };
  }
  if (playerId !== game.drawerId) {
    return {
      ok: false,
      code: "not_drawer",
      message: "Only the drawer can draw.",
    };
  }
  if (game.strokes.length >= MAX_STROKES) {
    return { ok: false, code: "board_full", message: "The board is full." };
  }

  const points = normalizePoints(payload?.points);
  if (!points) {
    return { ok: false, code: "invalid_stroke", message: "That stroke was refused." };
  }

  const tool = TOOLS.has(payload?.tool) ? payload.tool : "pen";

  const stroke = {
    id: String(payload?.id ?? `${game.strokeSeq + 1}`).slice(0, 40),
    by: playerId,
    tool,
    points,
    color: tool === "erase" ? null : safeColor(payload?.color),
    width: clamp(Number(payload?.width) || 0.012, 0.002, 0.12),
  };

  game.strokes.push(stroke);
  game.strokeSeq += 1;
  return { ok: true, stroke };
}

const MAX_POINTS = 64;

function normalizePoints(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const points = [];
  for (const entry of value.slice(0, MAX_POINTS)) {
    const point = normalizePoint(entry);
    if (point) points.push(point);
  }
  return points.length > 0 ? points : null;
}

function normalizePoint(value) {
  if (!Array.isArray(value) || value.length < 2) return null;
  const x = Number(value[0]);
  const y = Number(value[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [clamp(x, -0.5, 1.5), clamp(y, -0.5, 1.5)];
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function safeColor(value) {
  const text = String(value ?? "").trim();
  return /^#[0-9a-f]{3,8}$/i.test(text) ? text : "#f4f1ff";
}

/* The strokes of the current turn, for a player who joins or reconnects
 * mid-turn. */
export function strokeHistory(game) {
  return game.strokes ?? [];
}

/* The tools the drawer can use. The server only checks that the tool is
 * one it knows; the drawing itself is done by the clients. */
const TOOLS = new Set(["pen", "erase", "fill"]);

/* Removes the drawer's last stroke, so a mistake can be taken back. */
export function undoStroke(room, game, playerId) {
  if (game.phase !== "drawing") {
    return { ok: false, code: "wrong_phase", message: "The board is closed." };
  }
  if (playerId !== game.drawerId) {
    return {
      ok: false,
      code: "not_drawer",
      message: "Only the drawer can take a stroke back.",
    };
  }

  for (let index = game.strokes.length - 1; index >= 0; index -= 1) {
    if (game.strokes[index]?.by === playerId) {
      const [removed] = game.strokes.splice(index, 1);
      return { ok: true, strokeId: removed.id };
    }
  }

  return { ok: false, code: "nothing_to_undo", message: "There is nothing to undo." };
}

/* Wipes the board. The drawer may do this at any point in the turn. */
export function clearBoard(room, game, playerId) {
  if (game.phase !== "drawing") {
    return { ok: false, code: "wrong_phase", message: "The board is closed." };
  }
  if (playerId !== game.drawerId) {
    return {
      ok: false,
      code: "not_drawer",
      message: "Only the drawer can clear the board.",
    };
  }

  game.strokes = [];
  game.strokeSeq = 0;
  return { ok: true };
}

export function action(room, game, playerId, payload) {
  if (!playerInGame(game, playerId)) {
    return { ok: false, code: "not_in_game", message: "You are not in this game." };
  }

  const type = payload?.type;

  if (type === "guess") {
    if (playerId === game.drawerId) {
      return {
        ok: false,
        code: "drawer_cannot_guess",
        message: "You are drawing. Let the room guess.",
      };
    }
    if (game.phase !== "drawing") {
      return { ok: false, code: "wrong_phase", message: "Guessing is closed." };
    }
    if (game.guessers.includes(playerId)) {
      return {
        ok: false,
        code: "already_guessed",
        message: "You already got it.",
      };
    }

    const text = cleanText(payload?.text, 60);
    if (!text) {
      return { ok: false, code: "empty_guess", message: "Type a guess first." };
    }

    if (!guessMatches(text, game.word?.text)) {
      game.wrongGuesses += 1;
      return { ok: true, correct: false };
    }

    game.guessers.push(playerId);
    award(room, playerId, 1);

    if (everyoneGuessed(game)) {
      endTurn(room, game, "guessed");
    }
    return { ok: true, correct: true };
  }

  if (type === "done") {
    if (playerId !== game.drawerId) {
      return {
        ok: false,
        code: "not_drawer",
        message: "Only the drawer can end the turn.",
      };
    }
    if (game.phase !== "drawing") {
      return { ok: false, code: "wrong_phase", message: "The turn is over." };
    }
    endTurn(room, game, "drawer-done");
    return { ok: true };
  }

  return { ok: false, code: "unknown_action", message: "Unknown action." };
}

export function adminAction(room, game, type) {
  if (type === "timeout") {
    const now = Date.now();
    if (game.phase === "drawing" && game.deadline && now >= game.deadline) {
      endTurn(room, game, "timeout");
      return { ok: true, timedOut: true };
    }
    if (game.phase === "reveal" && game.revealUntil && now >= game.revealUntil) {
      advanceTurn(game);
      return { ok: true, advanced: true };
    }
    return { ok: false, code: "not_due", message: "The clock has not run out." };
  }

  if (type.startsWith("time")) {
    if (game.phase !== "setup") {
      return { ok: false, code: "wrong_phase", message: "The game has already started." };
    }
    const seconds = Number(type.replace("time", ""));
    if (!TURN_LENGTHS.includes(seconds)) {
      return { ok: false, code: "unknown_action", message: "Unknown host action." };
    }
    game.turnLengthMs = seconds * 1000;
    beginTurn(game);
    return { ok: true, seconds };
  }

  if (type === "addTime") {
    if (game.phase !== "drawing") {
      return { ok: false, code: "wrong_phase", message: "There is no running turn." };
    }
    game.deadline += 20_000;
    return { ok: true };
  }

  if (type === "skipTurn") {
    if (game.phase !== "drawing" && game.phase !== "reveal") {
      return { ok: false, code: "wrong_phase", message: "There is no active turn." };
    }
    if (game.phase === "drawing") {
      endTurn(room, game, "skipped");
    }
    advanceTurn(game);
    return { ok: true };
  }

  if (type === "nextTurn") {
    if (game.phase !== "reveal") {
      return { ok: false, code: "wrong_phase", message: "The turn is not finished." };
    }
    advanceTurn(game);
    return { ok: true };
  }

  if (type === "finish") {
    if (game.phase === "complete") {
      return {
        ok: false,
        code: "already_complete",
        message: "The game is already complete.",
      };
    }
    game.phase = "complete";
    game.deadline = 0;
    game.revealUntil = 0;
    return { ok: true };
  }

  return { ok: false, code: "unknown_action", message: "Unknown host action." };
}

export function nextRound(room, game) {
  return adminAction(room, game, "nextTurn");
}

export function publicView(game) {
  const drawer = game.players.find((player) => player.id === game.drawerId) ?? null;
  const shown = revealed(game);

  return {
    ...publicBase(game),
    round: game.turnIndex + 1,
    maxRounds: totalTurns(game),
    canNextRound: false,
    isFinal: false,
    oneTurnEach: true,
    phase: game.phase,
    turnNumber: game.turnIndex + 1,
    totalTurns: totalTurns(game),
    drawerId: game.drawerId,
    drawerName: drawer?.name ?? playerName(game, game.drawerId),
    deadline: game.deadline ?? 0,
    revealUntil: game.revealUntil ?? 0,
    turnLengthMs: game.turnLengthMs,
    strokeCount: game.strokes?.length ?? 0,
    guessedCount: game.guessers?.length ?? 0,
    wrongCount: game.wrongGuesses ?? 0,
    word: shown ? safeWord(game.word) : null,
    result: shown ? safeResult(game.result) : null,
    history: game.history ?? [],
  };
}

export function playerView(game, playerId) {
  const isDrawer = playerId === game.drawerId;
  const shown = revealed(game);
  const youGuessed = (game.guessers ?? []).includes(playerId);

  return {
    isDrawer,
    drawerId: game.drawerId,
    drawerName: playerName(game, game.drawerId),
    turnNumber: game.turnIndex + 1,
    totalTurns: totalTurns(game),
    phase: game.phase,
    yourWord: isDrawer && game.phase === "drawing" ? safeWord(game.word) : null,
    word: shown ? safeWord(game.word) : null,
    youGuessed,
    guessedCount: game.guessers?.length ?? 0,
    wrongCount: game.wrongGuesses ?? 0,
    strokeCount: game.strokes?.length ?? 0,
    deadline: game.deadline ?? 0,
    revealUntil: game.revealUntil ?? 0,
    canGuess:
      !isDrawer && game.phase === "drawing" && !youGuessed,
    canDraw: isDrawer && game.phase === "drawing",
    canDone: isDrawer && game.phase === "drawing",
    canClear: isDrawer && game.phase === "drawing",
    result: shown ? safeResult(game.result) : null,
    history: game.history ?? [],
    waiting:
      !isDrawer && game.phase === "drawing" && !youGuessed,
  };
}

export function adminView(game, room) {
  const controls = [];

  if (game.phase === "setup") {
    for (const seconds of TURN_LENGTHS) {
      controls.push(
        control(`time${seconds}`, `${seconds} seconds per turn`, "gameAction", "primary"),
      );
    }
  }
  if (game.phase === "drawing") {
    controls.push(control("addTime", "Add 20 seconds", "gameAction", "tonal"));
    controls.push(control("skipTurn", "Skip this turn", "gameAction", "tonal"));
  }
  if (game.phase === "reveal") {
    controls.push(control("nextTurn", "Next drawer", "gameAction", "primary"));
  }
  if (game.phase !== "complete") {
    controls.push(control("finish", "Finish game", "gameAction", "text"));
  }
  if (game.phase === "complete" && !room?.playlist?.active) {
    controls.push(control("replay", "Play again", "replay", "primary"));
  }

  return {
    ...publicView(game),
    word: safeWord(game.word),
    result: safeResult(game.result),
    history: game.history ?? [],
    controls,
    submissions: {
      turns: {
        count: game.history?.length ?? 0,
        total: totalTurns(game),
      },
      guesses: {
        count: game.guessers?.length ?? 0,
        total: null,
      },
    },
  };
}
