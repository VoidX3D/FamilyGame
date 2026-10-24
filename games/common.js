/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
import crypto from "node:crypto";

export function shuffle(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = crypto.randomInt(index + 1);
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export function pickOne(values) {
  if (values.length === 0) return null;
  return values[crypto.randomInt(values.length)];
}

export function pickUnused(items, usedIds, count = 1) {
  const available = items.filter((item) => !usedIds.includes(item.id));
  const pool = available.length >= count ? available : items;
  const picked = shuffle(pool).slice(0, count);
  for (const item of picked) {
    if (!usedIds.includes(item.id)) usedIds.push(item.id);
  }
  return picked;
}

/* The content a room has already used, remembered for the whole session
 * rather than for one game.
 *
 * Without this, every game starts at the top of the pool, so the same
 * question turns up again in the next game of a game night. The memory is
 * keyed by the content collection, so the words, the questions, the
 * prompts and the people each keep their own history. */
export function roomMemory(room, key) {
  room.usedContentIds ??= {};
  room.usedContentIds[key] ??= [];
  return room.usedContentIds[key];
}

export function cleanText(value, maxLength = 180) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return Array.from(text).slice(0, maxLength).join("");
}

/* Turns an answer into the form that is compared.
 *
 * Everything that should not make two answers different is taken out here,
 * once, so every game compares the same way:
 *
 * - case: "Cactus", "cactus", "CACTUS" and "CaCtUs" are the same word,
 * - punctuation and spacing: "hot dog", "Hot-Dog!" and "hotdog" are the
 *   same,
 * - an ampersand is an "and": "rock & roll" is "rock and roll",
/* - an accent is optional: "cafe" is "café".
 *
 * The accent folding is only applied to Latin letters. The content has
 * Nepali in it, and Devanagari writes its vowels as marks on the letter,
 * so folding those away would turn a name into a different name. The
 * marks are kept in the last step too, for the same reason.
 */
export function normalizeAnswer(value) {
  return String(value ?? "")
    .toLocaleLowerCase()
    .replace(/&/g, " and ")
    .replace(/\p{Script=Latin}+/gu, (chunk) =>
      chunk.normalize("NFD").replace(/\p{M}/gu, ""),
    )
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, "");
}

export function answerMatches(guess, item) {
  const normalized = normalizeAnswer(guess);
  if (!normalized) return false;
  const candidates = [item.name, ...(item.aliases ?? [])];
  return candidates.some((candidate) => {
    if (normalizeAnswer(candidate) === normalized) return true;

    /* A person's family name is a useful answer when the full name is
     * displayed, but a single partial word is too permissive. Accept a
     * two-or-more-word suffix such as “Da Vinci” for “Leonardo da Vinci”.
     * Content aliases still remain the preferred way to define exceptions. */
    const words = String(candidate ?? "").trim().split(/\s+/).filter(Boolean);
    if (words.length < 3) return false;
    for (let start = 1; start < words.length - 1; start += 1) {
      if (normalizeAnswer(words.slice(start).join(" ")) === normalized) return true;
    }
    return false;
  });
}

export function gameState(meta, room) {
  return {
    id: meta.id,
    name: meta.name,
    tagline: meta.tagline,
    minPlayers: meta.minPlayers,
    maxPlayers: meta.maxPlayers,
    maxRounds: meta.maxRounds,
    hasScore: meta.hasScore !== false,
    round: 1,
    phase: "start",
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
    })),
    startedAt: Date.now(),
    canNextRound: false,
    isFinal: false,
  };
}

export function publicBase(game) {
  return {
    id: game.id,
    name: game.name,
    tagline: game.tagline,
    minPlayers: game.minPlayers,
    maxPlayers: game.maxPlayers,
    round: game.round,
    maxRounds: game.maxRounds,
    phase: game.phase,
    hasScore: game.hasScore,
    players: game.players,
    canNextRound: game.round < game.maxRounds,
    isFinal: game.round >= game.maxRounds,
    // Identifies this specific run of the game. A replay creates a new
    // instance, so clients can scope drafts to it instead of reusing text
    // from the previous run.
    startedAt: game.startedAt ?? 0,
  };
}

export function playerInGame(game, playerId) {
  return game.players.some((player) => player.id === playerId);
}

export function playerName(game, playerId) {
  return game.players.find((player) => player.id === playerId)?.name ?? "Player";
}

export function submittedCount(record) {
  return Object.keys(record ?? {}).length;
}

export function allSubmitted(record, players) {
  return players.every((player) =>
    Object.prototype.hasOwnProperty.call(record ?? {}, player.id),
  );
}

export function otherPlayers(game, playerId) {
  return game.players.filter((player) => player.id !== playerId);
}

export function award(room, playerId, points = 1) {
  room.scores[playerId] = (room.scores[playerId] ?? 0) + points;
  room.sessionScores ??= {};
  room.sessionScores[playerId] = (room.sessionScores[playerId] ?? 0) + points;
}

export function completeRound(game) {
  game.canNextRound = game.round < game.maxRounds;
  game.phase = game.canNextRound ? "results" : "complete";
}

export function setNextRound(game) {
  if (game.round >= game.maxRounds) {
    game.phase = "complete";
    return false;
  }
  game.round += 1;
  game.canNextRound = game.round < game.maxRounds;
  return true;
}

export function control(id, label, event = "gameAction", tone = "tonal", extra = {}) {
  return { id, label, event, tone, ...extra };
}
