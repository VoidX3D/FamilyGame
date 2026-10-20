import crypto from "node:crypto";
import { config } from "./config.js";
import {
  makeRoomCode,
  makeToken,
  normalizeCode,
  normalizeName,
  now,
} from "./util.js";

export class RoomStore {
  constructor() {
    this.rooms = new Map();
    this.adminRooms = new Map();
  }

  get size() {
    return this.rooms.size;
  }

  /* How many players are in the room right now, across every room. */
  playerCount() {
    let total = 0;
    for (const room of this.rooms.values()) {
      total += room.players.length;
    }
    return total;
  }

  createRoom(adminToken) {
    let code;
    do {
      code = makeRoomCode(config.roomCodeLength);
    } while (this.rooms.has(code));

    const room = {
      code,
      adminToken,
      createdAt: now(),
      lastActivity: now(),
      phase: "lobby",
      gameId: null,
      game: null,
      locked: false,
      history: [],
      players: [],
      scores: {},
      sessionScores: {},
      playlist: null,
    };

    this.rooms.set(code, room);
    this.adminRooms.set(adminToken, code);
    return room;
  }

  getOrCreateRoom(adminToken) {
    return this.roomForAdmin(adminToken) ?? this.createRoom(adminToken);
  }

  getRoom(code) {
    return this.rooms.get(normalizeCode(code)) ?? null;
  }

  roomForAdmin(adminToken) {
    const code = this.adminRooms.get(adminToken);
    if (!code) return null;
    const room = this.rooms.get(code);
    if (!room) {
      this.adminRooms.delete(adminToken);
      return null;
    }
    return room;
  }

  ownsRoom(adminToken, room) {
    return Boolean(room) && room.adminToken === adminToken;
  }

  touch(room) {
    room.lastActivity = now();
  }

  connectedCount(room) {
    return room.players.reduce(
      (count, player) => count + (player.connected ? 1 : 0),
      0,
    );
  }

  findPlayerByName(room, name) {
    const key = name.toLocaleLowerCase();
    return (
      room.players.find(
        (player) => player.name.toLocaleLowerCase() === key,
      ) ?? null
    );
  }

  findPlayerById(room, playerId) {
    return room.players.find((player) => player.id === playerId) ?? null;
  }

  findPlayerByToken(room, token) {
    return room.players.find((player) => player.token === token) ?? null;
  }

  findPlayerBySocket(room, socketId) {
    return room.players.find((player) => player.socketId === socketId) ?? null;
  }

  join(room, name, socketId) {
    if (room.phase !== "lobby") {
      return {
        ok: false,
        code: "game_started",
        message: "This game has already started.",
      };
    }

    if (room.locked) {
      return {
        ok: false,
        code: "room_locked",
        message: "The host has locked this room.",
      };
    }

    if (room.players.length >= config.maxPlayers) {
      return {
        ok: false,
        code: "room_full",
        message: "This room is already full.",
      };
    }

    const cleanName = normalizeName(name);
    if (!cleanName) {
      return {
        ok: false,
        code: "invalid_name",
        message: "Enter a name between 1 and 16 characters.",
      };
    }

    if (this.findPlayerByName(room, cleanName)) {
      return {
        ok: false,
        code: "name_taken",
        message: "That name is already in the room.",
      };
    }

    const player = {
      id: crypto.randomUUID(),
      token: makeToken(24),
      name: cleanName,
      connected: true,
      socketId,
      joinedAt: now(),
      lastSeenAt: now(),
    };

    room.players.push(player);
    room.scores[player.id] = 0;
    room.sessionScores[player.id] = 0;
    this.touch(room);

    return { ok: true, player };
  }

  resume(room, token, socketId) {
    const player = this.findPlayerByToken(room, token);
    if (!player) {
      return {
        ok: false,
        code: "invalid_token",
        message: "Your seat is no longer available. Rejoin with the room code.",
      };
    }

    const previousSocketId = player.socketId;
    player.connected = true;
    player.socketId = socketId;
    player.lastSeenAt = now();
    this.touch(room);

    return { ok: true, player, previousSocketId };
  }

  disconnect(socketId) {
    for (const room of this.rooms.values()) {
      const player = room.players.find(
        (candidate) => candidate.socketId === socketId,
      );
      if (!player) continue;

      player.connected = false;
      player.socketId = null;
      player.lastSeenAt = now();
      this.touch(room);
      return { room, player };
    }
    return null;
  }

  removePlayer(room, playerId) {
    const index = room.players.findIndex((player) => player.id === playerId);
    if (index === -1) return null;

    const [player] = room.players.splice(index, 1);
    delete room.scores[player.id];
    delete room.sessionScores[player.id];
    this.touch(room);
    return player;
  }

  setLocked(room, locked) {
    room.locked = Boolean(locked);
    this.touch(room);
  }

  resetScores(room) {
    for (const player of room.players) room.scores[player.id] = 0;
  }

  resetSessionScores(room) {
    for (const player of room.players) room.sessionScores[player.id] = 0;
  }

  resetAllScores(room) {
    this.resetScores(room);
    this.resetSessionScores(room);
  }

  gameEntry(room, reason = "ended") {
    if (!room.game) return null;

    const participants = new Set(
      (room.game.players ?? []).map((player) => player.id),
    );

    const scoreRows = (scores) =>
      room.players
        .map((player) => ({
          playerId: player.id,
          name: player.name,
          points: scores[player.id] ?? 0,
          played: participants.has(player.id),
        }))
        .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

    return {
      gameId: room.gameId,
      name: room.game.name,
      finishedAt: now(),
      round: room.game.round,
      maxRounds: room.game.maxRounds,
      reason,
      scores: scoreRows(room.scores),
      sessionScores: scoreRows(room.sessionScores),
    };
  }

  archiveGame(room, reason = "ended") {
    const entry = this.gameEntry(room, reason);
    if (!entry) return null;
    room.history.unshift(entry);
    room.history = room.history.slice(0, 12);
    this.touch(room);
    return entry;
  }

  finishGame(room, reason = "ended") {
    const entry = this.archiveGame(room, reason);
    if (!entry) return null;

    room.phase = "lobby";
    room.gameId = null;
    room.game = null;
    this.touch(room);
    return entry;
  }

  playlistSummary(room) {
    const playlist = room.playlist;
    if (!playlist) return null;

    const queue = playlist.queue.map((entry, index) => ({
      gameId: entry.gameId,
      name: entry.name,
      status:
        index < playlist.index
          ? "done"
          : index === playlist.index
            ? playlist.finished
              ? "done"
              : "current"
            : "upcoming",
    }));

    return {
      active: playlist.active,
      finished: playlist.finished,
      awaitingNext: playlist.awaitingNext,
      index: playlist.index,
      total: playlist.queue.length,
      current: playlist.finished ? null : queue[playlist.index] ?? null,
      next: playlist.finished ? null : queue[playlist.index + 1] ?? null,
      queue,
      completed: playlist.completed.map((entry) => ({
        gameId: entry.gameId,
        name: entry.name,
        reason: entry.reason,
        finishedAt: entry.finishedAt,
        scores: entry.scores,
      })),
      startedAt: playlist.startedAt,
      endedAt: playlist.endedAt,
    };
  }

  resetRoom(adminToken) {
    const oldCode = this.adminRooms.get(adminToken);
    if (oldCode) this.rooms.delete(oldCode);
    return this.createRoom(adminToken);
  }

  cleanup() {
    const time = now();
    for (const [code, room] of this.rooms) {
      const idle = time - room.lastActivity;
      if (this.connectedCount(room) === 0 && idle > config.roomTtlMs) {
        this.rooms.delete(code);
        for (const [token, mappedCode] of this.adminRooms) {
          if (mappedCode === code) this.adminRooms.delete(token);
        }
      }
    }
  }

  publicState(room) {
    return {
      code: room.code,
      phase: room.phase,
      gameId: room.gameId,
      locked: room.locked,
      createdAt: room.createdAt,
      updatedAt: now(),
      minPlayers: config.minPlayers,
      maxPlayers: config.maxPlayers,
      players: room.players.map((player) => ({
        id: player.id,
        name: player.name,
        connected: player.connected,
      })),
      scores: { ...room.scores },
      sessionScores: { ...room.sessionScores },
      playlist: this.playlistSummary(room),
    };
  }

  playerState(room, player) {
    return {
      playerId: player.id,
      name: player.name,
      connected: player.connected,
      isAdmin: false,
    };
  }

  adminState(room) {
    return {
      ...this.publicState(room),
      playerCount: room.players.length,
      connectedCount: this.connectedCount(room),
      history: room.history,
      playlist: room.playlist
        ? {
            ...this.playlistSummary(room),
            queue: room.playlist.queue.map((entry) => ({ ...entry })),
            completed: room.playlist.completed.map((entry) => ({
              ...entry,
              scores: entry.scores.map((row) => ({ ...row })),
              sessionScores: entry.sessionScores.map((row) => ({ ...row })),
            })),
          }
        : null,
    };
  }
}
