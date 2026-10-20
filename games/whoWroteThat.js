import crypto from "node:crypto";
import { getCollection } from "../contentStore.js";
import {
  award,
  cleanText,
  completeRound,
  control,
  gameState,
  pickUnused,
  playerInGame,
  publicBase,
  setNextRound,
  shuffle,
  submittedCount,
} from "./common.js";

export const meta = {
  id: "who-wrote-that",
  name: "Who Wrote That?!",
  tagline: "Anonymous answers. One question: who wrote this?",
  minPlayers: 3,
  maxPlayers: 10,
  maxRounds: 3,
  hasScore: true,
};

function beginRound(game, round) {
  const [prompt] = pickUnused(
    getCollection("whoWrotePrompts"),
    game.usedPromptIds,
    1,
  );
  game.round = round;
  game.phase = "writing";
  game.prompt = prompt ?? { id: "fallback", text: "What is your best excuse?" };
  game.answers = [];
  game.answerOrder = [];
  game.guesses = {};
  game.results = null;
  game.scored = false;
  game.canNextRound = game.round < game.maxRounds;
}

export function create(room) {
  const game = gameState(meta, room);
  game.usedPromptIds = [];
  beginRound(game, 1);
  return game;
}

function reveal(game) {
  return game.phase === "results" || game.phase === "complete";
}

function answerByAuthor(game, playerId) {
  return game.answers.find((answer) => answer.authorId === playerId) ?? null;
}

function answerById(game, answerId) {
  return game.answers.find((answer) => answer.id === answerId) ?? null;
}

function publicAnswers(game) {
  if (game.phase === "writing") return [];
  const shown = reveal(game);

  return game.answerOrder
    .map((answerId) => answerById(game, answerId))
    .filter(Boolean)
    .map((answer) => {
      if (!shown) return { id: answer.id, text: answer.text };
      const guesses = game.players
        .filter((player) => player.id !== answer.authorId)
        .map((player) => ({
          playerId: player.id,
          name: player.name,
          correct: game.guesses[player.id]?.[answer.id] === answer.authorId,
        }));
      return {
        id: answer.id,
        text: answer.text,
        authorId: answer.authorId,
        authorName:
          game.players.find((player) => player.id === answer.authorId)?.name ??
          "Player",
        correctGuessers: guesses
          .filter((guess) => guess.correct)
          .map((guess) => ({ playerId: guess.playerId, name: guess.name })),
        guesses,
      };
    });
}

function tally(room, game) {
  if (game.scored) return;
  game.scored = true;

  const correctByPlayer = Object.fromEntries(
    game.players.map((player) => [player.id, 0]),
  );

  for (const answer of game.answers) {
    for (const player of game.players) {
      if (player.id === answer.authorId) continue;
      if (game.guesses[player.id]?.[answer.id] === answer.authorId) {
        correctByPlayer[player.id] += 1;
        award(room, player.id, 1);
      }
    }
  }

  game.correctByPlayer = correctByPlayer;
  game.results = game.players
    .map((player) => ({
      playerId: player.id,
      name: player.name,
      correct: correctByPlayer[player.id] ?? 0,
    }))
    .sort((a, b) => b.correct - a.correct || a.name.localeCompare(b.name));

  completeRound(game);
}

export function action(room, game, playerId, payload) {
  if (!playerInGame(game, playerId)) {
    return { ok: false, code: "not_in_game", message: "You are not in this game." };
  }

  const type = payload?.type;

  if (type === "answer") {
    if (game.phase !== "writing") {
      return { ok: false, code: "wrong_phase", message: "Answers are closed." };
    }
    if (answerByAuthor(game, playerId)) {
      return { ok: false, code: "already_submitted", message: "Your answer is already in." };
    }

    const text = cleanText(payload?.answer, 180);
    if (!text) {
      return { ok: false, code: "empty_answer", message: "Write an answer first." };
    }

    game.answers.push({
      id: crypto.randomUUID(),
      authorId: playerId,
      text,
    });

    if (game.answers.length === game.players.length) {
      game.answerOrder = shuffle(game.answers.map((answer) => answer.id));
      game.phase = "guessing";
      game.guesses = {};
    }
    return { ok: true };
  }

  if (type === "guesses") {
    if (game.phase !== "guessing") {
      return { ok: false, code: "wrong_phase", message: "Guessing is not open right now." };
    }
    if (Object.prototype.hasOwnProperty.call(game.guesses, playerId)) {
      return { ok: false, code: "already_submitted", message: "Your guesses are already in." };
    }

    const own = answerByAuthor(game, playerId);
    if (!own) {
      return { ok: false, code: "no_answer", message: "Your answer is missing." };
    }

    const raw = payload?.guesses;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, code: "invalid_guesses", message: "Choose an author for every answer." };
    }

    const required = game.answers
      .filter((answer) => answer.id !== own.id)
      .map((answer) => answer.id);
    const stored = {};

    for (const answerId of required) {
      const guessedAuthor = String(raw[answerId] ?? "");
      if (
        !guessedAuthor ||
        guessedAuthor === playerId ||
        !game.players.some((player) => player.id === guessedAuthor)
      ) {
        return {
          ok: false,
          code: "incomplete_guesses",
          message: "Choose an author for every answer.",
        };
      }
      stored[answerId] = guessedAuthor;
    }

    game.guesses[playerId] = stored;
    if (Object.keys(game.guesses).length === game.players.length) {
      tally(room, game);
    }
    return { ok: true };
  }

  return { ok: false, code: "unknown_action", message: "Unknown action." };
}

export function adminAction(room, game, type) {
  if (type === "skipToResults") {
    if (game.phase !== "guessing") {
      return { ok: false, code: "wrong_phase", message: "There is nothing to reveal." };
    }
    tally(room, game);
    return { ok: true };
  }
  return { ok: false, code: "unknown_action", message: "Unknown host action." };
}

export function nextRound(room, game) {
  if (game.phase !== "results") {
    return { ok: false, code: "wrong_phase", message: "The round is not finished." };
  }
  if (!setNextRound(game)) {
    return { ok: false, code: "complete", message: "All rounds are complete." };
  }
  beginRound(game, game.round);
  return { ok: true };
}

export function publicView(game) {
  return {
    ...publicBase(game),
    prompt: game.prompt,
    writingCount: game.answers.length,
    guessCount: submittedCount(game.guesses),
    totalPlayers: game.players.length,
    answers: publicAnswers(game),
    results: reveal(game) ? game.results : null,
    canNextRound: game.phase === "results",
  };
}

export function playerView(game, playerId) {
  const own = answerByAuthor(game, playerId);
  return {
    yourAnswer: own?.text ?? "",
    yourAnswerId: own?.id ?? null,
    yourGuesses: game.guesses[playerId] ?? {},
    submittedAnswer: Boolean(own),
    submittedGuesses: Object.prototype.hasOwnProperty.call(
      game.guesses,
      playerId,
    ),
    canSubmitAnswer: game.phase === "writing" && !own,
    canSubmitGuesses:
      game.phase === "guessing" &&
      !Object.prototype.hasOwnProperty.call(game.guesses, playerId),
    yourCorrectCount: reveal(game) ? (game.correctByPlayer?.[playerId] ?? 0) : 0,
  };
}

export function adminView(game) {
  return {
    ...publicView(game),
    controls:
      game.phase === "results"
        ? [control("nextRound", "Next round", "nextRound", "primary")]
        : game.phase === "complete"
          ? [control("replay", "Play again", "replay", "primary")]
          : game.phase === "guessing"
            ? [control("skipToResults", "Reveal result")]
            : [],
    submissions: {
      answers: { count: game.answers.length, total: game.players.length },
      guesses: { count: submittedCount(game.guesses), total: game.players.length },
    },
  };
}
