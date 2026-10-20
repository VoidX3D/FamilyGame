/* PARKED PROTOTYPE — not registered in the active game catalog.
 *
 * Number? is intentionally incomplete. The number-generation rules are still
 * being designed (huge ranges, digit styles, turn-based higher/lower), so this
 * engine is kept only as a starting point for a future version.
 *
 * Do not import this file from server/games/index.js or include it in active
 * smoke tests until the rules are settled.
 */

import {
  award,
  completeRound,
  control,
  gameState,
  playerInGame,
  publicBase,
  setNextRound,
  shuffle,
  submittedCount,
} from "../server/games/common.js";

export const meta = {
  id: "number",
  name: "Number?",
  tagline: "Wear a number you cannot see, then guess your own.",
  minPlayers: 3,
  maxPlayers: 10,
  maxRounds: 3,
  hasScore: true,
};

function groupKey(group) {
  return [...group].sort().join("|");
}

function makeGroups(players, previousKeys) {
  if (players.length === 3) {
    return {
      groups: [players.map((player) => player.id)],
      keys: [groupKey(players.map((player) => player.id))],
    };
  }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const order = shuffle(players.map((player) => player.id));
    const groups = [];
    for (let index = 0; index < order.length; index += 2) {
      const group = order.slice(index, index + 2);
      if (group.length === 1 && groups.length > 0) {
        groups[groups.length - 1].push(group[0]);
      } else {
        groups.push(group);
      }
    }

    const keys = groups.map(groupKey);
    if (!keys.some((key) => previousKeys.includes(key))) {
      return { groups, keys };
    }
  }

  const order = shuffle(players.map((player) => player.id));
  const groups = [];
  for (let index = 0; index < order.length; index += 2) {
    const group = order.slice(index, index + 2);
    if (group.length === 1 && groups.length > 0) {
      groups[groups.length - 1].push(group[0]);
    } else {
      groups.push(group);
    }
  }
  return { groups, keys: groups.map(groupKey) };
}

function beginRound(game, round) {
  game.round = round;
  game.phase = "guess";
  game.guesses = {};
  game.results = null;
  game.scored = false;
  game.canNextRound = game.round < game.maxRounds;

  const { groups, keys } = makeGroups(game.players, game.previousKeys ?? []);
  game.groups = groups;
  game.previousKeys = [...(game.previousKeys ?? []), ...keys];

  const numbers = shuffle(
    Array.from({ length: 20 }, (_, index) => index + 1),
  ).slice(0, game.players.length);

  game.numbers = Object.fromEntries(
    game.players.map((player, index) => [player.id, numbers[index]]),
  );
}

export function create(room) {
  const game = gameState(meta, room);
  game.previousKeys = [];
  beginRound(game, 1);
  return game;
}

function reveal(game) {
  return game.phase === "results" || game.phase === "complete";
}

function tally(room, game) {
  if (game.scored) return;
  game.scored = true;

  game.results = game.players
    .map((player) => {
      const number = game.numbers[player.id];
      const guess = game.guesses[player.id] ?? null;
      const correct = guess === number;
      if (correct) award(room, player.id, 1);
      return {
        playerId: player.id,
        name: player.name,
        number,
        guess,
        correct,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  completeRound(game);
}

export function action(room, game, playerId, payload) {
  if (!playerInGame(game, playerId)) {
    return { ok: false, code: "not_in_game", message: "You are not in this game." };
  }

  if (payload?.type !== "guess") {
    return { ok: false, code: "unknown_action", message: "Unknown action." };
  }

  if (game.phase !== "guess") {
    return { ok: false, code: "wrong_phase", message: "Guessing is closed." };
  }
  if (Object.prototype.hasOwnProperty.call(game.guesses, playerId)) {
    return { ok: false, code: "already_guessed", message: "Your guess is locked in." };
  }

  const guess = Number(payload?.guess);
  if (!Number.isInteger(guess) || guess < 1 || guess > 20) {
    return {
      ok: false,
      code: "invalid_guess",
      message: "Choose a whole number from 1 to 20.",
    };
  }

  game.guesses[playerId] = guess;
  if (Object.keys(game.guesses).length === game.players.length) {
    tally(room, game);
  }
  return { ok: true };
}

export function adminAction(room, game, type) {
  if (type === "skipToResults") {
    if (game.phase !== "guess") {
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
  const shown = reveal(game);
  return {
    ...publicBase(game),
    groups: game.groups,
    guessedCount: submittedCount(game.guesses),
    totalPlayers: game.players.length,
    results: shown ? game.results : null,
    canNextRound: game.phase === "results",
  };
}

export function playerView(game, playerId) {
  const shown = reveal(game);
  const myGroup = game.groups?.find((group) => group.includes(playerId)) ?? [];
  const partners = myGroup.filter((id) => id !== playerId);

  return {
    yourNumber: shown ? game.numbers[playerId] : null,
    yourGuess: game.guesses[playerId] ?? null,
    canGuess:
      game.phase === "guess" &&
      !Object.prototype.hasOwnProperty.call(game.guesses, playerId),
    waiting:
      game.phase === "guess" &&
      Object.prototype.hasOwnProperty.call(game.guesses, playerId),
    partners: partners.map((id) => ({
      id,
      name: game.players.find((player) => player.id === id)?.name ?? "Player",
    })),
    others: game.players
      .filter((player) => player.id !== playerId)
      .map((player) => ({
        id: player.id,
        name: player.name,
        number: game.numbers[player.id],
        isPartner: partners.includes(player.id),
      })),
    yourCorrect:
      shown &&
      game.guesses[playerId] !== undefined &&
      game.guesses[playerId] === game.numbers[playerId],
  };
}

export function adminView(game) {
  return {
    ...publicView(game),
    controls:
      game.phase === "guess"
        ? [control("skipToResults", "Reveal result")]
        : game.phase === "results"
          ? [control("nextRound", "Next round", "nextRound", "primary")]
          : game.phase === "complete"
            ? [control("replay", "Play again", "replay", "primary")]
            : [],
    submissions: {
      guesses: {
        count: submittedCount(game.guesses),
        total: game.players.length,
      },
    },
  };
}
