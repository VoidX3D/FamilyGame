/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
import { getCollection } from "../contentStore.js";
import {
  allSubmitted,
  award,
  completeRound,
  control,
  gameState,
  pickUnused,
  playerInGame,
  roomMemory,
  publicBase,
  setNextRound,
  submittedCount,
} from "./common.js";

export const meta = {
  id: "who-is-it",
  name: "Who Is It?",
  tagline: "One question, one vote. Who fits it best?",
  minPlayers: 3,
  maxPlayers: 10,
  maxRounds: 3,
  hasScore: true,
};

function beginRound(game, round) {
  const [question] = pickUnused(
    getCollection("whoIsItQuestions"),
    game.usedQuestionIds,
    1,
  );
  game.round = round;
  game.question = question?.text ?? "Who is most likely to make everyone laugh?";
  game.phase = "vote";
  game.votes = {};
  game.results = null;
  game.topIds = [];
  game.scored = false;
  game.canNextRound = game.round < game.maxRounds;
}

export function create(room) {
  const game = gameState(meta, room);
  /* The questions a room has already seen are remembered for the whole
   * session, not just this game. Playing the game twice in a game night
   * should not bring the same question back. */
  game.usedQuestionIds = roomMemory(room, "whoIsItQuestions");
  beginRound(game, 1);
  return game;
}

function reveal(game) {
  return game.phase === "results" || game.phase === "complete";
}

function tally(room, game) {
  if (game.scored) return;
  game.scored = true;

  const counts = Object.fromEntries(
    game.players.map((player) => [player.id, 0]),
  );
  for (const targetId of Object.values(game.votes)) {
    if (counts[targetId] !== undefined) counts[targetId] += 1;
  }

  const rows = game.players
    .map((player) => ({
      playerId: player.id,
      name: player.name,
      count: counts[player.id] ?? 0,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const topCount = rows[0]?.count ?? 0;
  game.topIds = rows
    .filter((row) => topCount > 0 && row.count === topCount)
    .map((row) => row.playerId);

  for (const playerId of game.topIds) award(room, playerId, 1);

  game.results = {
    counts: rows,
    voters: game.players
      .filter((player) => game.votes[player.id])
      .map((player) => ({
        voterId: player.id,
        voterName: player.name,
        targetId: game.votes[player.id],
        targetName:
          game.players.find((entry) => entry.id === game.votes[player.id])
            ?.name ?? "Player",
      })),
  };

  completeRound(game);
}

export function action(room, game, playerId, payload) {
  if (!playerInGame(game, playerId)) {
    return { ok: false, code: "not_in_game", message: "You are not in this game." };
  }

  if (payload?.type !== "vote") {
    return { ok: false, code: "unknown_action", message: "Unknown action." };
  }

  if (game.phase !== "vote") {
    return { ok: false, code: "wrong_phase", message: "Voting is closed." };
  }
  if (Object.prototype.hasOwnProperty.call(game.votes, playerId)) {
    return { ok: false, code: "already_voted", message: "You already voted." };
  }

  const targetId = String(payload?.targetId ?? "");
  if (targetId === playerId || !playerInGame(game, targetId)) {
    return { ok: false, code: "invalid_target", message: "Choose another player." };
  }

  game.votes[playerId] = targetId;
  if (allSubmitted(game.votes, game.players)) tally(room, game);
  return { ok: true };
}

export function adminAction() {
  return { ok: false, code: "unknown_action", message: "The host has no action here." };
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
  return {
    ...publicBase(game),
    question: game.question,
    votedCount: submittedCount(game.votes),
    totalPlayers: game.players.length,
    results: shown ? game.results : null,
    topIds: shown ? game.topIds : [],
    topNames: shown
      ? game.players
          .filter((player) => game.topIds.includes(player.id))
          .map((player) => player.name)
      : [],
    canNextRound: game.phase === "results",
  };
}

export function playerView(game, playerId) {
  return {
    yourVote: game.votes[playerId] ?? null,
    canVote:
      game.phase === "vote" &&
      !Object.prototype.hasOwnProperty.call(game.votes, playerId),
    waiting: game.phase === "vote" && game.votes[playerId],
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
          : [],
    submissions: {
      votes: { count: submittedCount(game.votes), total: game.players.length },
    },
  };
}
