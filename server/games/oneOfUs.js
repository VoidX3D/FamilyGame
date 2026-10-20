import { getCollection } from "../contentStore.js";
import {
  allSubmitted,
  award,
  cleanText,
  completeRound,
  control,
  gameState,
  normalizeAnswer,
  pickOne,
  pickUnused,
  playerInGame,
  playerName,
  publicBase,
  setNextRound,
  submittedCount,
} from "./common.js";

export const meta = {
  id: "one-of-us",
  name: "One of Us",
  tagline: "One player is faking it. Give clues, find the imposter.",
  minPlayers: 3,
  maxPlayers: 10,
  maxRounds: 3,
  hasScore: true,
};

function beginRound(game, round) {
  const words = getCollection("oneOfUsWords");
  const [word] = pickUnused(words, game.usedWordIds, 1);
  game.round = round;
  game.word = word?.word ?? "Momos";
  game.category = word?.category ?? "Food";
  game.imposterId = pickOne(game.players)?.id ?? null;
  game.phase = "reveal";
  game.ready = {};
  game.clues = {};
  game.votes = {};
  game.winner = null;
  game.caught = null;
  game.voteCounts = null;
  game.voteBreakdown = null;
  game.imposterGuess = null;
  game.scored = false;
  game.canNextRound = game.round < game.maxRounds;
}

export function create(room) {
  const game = gameState(meta, room);
  game.usedWordIds = [];
  beginRound(game, 1);
  return game;
}

function reveal(game) {
  return game.phase === "results" || game.phase === "complete";
}

function finish(room, game, winner) {
  if (game.scored) return;
  game.scored = true;
  game.winner = winner;

  if (winner === "crew") {
    for (const player of game.players) {
      if (player.id !== game.imposterId) award(room, player.id, 1);
    }
  } else {
    award(room, game.imposterId, 2);
  }

  completeRound(game);
}

function tallyVotes(room, game) {
  const counts = Object.fromEntries(
    game.players.map((player) => [player.id, 0]),
  );
  for (const targetId of Object.values(game.votes)) {
    if (counts[targetId] !== undefined) counts[targetId] += 1;
  }

  game.voteCounts = game.players
    .map((player) => ({
      playerId: player.id,
      name: player.name,
      count: counts[player.id] ?? 0,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  game.voteBreakdown = game.players
    .filter((player) => game.votes[player.id])
    .map((player) => ({
      voterId: player.id,
      voterName: player.name,
      targetId: game.votes[player.id],
      targetName: playerName(game, game.votes[player.id]),
    }));

  const topCount = game.voteCounts[0]?.count ?? 0;
  const top = game.voteCounts.filter(
    (entry) => topCount > 0 && entry.count === topCount,
  );
  const caught = top.length === 1 && top[0].playerId === game.imposterId;
  game.caught = caught;

  if (caught) {
    game.phase = "imposter-guess";
  } else {
    finish(room, game, "imposter");
  }
}

export function action(room, game, playerId, payload) {
  if (!playerInGame(game, playerId)) {
    return { ok: false, code: "not_in_game", message: "You are not in this game." };
  }

  const type = payload?.type;

  if (type === "ready") {
    if (game.phase !== "reveal") {
      return { ok: false, code: "wrong_phase", message: "The roles are already revealed." };
    }
    game.ready[playerId] = true;
    if (allSubmitted(game.ready, game.players)) game.phase = "clues";
    return { ok: true };
  }

  if (type === "clue") {
    if (game.phase !== "clues") {
      return { ok: false, code: "wrong_phase", message: "Clues are not open right now." };
    }
    if (Object.prototype.hasOwnProperty.call(game.clues, playerId)) {
      return { ok: false, code: "already_submitted", message: "Your clue is already in." };
    }

    const text = cleanText(payload?.clue, 90);
    if (!text) {
      return { ok: false, code: "empty_clue", message: "Write a short clue first." };
    }

    const normalizedWord = normalizeAnswer(game.word);
    const normalizedText = normalizeAnswer(text);
    if (
      normalizedText === normalizedWord ||
      (normalizedWord.length >= 4 && normalizedText.includes(normalizedWord))
    ) {
      return {
        ok: false,
        code: "clue_spoils",
        message: "That clue gives away the word. Try a subtler one.",
      };
    }

    game.clues[playerId] = text;
    if (allSubmitted(game.clues, game.players)) {
      game.phase = "discuss";
    }
    return { ok: true };
  }

  if (type === "vote") {
    if (game.phase !== "vote") {
      return { ok: false, code: "wrong_phase", message: "Voting is not open right now." };
    }
    if (Object.prototype.hasOwnProperty.call(game.votes, playerId)) {
      return { ok: false, code: "already_voted", message: "You already voted." };
    }

    const targetId = String(payload?.targetId ?? "");
    if (targetId === playerId || !playerInGame(game, targetId)) {
      return { ok: false, code: "invalid_target", message: "Choose another player." };
    }

    game.votes[playerId] = targetId;
    if (allSubmitted(game.votes, game.players)) {
      tallyVotes(room, game);
    }
    return { ok: true };
  }

  if (type === "guess") {
    if (game.phase !== "imposter-guess") {
      return { ok: false, code: "wrong_phase", message: "There is no guess to make." };
    }
    if (playerId !== game.imposterId) {
      return { ok: false, code: "not_imposter", message: "Only the imposter can guess." };
    }

    const guess = cleanText(payload?.guess, 90);
    if (!guess) {
      return { ok: false, code: "empty_guess", message: "Type your guess first." };
    }

    game.imposterGuess = guess;
    const correct = normalizeAnswer(guess) === normalizeAnswer(game.word);
    finish(room, game, correct ? "imposter" : "crew");
    return { ok: true };
  }

  return { ok: false, code: "unknown_action", message: "Unknown action." };
}

export function adminAction(room, game, type) {
  if (type === "startVote") {
    if (game.phase !== "clues" && game.phase !== "discuss") {
      return { ok: false, code: "wrong_phase", message: "Voting cannot start yet." };
    }
    for (const player of game.players) {
      if (!game.clues[player.id]) game.clues[player.id] = "(No clue given)";
    }
    game.phase = "vote";
    return { ok: true };
  }

  if (type === "skipToResults") {
    if (game.phase === "vote") {
      tallyVotes(room, game);
      if (game.phase === "imposter-guess") {
        game.imposterGuess = "(No guess)";
        finish(room, game, "imposter");
      }
      return { ok: true };
    }
    if (game.phase === "imposter-guess") {
      game.imposterGuess = "(No guess)";
      finish(room, game, "imposter");
      return { ok: true };
    }
    return { ok: false, code: "wrong_phase", message: "There is nothing to reveal." };
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
  const shown = reveal(game);
  const cluesOpen = ["discuss", "vote", "results", "complete"].includes(game.phase);

  return {
    ...publicBase(game),
    category: game.category,
    readyCount: submittedCount(game.ready),
    clueCount: submittedCount(game.clues),
    voteCount: submittedCount(game.votes),
    totalPlayers: game.players.length,
    clues: cluesOpen
      ? game.players.map((player) => ({
          playerId: player.id,
          name: player.name,
          text: game.clues[player.id] ?? "",
        }))
      : [],
    winner: shown ? game.winner : null,
    caught: shown ? game.caught : null,
    word: shown ? game.word : null,
    imposterId: shown ? game.imposterId : null,
    imposterName: shown ? playerName(game, game.imposterId) : null,
    imposterGuess: shown ? game.imposterGuess : null,
    voteCounts: shown ? game.voteCounts : null,
    voteBreakdown: shown ? game.voteBreakdown : null,
    canNextRound: game.phase === "results",
  };
}

export function playerView(game, playerId) {
  const isImposter = playerId === game.imposterId;
  const shown = reveal(game);

  return {
    role: isImposter ? "imposter" : "crew",
    isImposter,
    word: isImposter && !shown ? null : game.word,
    category: game.category,
    ready: Boolean(game.ready[playerId]),
    yourClue: game.clues[playerId] ?? "",
    yourVote: game.votes[playerId] ?? null,
    imposterGuess: shown ? game.imposterGuess : null,
    canReady: game.phase === "reveal" && !game.ready[playerId],
    canClue: game.phase === "clues" && !game.clues[playerId],
    canVote: game.phase === "vote" && !game.votes[playerId],
    canGuess: game.phase === "imposter-guess" && isImposter,
    waitingForGuess:
      game.phase === "imposter-guess" && !isImposter,
  };
}

export function adminView(game) {
  return {
    ...publicView(game),
    controls: controlsFor(game),
    submissions: {
      ready: { count: submittedCount(game.ready), total: game.players.length },
      clues: { count: submittedCount(game.clues), total: game.players.length },
      votes: { count: submittedCount(game.votes), total: game.players.length },
    },
  };
}

function controlsFor(game) {
  if (game.phase === "clues" || game.phase === "discuss") {
    return [control("startVote", "Start voting", "gameAction", "primary")];
  }
  if (game.phase === "vote" || game.phase === "imposter-guess") {
    return [control("skipToResults", "Reveal result")];
  }
  if (game.phase === "results") {
    return [control("nextRound", "Next round", "nextRound", "primary")];
  }
  if (game.phase === "complete") {
    return [control("replay", "Play again", "replay", "primary")];
  }
  return [];
}
