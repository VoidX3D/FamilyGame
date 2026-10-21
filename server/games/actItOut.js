/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
import { getCollection } from "../contentStore.js";
import {
  award,
  control,
  gameState,
  pickUnused,
  playerInGame,
  roomMemory,
  playerName,
  publicBase,
  shuffle,
} from "./common.js";

/* Act It Out: one actor per turn, no timer.
 *
 * The actor privately sees the prompt and category. Everyone else sees the
 * category. The room shouts guesses; the actor taps the first correct
 * guesser. The guesser and the actor each score one point.
 */

export const meta = {
  id: "act-it-out",
  name: "Act It Out",
  tagline: "One actor, one secret prompt. Can the room guess it?",
  minPlayers: 3,
  maxPlayers: 10,
  maxRounds: 0,
  hasScore: true,
  oneTurnEach: true,
};

const FALLBACK_PROMPT = {
  id: "fallback-charade",
  text: "Making momos",
  category: "Food",
};

function currentActor(game) {
  return (
    game.players.find((player) => player.id === game.turnOrder[game.turnIndex]) ??
    null
  );
}

function beginTurn(game) {
  const actor = currentActor(game);
  if (!actor) {
    game.phase = "complete";
    game.actorId = null;
    return;
  }

  const [prompt] = pickUnused(
    getCollection("charades"),
    game.usedPromptIds,
    1,
  );

  game.phase = "act";
  game.actorId = actor.id;
  game.prompt = prompt ?? FALLBACK_PROMPT;
  game.result = null;
  game.scored = false;
  game.turnStartedAt = Date.now();
}

export function create(room) {
  const game = gameState(meta, room);
  game.turnOrder = shuffle(game.players.map((player) => player.id));
  game.turnIndex = 0;
  // The prompts a room has already used, for the whole session.
  game.usedPromptIds = roomMemory(room, "charades");
  game.history = [];
  game.skippedPrompts = [];
  game.prompt = null;
  game.actorId = null;
  game.result = null;
  game.scored = false;
  beginTurn(game);
  return game;
}

function reveal(game) {
  return game.phase === "results" || game.phase === "complete";
}

function otherPlayers(game) {
  return game.players.filter((player) => player.id !== game.actorId);
}

function finishTurn(
  room,
  game,
  { guesserId = null, gaveUp = false, skippedByHost = false } = {},
) {
  if (game.phase !== "act" || game.scored) return null;

  const actor = currentActor(game);
  const guesser = guesserId
    ? game.players.find((player) => player.id === guesserId) ?? null
    : null;

  let points = 0;
  if (actor && guesser && guesser.id !== actor.id) {
    award(room, guesser.id, 1);
    award(room, actor.id, 1);
    points = 1;
  }

  game.scored = true;
  game.phase = "results";
  game.result = {
    actorId: actor?.id ?? null,
    actorName: actor?.name ?? "Player",
    guesserId: guesser?.id ?? null,
    guesserName: guesser?.name ?? null,
    prompt: game.prompt,
    category: game.prompt?.category ?? "Fun",
    correct: Boolean(guesser),
    gaveUp: Boolean(gaveUp),
    skippedByHost: Boolean(skippedByHost),
    points: points ? { guesser: 1, actor: 1 } : { guesser: 0, actor: 0 },
  };

  game.history.push({
    actorId: actor?.id ?? null,
    actorName: actor?.name ?? "Player",
    guesserId: guesser?.id ?? null,
    guesserName: guesser?.name ?? null,
    prompt: game.prompt?.text ?? "",
    category: game.prompt?.category ?? "Fun",
    correct: Boolean(guesser),
    gaveUp: Boolean(gaveUp),
    skippedByHost: Boolean(skippedByHost),
    at: Date.now(),
  });
  game.history = game.history.slice(-40);

  return game.result;
}

function advanceTurn(game) {
  if (game.turnIndex + 1 >= game.turnOrder.length) {
    game.phase = "complete";
    return;
  }
  game.turnIndex += 1;
  beginTurn(game);
}

function safePrompt(prompt) {
  if (!prompt) return null;
  return {
    id: prompt.id,
    text: prompt.text,
    category: prompt.category ?? "Fun",
  };
}

function safeResult(result) {
  if (!result) return null;
  return {
    actorId: result.actorId,
    actorName: result.actorName,
    guesserId: result.guesserId,
    guesserName: result.guesserName,
    prompt: safePrompt(result.prompt),
    category: result.category,
    correct: Boolean(result.correct),
    gaveUp: Boolean(result.gaveUp),
    skippedByHost: Boolean(result.skippedByHost),
    points: result.points,
  };
}

export function action(room, game, playerId, payload) {
  if (!playerInGame(game, playerId)) {
    return { ok: false, code: "not_in_game", message: "You are not in this game." };
  }

  const isActor = playerId === game.actorId;
  const type = payload?.type;

  if (type === "skipPrompt") {
    if (!isActor) {
      return { ok: false, code: "not_actor", message: "Only the actor can change the prompt." };
    }
    if (game.phase !== "act") {
      return { ok: false, code: "wrong_phase", message: "This turn is already finished." };
    }

    game.skippedPrompts.push(game.prompt?.text ?? "-");
    game.skippedPrompts = game.skippedPrompts.slice(-30);
    const [prompt] = pickUnused(
      getCollection("charades"),
      game.usedPromptIds,
      1,
    );
    game.prompt = prompt ?? FALLBACK_PROMPT;
    return { ok: true, prompt: safePrompt(game.prompt) };
  }

  if (type === "giveUp") {
    if (!isActor) {
      return { ok: false, code: "not_actor", message: "Only the actor can end the turn." };
    }
    if (game.phase !== "act") {
      return { ok: false, code: "wrong_phase", message: "This turn is already finished." };
    }
    finishTurn(room, game, { gaveUp: true });
    return { ok: true };
  }

  if (type === "correct") {
    if (!isActor) {
      return {
        ok: false,
        code: "not_actor",
        message: "Only the actor can choose the winning guesser.",
      };
    }
    if (game.phase !== "act") {
      return { ok: false, code: "wrong_phase", message: "This turn is already finished." };
    }

    const guesserId = payload?.playerId ?? payload?.targetId;
    const guesser = game.players.find((player) => player.id === guesserId);
    if (!guesser) {
      return {
        ok: false,
        code: "unknown_player",
        message: "Choose a player from this game.",
      };
    }
    if (guesser.id === game.actorId) {
      return {
        ok: false,
        code: "actor_cannot_guess",
        message: "The actor cannot be the winning guesser.",
      };
    }

    finishTurn(room, game, { guesserId: guesser.id });
    return { ok: true };
  }

  if (type === "next") {
    if (!isActor) {
      return { ok: false, code: "not_actor", message: "Only the actor can continue." };
    }
    if (game.phase !== "results") {
      return { ok: false, code: "wrong_phase", message: "The turn is not finished." };
    }
    advanceTurn(game);
    return { ok: true };
  }

  return { ok: false, code: "unknown_action", message: "Unknown action." };
}

export function adminAction(room, game, type) {
  if (type === "skipPrompt") {
    if (game.phase !== "act") {
      return { ok: false, code: "wrong_phase", message: "There is no active prompt." };
    }
    game.skippedPrompts.push(game.prompt?.text ?? "-");
    game.skippedPrompts = game.skippedPrompts.slice(-30);
    const [prompt] = pickUnused(
      getCollection("charades"),
      game.usedPromptIds,
      1,
    );
    game.prompt = prompt ?? FALLBACK_PROMPT;
    return { ok: true };
  }

  if (type === "reveal") {
    if (game.phase !== "act") {
      return { ok: false, code: "wrong_phase", message: "There is nothing to reveal." };
    }
    finishTurn(room, game, { gaveUp: true, skippedByHost: true });
    return { ok: true };
  }

  if (type === "skipTurn") {
    if (game.phase !== "act") {
      return { ok: false, code: "wrong_phase", message: "There is no active turn." };
    }
    finishTurn(room, game, { skippedByHost: true });
    advanceTurn(game);
    return { ok: true };
  }

  if (type === "nextTurn") {
    if (game.phase !== "results") {
      return { ok: false, code: "wrong_phase", message: "The turn is not finished." };
    }
    advanceTurn(game);
    return { ok: true };
  }

  if (type === "finish") {
    if (game.phase === "complete") {
      return { ok: false, code: "already_complete", message: "The game is already complete." };
    }
    if (game.phase === "act") {
      finishTurn(room, game, { gaveUp: true, skippedByHost: true });
    }
    game.phase = "complete";
    return { ok: true };
  }

  return { ok: false, code: "unknown_action", message: "Unknown host action." };
}

export function nextRound(room, game) {
  return adminAction(room, game, "nextTurn");
}

export function publicView(game) {
  const actor = game.players.find((player) => player.id === game.actorId) ?? null;
  const shown = reveal(game);

  return {
    ...publicBase(game),
    round: game.turnIndex + 1,
    maxRounds: game.turnOrder?.length ?? game.players.length,
    canNextRound: false,
    isFinal: false,
    oneTurnEach: true,
    actorId: game.actorId,
    actorName: actor?.name ?? playerName(game, game.actorId),
    category: game.prompt?.category ?? "Fun",
    turnNumber: game.turnIndex + 1,
    totalTurns: game.turnOrder?.length ?? game.players.length,
    prompt: shown ? safePrompt(game.prompt) : null,
    result: shown ? safeResult(game.result) : null,
    history: game.history ?? [],
    skippedPromptCount: game.skippedPrompts?.length ?? 0,
  };
}

export function playerView(game, playerId) {
  const isActor = playerId === game.actorId;
  const shown = reveal(game);

  return {
    isActor,
    actorId: game.actorId,
    actorName: playerName(game, game.actorId),
    category: game.prompt?.category ?? "Fun",
    turnNumber: game.turnIndex + 1,
    totalTurns: game.turnOrder?.length ?? game.players.length,
    yourPrompt: isActor && game.phase === "act" ? safePrompt(game.prompt) : null,
    prompt: shown ? safePrompt(game.prompt) : null,
    canAct: isActor && game.phase === "act",
    canSkipPrompt: isActor && game.phase === "act",
    canGiveUp: isActor && game.phase === "act",
    canNext: isActor && game.phase === "results",
    guessChoices:
      isActor && game.phase === "act"
        ? otherPlayers(game).map((player) => ({
            id: player.id,
            name: player.name,
          }))
        : [],
    result: shown ? safeResult(game.result) : null,
    history: game.history ?? [],
    waiting: !isActor && game.phase === "act",
  };
}

export function adminView(game, room) {
  const controls = [];
  if (game.phase === "act") {
    controls.push(control("skipPrompt", "Skip prompt", "gameAction", "tonal"));
    controls.push(control("reveal", "Reveal answer", "gameAction", "tonal"));
    controls.push(control("skipTurn", "Skip actor", "gameAction", "text"));
  }
  if (game.phase === "results") {
    controls.push(control("nextTurn", "Next actor", "gameAction", "primary"));
  }
  if (game.phase !== "complete") {
    controls.push(control("finish", "Finish game", "gameAction", "text"));
  }
  if (game.phase === "complete" && !room?.playlist?.active) {
    controls.push(control("replay", "Play again", "replay", "primary"));
  }

  return {
    ...publicView(game),
    prompt: safePrompt(game.prompt),
    result: safeResult(game.result),
    history: game.history ?? [],
    controls,
    submissions: {
      turns: {
        count: game.history?.length ?? 0,
        total: game.turnOrder?.length ?? game.players.length,
      },
      skippedPrompts: {
        count: game.skippedPrompts?.length ?? 0,
        total: null,
      },
    },
  };
}
