/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
import { getCollection } from "../contentStore.js";
import {
  answerMatches,
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

/* Turn-based hidden-person / hidden-place guessing.
 *
 * One player is the guesser for a turn. Only that player cannot see the
 * assignment; everyone else (and the host) can see it and give clues out
 * loud. The guesser may guess as many times as they like. There is no timer.
 */

function createEngine({ id, name, tagline, contentType, contentKey, note }) {
  const meta = {
    id,
    name,
    tagline,
    minPlayers: 3,
    maxPlayers: 10,
    maxRounds: 0,
    hasScore: true,
    endless: true,
  };

  function fallbackItem() {
    return {
      id: `${contentType}-fallback`,
      name: contentType === "place" ? "Kathmandu" : "Albert Einstein",
      group: contentType === "place" ? "Nepal" : "Global",
      hints: ["Add content in the host console."],
    };
  }

  function currentPlayer(game) {
    return (
      game.players.find((player) => player.id === game.turnOrder[game.turnIndex]) ??
      null
    );
  }

  function beginPass(game) {
    game.pass = (game.pass ?? 0) + 1;
    game.turnOrder = shuffle(game.players.map((player) => player.id));
    game.turnIndex = 0;

    if (game.turnOrder.length === 0) {
      game.activePlayerId = null;
      game.phase = "complete";
      return;
    }

    beginTurn(game);
  }

  function beginTurn(game) {
    const active = currentPlayer(game);
    if (!active) {
      beginPass(game);
      return;
    }

    const [item] = pickUnused(getCollection(contentKey), game.usedIds, 1);
    game.assignment = item ?? fallbackItem();
    game.activePlayerId = active.id;
    game.phase = "guess";
    game.guesses = [];
    game.result = null;
    game.turnStartedAt = Date.now();
  }

  function create(room) {
    const game = gameState(meta, room);
    game.contentType = contentType;
    game.note = note ?? null;
    // The people or places a room has already used, for the whole session.
    game.usedIds = roomMemory(room, contentKey);
    game.pass = 0;
    game.history = [];
    game.assignment = null;
    game.activePlayerId = null;
    game.guesses = [];
    game.result = null;
    beginPass(game);
    return game;
  }

  function safeAssignment(item) {
    if (!item) return null;
    return {
      id: item.id,
      name: item.name,
      group: item.group ?? null,
    };
  }

  function safeResult(result) {
    if (!result) return null;
    return {
      playerId: result.playerId,
      playerName: result.playerName,
      correct: Boolean(result.correct),
      gaveUp: Boolean(result.gaveUp),
      skippedByHost: Boolean(result.skippedByHost),
      guess: result.guess ?? "",
      points: result.points ?? 0,
      answer: safeAssignment(result.answer),
    };
  }

  function recordHistory(game, result) {
    game.history.push({
      pass: game.pass,
      turnNumber: game.turnIndex + 1,
      playerId: result.playerId,
      playerName: result.playerName,
      answerId: result.answer?.id ?? null,
      answerName: result.answer?.name ?? "-",
      guess: result.guess ?? "",
      correct: Boolean(result.correct),
      gaveUp: Boolean(result.gaveUp),
      skippedByHost: Boolean(result.skippedByHost),
      points: result.points ?? 0,
      finishedAt: Date.now(),
    });
    game.history = game.history.slice(-80);
  }

  function finishTurn(
    room,
    game,
    { correct = false, gaveUp = false, skippedByHost = false } = {},
  ) {
    if (game.phase !== "guess") return null;

    const active = currentPlayer(game);
    const lastGuess = game.guesses.at(-1)?.text ?? "";
    const points = correct ? 1 : 0;
    if (correct) award(room, active.id, 1);

    game.phase = "reveal";
    game.result = {
      playerId: active.id,
      playerName: active.name,
      correct,
      gaveUp,
      skippedByHost,
      guess: lastGuess,
      points,
      answer: game.assignment,
    };
    recordHistory(game, game.result);
    game.guesses = [];
    return game.result;
  }

  function advanceTurn(game) {
    if (game.turnIndex + 1 >= game.turnOrder.length) {
      beginPass(game);
      return;
    }
    game.turnIndex += 1;
    beginTurn(game);
  }

  function reveal(game) {
    return game.phase === "reveal" || game.phase === "complete";
  }

  function action(room, game, playerId, payload) {
    if (!playerInGame(game, playerId)) {
      return { ok: false, code: "not_in_game", message: "You are not in this game." };
    }

    const type = payload?.type;
    const active = playerId === game.activePlayerId;

    if (type === "guess") {
      if (!active) {
        return {
          ok: false,
          code: "not_active",
          message: "It is not your turn to guess.",
        };
      }
      if (game.phase !== "guess") {
        return {
          ok: false,
          code: "wrong_phase",
          message: "This turn is already finished.",
        };
      }

      const guess = cleanText(payload?.guess, 90);
      if (!guess) {
        return { ok: false, code: "empty_guess", message: "Type a guess first." };
      }
      if (game.guesses.some((entry) => entry.text.toLowerCase() === guess.toLowerCase())) {
        return {
          ok: false,
          code: "duplicate_guess",
          message: "You already tried that guess.",
        };
      }

      const correct = answerMatches(guess, game.assignment);
      game.guesses.push({ text: guess, correct, at: Date.now() });
      if (correct) finishTurn(room, game, { correct: true });
      return { ok: true, correct };
    }

    if (type === "giveUp") {
      if (!active) {
        return { ok: false, code: "not_active", message: "It is not your turn." };
      }
      if (game.phase !== "guess") {
        return {
          ok: false,
          code: "wrong_phase",
          message: "This turn is already finished.",
        };
      }
      finishTurn(room, game, { gaveUp: true });
      return { ok: true };
    }

    if (type === "next") {
      if (!active) {
        return { ok: false, code: "not_active", message: "It is not your turn." };
      }
      if (game.phase !== "reveal") {
        return {
          ok: false,
          code: "wrong_phase",
          message: "The answer has not been revealed yet.",
        };
      }
      advanceTurn(game);
      return { ok: true };
    }

    return { ok: false, code: "unknown_action", message: "Unknown action." };
  }

  function adminAction(room, game, type) {
    if (type === "skipTurn") {
      if (game.phase !== "guess") {
        return { ok: false, code: "wrong_phase", message: "There is no guess to skip." };
      }
      finishTurn(room, game, { skippedByHost: true });
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
        return { ok: false, code: "already_complete", message: "The game is already complete." };
      }
      game.phase = "complete";
      return { ok: true };
    }

    return { ok: false, code: "unknown_action", message: "Unknown host action." };
  }

  function publicView(game) {
    const active = game.turnOrder
      ? game.players.find((player) => player.id === game.activePlayerId)
      : null;

    return {
      ...publicBase(game),
      contentType,
      note: note ?? null,
      endless: true,
      round: game.pass,
      maxRounds: 0,
      canNextRound: false,
      isFinal: false,
      pass: game.pass,
      turnNumber: game.turnIndex + 1,
      totalTurns: game.turnOrder?.length ?? game.players.length,
      activePlayerId: game.activePlayerId,
      activePlayerName: active?.name ?? playerName(game, game.activePlayerId),
      guessCount: game.guesses?.length ?? 0,
      result: reveal(game) ? safeResult(game.result) : null,
      history: game.history ?? [],
    };
  }

  function playerView(game, playerId) {
    const active = playerId === game.activePlayerId;
    const shown = reveal(game);
    const assignment = game.assignment;
    const otherPlayersSeeIt = !active;
    const visibleAssignment =
      shown || otherPlayersSeeIt ? safeAssignment(assignment) : null;

    return {
      isActive: active,
      contentType,
      note: note ?? null,
      phase: game.phase,
      activePlayerId: game.activePlayerId,
      activePlayerName: playerName(game, game.activePlayerId),
      pass: game.pass,
      turnNumber: game.turnIndex + 1,
      totalTurns: game.turnOrder?.length ?? game.players.length,
      canGuess: active && game.phase === "guess",
      canGiveUp: active && game.phase === "guess",
      canNext: active && game.phase === "reveal",
      yourGuesses: active
        ? (game.guesses ?? []).map((entry) => entry.text)
        : [],
      assignment: visibleAssignment,
      result: shown ? safeResult(game.result) : null,
      history: game.history ?? [],
      waiting: !active && game.phase === "guess",
    };
  }

  function adminView(game, room) {
    const controls = [];
    if (game.phase === "guess") {
      controls.push(control("skipTurn", "Skip this turn", "gameAction", "tonal"));
    }
    if (game.phase === "reveal") {
      controls.push(control("nextTurn", "Next turn", "gameAction", "primary"));
    }
    if (game.phase !== "complete") {
      controls.push(control("finish", "Finish game", "gameAction", "text"));
    }
    if (game.phase === "complete" && !room?.playlist?.active) {
      controls.push(control("replay", "Play again", "replay", "primary"));
    }

    return {
      ...publicView(game),
      assignment: game.assignment
        ? {
            id: game.assignment.id,
            name: game.assignment.name,
            group: game.assignment.group ?? null,
            hints: game.assignment.hints ?? [],
          }
        : null,
      guesses: game.guesses ?? [],
      history: game.history ?? [],
      controls,
      submissions: {
        turns: {
          count: game.history?.length ?? 0,
          total: null,
        },
        guesses: {
          count: game.guesses?.length ?? 0,
          total: null,
        },
      },
    };
  }

  function nextRound(room, game) {
    return adminAction(room, game, "nextTurn");
  }

  return {
    meta,
    create,
    action,
    adminAction,
    nextRound,
    publicView,
    playerView,
    adminView,
  };
}

export const whoAmI = createEngine({
  id: "who-am-i",
  name: "Who Am I?",
  tagline: "One guesser, one hidden face. The room gives the clues.",
  contentType: "person",
  contentKey: "people",
  note: "Everyone except the guesser can see the person. Give clues out loud, but never say the name.",
});

export const whereAmI = createEngine({
  id: "where-am-i",
  name: "Where Am I?",
  tagline: "One guesser, one hidden place. The room gives the clues.",
  contentType: "place",
  contentKey: "places",
  note: "Everyone except the guesser can see the place. Give clues out loud, but never say the name.",
});
