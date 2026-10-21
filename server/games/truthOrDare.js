/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
import crypto from "node:crypto";
import { getCollection } from "../contentStore.js";
import {
  cleanText,
  control,
  gameState,
  pickOne,
  playerInGame,
  publicBase,
  submittedCount,
  shuffle,
} from "./common.js";

export const meta = {
  id: "truth-or-dare",
  name: "Truth or Dare",
  tagline: "Write a truth and a dare. The room decides who faces what.",
  minPlayers: 3,
  maxPlayers: 10,
  maxRounds: 2,
  hasScore: false,
};

function totalTurns(game) {
  return game.players.length * game.maxRounds;
}

export function create(room) {
  const game = gameState(meta, room);
  game.phase = "collect";
  game.round = 1;
  game.submissions = {};
  game.turnOrder = [];
  game.turnIndex = 0;
  game.currentTurn = null;
  game.promptPool = [];
  game.history = [];
  game.completedTurns = 0;
  game.canNextRound = false;
  return game;
}

function fallbackPrompt() {
  if (Math.random() < 0.5) {
    return {
      type: "truth",
      text: pickOne(getCollection("truths"))?.text ?? "What made you laugh today?",
    };
  }
  return {
    type: "dare",
    text: pickOne(getCollection("dares"))?.text ?? "Do your best animal impression.",
  };
}

function startTurn(game) {
  if (game.turnIndex >= game.turnOrder.length) {
    if (game.round < game.maxRounds) {
      game.round += 1;
      game.turnOrder = shuffle(game.players.map((player) => player.id));
      game.turnIndex = 0;
    } else {
      game.phase = "complete";
      game.currentTurn = null;
      game.canNextRound = false;
      return;
    }
  }

  const playerId = game.turnOrder[game.turnIndex];
  const prompt =
    game.promptPool.shift() ?? {
      id: crypto.randomUUID(),
      ...fallbackPrompt(),
    };
  game.phase = "play";
  game.currentTurn = {
    playerId,
    type: prompt.type,
    text: prompt.text,
    round: game.round,
    turnNumber: game.completedTurns + 1,
  };
}

function buildPromptPool(game) {
  const prompts = [];
  for (const player of game.players) {
    const submission = game.submissions[player.id];
    prompts.push({
      id: crypto.randomUUID(),
      type: "truth",
      text: submission.truth,
    });
    prompts.push({
      id: crypto.randomUUID(),
      type: "dare",
      text: submission.dare,
    });
  }
  game.promptPool = shuffle(prompts);
}

function beginPlay(game) {
  buildPromptPool(game);
  game.round = 1;
  game.turnOrder = shuffle(game.players.map((player) => player.id));
  game.turnIndex = 0;
  game.currentTurn = null;
  game.history = [];
  game.completedTurns = 0;
  startTurn(game);
}

function advance(game, skipped) {
  const current = game.currentTurn;
  if (!current) return false;

  game.history.push({
    playerId: current.playerId,
    name:
      game.players.find((player) => player.id === current.playerId)?.name ??
      "Player",
    type: current.type,
    round: current.round,
    skipped,
  });
  game.completedTurns += 1;
  game.currentTurn = null;
  game.turnIndex += 1;
  startTurn(game);
  return true;
}

export function action(room, game, playerId, payload) {
  if (!playerInGame(game, playerId)) {
    return { ok: false, code: "not_in_game", message: "You are not in this game." };
  }

  const type = payload?.type;

  if (type === "submit") {
    if (game.phase !== "collect") {
      return { ok: false, code: "wrong_phase", message: "Submissions are closed." };
    }
    if (game.submissions[playerId]) {
      return { ok: false, code: "already_submitted", message: "Your prompts are already in." };
    }

    const truth = cleanText(payload?.truth, 180);
    const dare = cleanText(payload?.dare, 180);
    if (!truth || !dare) {
      return {
        ok: false,
        code: "incomplete",
        message: "Write both a truth and a dare.",
      };
    }

    game.submissions[playerId] = { truth, dare };
    if (Object.keys(game.submissions).length === game.players.length) {
      beginPlay(game);
    }
    return { ok: true };
  }

  if (type === "done") {
    if (game.phase !== "play" || !game.currentTurn) {
      return { ok: false, code: "wrong_phase", message: "There is no active turn." };
    }
    if (game.currentTurn.playerId !== playerId) {
      return { ok: false, code: "not_your_turn", message: "It is not your turn yet." };
    }
    advance(game, false);
    return { ok: true };
  }

  return { ok: false, code: "unknown_action", message: "Unknown action." };
}

export function adminAction(room, game, type) {
  if (type === "skipTurn") {
    if (game.phase !== "play" || !game.currentTurn) {
      return { ok: false, code: "wrong_phase", message: "There is no active turn." };
    }
    advance(game, true);
    return { ok: true };
  }
  return { ok: false, code: "unknown_action", message: "Unknown host action." };
}

export function nextRound() {
  return {
    ok: false,
    code: "not_applicable",
    message: "Truth or Dare advances one turn at a time.",
  };
}

export function publicView(game) {
  const current = game.currentTurn;
  return {
    ...publicBase(game),
    submittedCount: submittedCount(game.submissions),
    totalPlayers: game.players.length,
    currentPlayerId: current?.playerId ?? null,
    currentPlayerName: current
      ? (game.players.find((player) => player.id === current.playerId)?.name ??
        "Player")
      : null,
    currentType: current?.type ?? null,
    completedTurns: game.completedTurns,
    totalTurns: totalTurns(game),
    history: game.phase === "complete" ? game.history : game.history.slice(-8),
    canNextRound: false,
  };
}

export function playerView(game, playerId) {
  const submission = game.submissions[playerId] ?? null;
  const current = game.currentTurn;
  const isCurrent = current?.playerId === playerId;

  return {
    yourTruth: submission?.truth ?? "",
    yourDare: submission?.dare ?? "",
    submitted: Boolean(submission),
    canSubmit: game.phase === "collect" && !submission,
    isCurrent,
    currentTurn: isCurrent ? current : null,
    waitingForName: current && !isCurrent
      ? (game.players.find((player) => player.id === current.playerId)?.name ??
        "Player")
      : null,
    completedTurns: game.completedTurns,
    totalTurns: totalTurns(game),
  };
}

export function adminView(game) {
  return {
    ...publicView(game),
    controls:
      game.phase === "play"
        ? [control("skipTurn", "Skip turn", "gameAction")]
        : game.phase === "complete"
          ? [control("replay", "Play again", "replay", "primary")]
          : [],
    submissions: {
      prompts: {
        count: submittedCount(game.submissions),
        total: game.players.length,
      },
    },
  };
}
