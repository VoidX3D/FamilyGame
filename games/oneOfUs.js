/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
import { getCollection } from "../contentStore.js";
import {
  allSubmitted,
  award,
  completeRound,
  control,
  gameState,
  normalizeAnswer,
  pickOne,
  pickUnused,
  playerInGame,
  playerName,
  publicBase,
  roomMemory,
  setNextRound,
  shuffle,
  submittedCount,
} from "./common.js";

/* One of Us: everyone gets the same secret word, one of them is faking
 * it.
 *
 * The clues are spoken out loud, not typed. The screen only keeps the
 * room in step: it shows whose turn it is to speak, and when they are
 * done the next phone lights up. After two rounds of hints the room goes
 * straight to the vote on its own, so the host never has to touch
 * anything.
 */

export const meta = {
  id: "one-of-us",
  name: "One of Us",
  tagline: "One player is faking it. Give clues, find the imposter.",
  minPlayers: 3,
  maxPlayers: 10,
  maxRounds: 3,
  hasScore: true,
};

const HINT_ROUNDS = 2;

function beginRound(game, round) {
  const [word] = pickUnused(getCollection("oneOfUsWords"), game.usedWordIds, 1);

  game.round = round;
  game.word = word?.word ?? "Momos";
  game.category = word?.category ?? "Food";
  game.imposterId = pickOne(game.players)?.id ?? null;
  game.phase = "reveal";
  game.ready = {};

  // The speaking order. It is reshuffled for the second round so the same
  // person does not always go first.
  game.hintOrder = shuffle(game.players.map((player) => player.id));
  game.hintIndex = 0;
  game.hintRound = 1;
  game.hintRounds = HINT_ROUNDS;
  game.speakerId = game.hintOrder[0] ?? null;
  game.spoken = [];
  game.spokenTotal = 0;

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
  // The words a room has already used, for the whole session.
  game.usedWordIds = roomMemory(room, "oneOfUsWords");
  beginRound(game, 1);
  return game;
}

function reveal(game) {
  return game.phase === "results" || game.phase === "complete";
}

function finish(room, game, winner, outcomeReason = null) {
  if (game.scored) return;
  game.scored = true;
  game.winner = winner;
  game.outcomeReason = outcomeReason;

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
  game.decisiveVote = top.length === 1;

  if (caught) {
    game.phase = "imposter-guess";
  } else {
    /* Two different things can happen here, and the room deserves to be
     * told which one it was. A tie means nobody stood out. A clear vote
     * for somebody who was not the imposter means the room was wrong,
     * which is not the same thing at all. */
    finish(
      room,
      game,
      "imposter",
      top.length > 1 ? "vote_tie" : "wrong_vote",
    );
  }
}

/* Hands the turn to the next speaker, and moves the game on when the
 * hints are done. After the last round the room votes by itself. */
function nextSpeaker(game) {
  game.hintIndex += 1;

  if (game.hintIndex < game.hintOrder.length) {
    game.speakerId = game.hintOrder[game.hintIndex];
    return;
  }

  if (game.hintRound < game.hintRounds) {
    game.hintRound += 1;
    game.hintOrder = shuffle(game.players.map((player) => player.id));
    game.hintIndex = 0;
    game.speakerId = game.hintOrder[0] ?? null;
    game.spoken = [];
    return;
  }

  // Both rounds of hints are done. The vote starts on its own.
  game.phase = "vote";
  game.speakerId = null;
  game.votes = {};
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
    if (allSubmitted(game.ready, game.players)) {
      game.phase = "hints";
    }
    return { ok: true };
  }

  /* The current speaker says their clue out loud and hands the turn on. */
  if (type === "nextHint") {
    if (game.phase !== "hints") {
      return { ok: false, code: "wrong_phase", message: "It is not the hint round." };
    }
    if (playerId !== game.speakerId) {
      return {
        ok: false,
        code: "not_speaker",
        message: "It is not your turn to speak.",
      };
    }

    game.spoken.push(playerId);
    game.spokenTotal = (game.spokenTotal ?? 0) + 1;
    nextSpeaker(game);
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

    const guess = String(payload?.guess ?? "").trim();
    if (!guess) {
      return { ok: false, code: "empty_guess", message: "Type your guess first." };
    }

    game.imposterGuess = guess;
    const correct = normalizeAnswer(guess) === normalizeAnswer(game.word);
    finish(room, game, correct ? "imposter" : "crew", correct ? "imposter_guessed_word" : "imposter_wrong_guess");
    return { ok: true };
  }

  return { ok: false, code: "unknown_action", message: "Unknown action." };
}

export function adminAction(room, game, type) {
  /* The host does not start the vote. It starts by itself when the hints
   * are done. The host can still step over a stuck speaker. */
  if (type === "skipSpeaker") {
    if (game.phase !== "hints") {
      return { ok: false, code: "wrong_phase", message: "Nobody is speaking." };
    }
    nextSpeaker(game);
    return { ok: true };
  }

  if (type === "skipToResults") {
    if (game.phase === "vote") {
      tallyVotes(room, game);
      if (game.phase === "imposter-guess") {
        game.imposterGuess = "(No guess)";
        finish(room, game, "imposter", "no_guess");
      }
      return { ok: true };
    }
    if (game.phase === "imposter-guess") {
      game.imposterGuess = "(No guess)";
      finish(room, game, "imposter", "no_guess");
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
  const speaker = game.players.find((player) => player.id === game.speakerId);

  return {
    ...publicBase(game),
    phase: game.phase,
    category: game.category,
    readyCount: submittedCount(game.ready),
    voteCount: submittedCount(game.votes),
    totalPlayers: game.players.length,
    speakerId: game.speakerId,
    speakerName: speaker?.name ?? null,
    hintRound: game.hintRound,
    hintRounds: game.hintRounds,
    spokenCount: game.spoken?.length ?? 0,
    totalSpeakers: game.hintOrder?.length ?? game.players.length,
    winner: shown ? game.winner : null,
    caught: shown ? game.caught : null,
    word: shown ? game.word : null,
    imposterId: shown ? game.imposterId : null,
    imposterName: shown ? playerName(game, game.imposterId) : null,
    imposterGuess: shown ? game.imposterGuess : null,
    outcomeReason: shown ? game.outcomeReason : null,
    decisiveVote: shown ? game.decisiveVote : null,
    voteCounts: shown ? game.voteCounts : null,
    voteBreakdown: shown ? game.voteBreakdown : null,
    canNextRound: game.phase === "results",
  };
}

export function playerView(game, playerId) {
  const isImposter = playerId === game.imposterId;
  const shown = reveal(game);
  const isSpeaker = playerId === game.speakerId;

  return {
    role: isImposter ? "imposter" : "crew",
    isImposter,
    word: isImposter && !shown ? null : game.word,
    category: game.category,
    ready: Boolean(game.ready[playerId]),
    yourVote: game.votes[playerId] ?? null,
    imposterGuess: shown ? game.imposterGuess : null,
    canReady: game.phase === "reveal" && !game.ready[playerId],
    isSpeaker,
    canNextHint: isSpeaker && game.phase === "hints",
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
      hints: {
        count: game.spokenTotal ?? game.spoken?.length ?? 0,
        total: (game.hintOrder?.length ?? 0) * (game.hintRounds ?? HINT_ROUNDS),
      },
      votes: { count: submittedCount(game.votes), total: game.players.length },
    },
  };
}

function controlsFor(game) {
  if (game.phase === "hints") {
    return [control("skipSpeaker", "Skip this speaker", "gameAction", "tonal")];
  }
  if (game.phase === "vote" || game.phase === "imposter-guess") {
    return [control("skipToResults", "Reveal result", "gameAction")];
  }
  if (game.phase === "results") {
    return [control("nextRound", "Next round", "nextRound", "primary")];
  }
  if (game.phase === "complete") {
    return [control("replay", "Play again", "replay", "primary")];
  }
  return [];
}
