/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
import { verifySession } from "./auth.js";
import { config } from "./config.js";
import { getGame } from "./games/index.js";
import { createRateLimiter } from "./rateLimit.js";
import { clientIpFromSocket, now } from "./util.js";

const adminChannel = (code) => `admin:${code}`;
const playerChannel = (code) => `room:${code}`;

const checkLimiter = createRateLimiter({
  limit: config.rateLimits.check,
  windowMs: 60_000,
});
const joinLimiter = createRateLimiter({
  limit: config.rateLimits.join,
  windowMs: 60_000,
});
const actionLimiter = createRateLimiter({
  limit: config.rateLimits.action,
  windowMs: 60_000,
});
/* Strokes arrive far more often than game actions, so they get their own
 * budget. It is still a limit, so a stuck client cannot flood the room. */
const strokeLimiter = createRateLimiter({
  limit: config.rateLimits.stroke,
  windowMs: 60_000,
});

/* When each room last published its state because of a stroke. */
const strokePublish = new Map();

function reply(ack, payload) {
  if (typeof ack === "function") ack(payload);
}

function fail(ack, code, message) {
  reply(ack, { ok: false, code, message });
}

function rateLimited(ack, gate) {
  reply(ack, {
    ok: false,
    code: "rate_limited",
    message: "Too many requests. Wait a moment and try again.",
    retryAfterMs: gate.retryAfterMs,
  });
}

function roomEngine(room) {
  if (!room.game || !room.gameId) return null;
  return getGame(room.gameId);
}

function buildBroadcast(store, room) {
  const engine = roomEngine(room);
  const publicState = store.publicState(room);

  if (engine) {
    try {
      publicState.game = engine.publicView(room.game, room);
    } catch (error) {
      publicState.game = null;
      console.error(`[game:${room.gameId}] public view failed`, error);
    }
  } else {
    publicState.game = null;
  }

  const adminState = store.adminState(room);
  if (engine) {
    try {
      adminState.game = engine.adminView(room.game, room);
    } catch (error) {
      adminState.game = null;
      console.error(`[game:${room.gameId}] admin view failed`, error);
    }
  } else {
    adminState.game = null;
  }

  const playerStates = new Map();
  for (const player of room.players) {
    const state = store.playerState(room, player);
    const inCurrentGame =
      !engine ||
      !room.game ||
      room.game.players?.some((candidate) => candidate.id === player.id);

    if (engine && !inCurrentGame) {
      state.spectator = true;
      state.game = {
        spectator: true,
        gameId: room.gameId,
        name: room.game?.name ?? "the current game",
        message:
          "You are sitting out this game. The host will include you when the next game starts.",
      };
    } else if (engine) {
      try {
        state.game = engine.playerView(room.game, player.id);
      } catch (error) {
        state.game = null;
        console.error(`[game:${room.gameId}] player view failed`, error);
      }
    } else {
      state.game = null;
    }
    playerStates.set(player.id, state);
  }

  return { publicState, adminState, playerStates };
}

function broadcast(io, store, room) {
  const { publicState, adminState, playerStates } = buildBroadcast(store, room);

  for (const player of room.players) {
    if (!player.connected || !player.socketId) continue;
    const socket = io.sockets.sockets.get(player.socketId);
    if (!socket) continue;
    socket.emit("state", {
      public: publicState,
      you: playerStates.get(player.id),
      serverTime: Date.now(),
    });
  }

  io.to(adminChannel(room.code)).emit("state", {
    public: publicState,
    admin: adminState,
    serverTime: Date.now(),
  });
}

function adminRoomOrFail(socket, store, ack) {
  if (socket.data.role !== "admin") {
    fail(ack, "unauthorized", "Admin access is required.");
    return null;
  }
  if (!verifySession(socket.data.adminToken)) {
    fail(ack, "admin_expired", "Your admin session expired. Sign in again.");
    return null;
  }
  const room = store.roomForAdmin(socket.data.adminToken);
  if (!room) {
    fail(ack, "no_room", "Create a room first.");
    return null;
  }
  return room;
}

function detachFromCurrentRoom(io, store, socket) {
  const code = socket.data.roomCode;
  if (!code) return;

  const room = store.getRoom(code);
  if (room) {
    const player = store.findPlayerBySocket(room, socket.id);
    if (player) {
      player.connected = false;
      player.socketId = null;
      player.lastSeenAt = now();
      store.touch(room);
      broadcast(io, store, room);
    }
  }

  socket.leave(playerChannel(code));
  socket.data.roomCode = null;
  socket.data.playerId = null;
  socket.data.playerToken = null;
}

function connectedPlayers(room) {
  return room.players.filter((player) => player.connected);
}

function normalizeQueue(gameIds, { allowEmpty = false } = {}) {
  if (!Array.isArray(gameIds)) {
    return { error: "Send the playlist as a list of game ids." };
  }
  if (!allowEmpty && gameIds.length === 0) {
    return { error: "Add at least one game to the playlist." };
  }
  if (gameIds.length > 30) {
    return { error: "A playlist can hold at most 30 games." };
  }

  const queue = [];
  for (const gameId of gameIds) {
    const engine = getGame(gameId);
    if (!engine) {
      return { error: `Unknown game: ${String(gameId ?? "").slice(0, 40)}` };
    }
    queue.push({ gameId: engine.meta.id, name: engine.meta.name });
  }
  return { queue };
}

function startEngine(store, room, engine, players) {
  store.resetScores(room);
  room.gameId = engine.meta.id;
  room.game = engine.create({ ...room, players });
  room.phase = "playing";
  if (room.playlist) {
    room.playlist.currentGame = {
      queueIndex: room.playlist.index,
      gameId: engine.meta.id,
      name: engine.meta.name,
      startedAt: room.game.startedAt,
      recorded: false,
    };
    room.playlist.awaitingNext = false;
  }
  store.touch(room);
}

function recordPlaylistResult(store, room, reason = "complete") {
  const playlist = room.playlist;
  if (!playlist?.active || !room.game) return null;
  if (playlist.currentGame?.recorded) return null;

  const entry = store.archiveGame(room, reason);
  if (!entry) return null;

  playlist.currentGame ??= {
    queueIndex: playlist.index,
    gameId: room.gameId,
    name: room.game.name,
    startedAt: room.game.startedAt,
    recorded: false,
  };
  playlist.currentGame.recorded = true;
  entry.queueIndex = playlist.index;
  entry.playlistGameId = playlist.currentGame.gameId;
  playlist.completed.push(entry);
  playlist.completed = playlist.completed.slice(-50);
  playlist.awaitingNext = true;
  store.touch(room);
  return entry;
}

function clearPlaylistGame(room) {
  room.game = null;
  room.gameId = null;
  room.phase = "between";
}

function finishPlaylist(store, room, reason = "complete") {
  const playlist = room.playlist;
  if (!playlist) return null;
  if (room.game) recordPlaylistResult(store, room, reason);
  clearPlaylistGame(room);
  playlist.active = false;
  playlist.finished = true;
  playlist.awaitingNext = false;
  playlist.endedAt = now();
  store.touch(room);
  return playlist;
}

function syncPlaylistProgress(store, room) {
  if (!room.playlist?.active || !room.game) return;
  if (room.game.phase !== "complete") return;
  if (room.playlist.currentGame?.recorded) return;
  recordPlaylistResult(store, room, "complete");
}

function publish(io, store, room) {
  syncPlaylistProgress(store, room);
  broadcast(io, store, room);
}

export function attachProtocol(io, store) {
  io.use((socket, next) => {
    const auth = socket.handshake.auth ?? {};

    if (auth.role === "admin") {
      if (!auth.token || !verifySession(auth.token)) {
        return next(new Error("unauthorized"));
      }
      socket.data.role = "admin";
      socket.data.adminToken = auth.token;
      return next();
    }

    socket.data.role = "player";
    return next();
  });

  io.on("connection", (socket) => {
    if (socket.data.role === "admin") {
      socket.on("admin:createRoom", (payload, ack) => {
        if (!verifySession(socket.data.adminToken)) {
          return fail(
            ack,
            "admin_expired",
            "Your admin session expired. Sign in again.",
          );
        }

        const room = store.getOrCreateRoom(socket.data.adminToken);
        for (const joined of socket.rooms) {
          if (
            joined.startsWith("admin:") &&
            joined !== adminChannel(room.code)
          ) {
            socket.leave(joined);
          }
        }
        socket.join(adminChannel(room.code));
        reply(ack, { ok: true, code: room.code });
        broadcast(io, store, room);
      });

      socket.on("admin:resetRoom", (payload, ack) => {
        const room = adminRoomOrFail(socket, store, ack);
        if (!room) return;

        const oldCode = room.code;
        io.to(playerChannel(oldCode)).emit("room:closed", {
          code: oldCode,
          reason: "reset",
        });

        for (const player of room.players) {
          if (!player.socketId) continue;
          const playerSocket = io.sockets.sockets.get(player.socketId);
          if (!playerSocket) continue;
          playerSocket.leave(playerChannel(oldCode));
          playerSocket.data.roomCode = null;
          playerSocket.data.playerId = null;
          playerSocket.data.playerToken = null;
        }

        socket.leave(adminChannel(oldCode));
        const newRoom = store.resetRoom(socket.data.adminToken);
        socket.join(adminChannel(newRoom.code));
        reply(ack, { ok: true, code: newRoom.code });
        broadcast(io, store, newRoom);
      });

      socket.on("admin:setLocked", (payload, ack) => {
        const room = adminRoomOrFail(socket, store, ack);
        if (!room) return;

        if (room.phase !== "lobby") {
          return fail(
            ack,
            "game_in_progress",
            "Lock the room between games, not during a game.",
          );
        }

        store.setLocked(room, payload?.locked);
        reply(ack, { ok: true, locked: room.locked });
        broadcast(io, store, room);
      });

      socket.on("admin:removePlayer", (payload, ack) => {
        const room = adminRoomOrFail(socket, store, ack);
        if (!room) return;

        if (room.phase !== "lobby") {
          return fail(
            ack,
            "game_in_progress",
            "Players cannot be removed during a game. End the game first.",
          );
        }

        const player = store.findPlayerById(room, payload?.playerId);
        if (!player) {
          return fail(
            ack,
            "player_not_found",
            "That player is no longer in the room.",
          );
        }

        if (player.socketId) {
          const playerSocket = io.sockets.sockets.get(player.socketId);
          if (playerSocket) {
            playerSocket.emit("room:removed", { code: room.code });
            playerSocket.leave(playerChannel(room.code));
            playerSocket.data.roomCode = null;
            playerSocket.data.playerId = null;
            playerSocket.data.playerToken = null;
            playerSocket.disconnect(true);
          }
        }

        store.removePlayer(room, player.id);
        reply(ack, { ok: true });
        broadcast(io, store, room);
      });

      socket.on("admin:startGame", (payload, ack) => {
        const room = adminRoomOrFail(socket, store, ack);
        if (!room) return;

        if (room.playlist?.active) {
          return fail(
            ack,
            "playlist_in_progress",
            "Finish or end the playlist before starting a single game.",
          );
        }

        if ((room.phase !== "lobby" && room.phase !== "between") || room.game) {
          return fail(ack, "game_in_progress", "A game is already running.");
        }

        const engine = getGame(payload?.gameId);
        if (!engine) {
          return fail(ack, "unknown_game", "That game was not found.");
        }

        if (room.players.length > engine.meta.maxPlayers) {
          return fail(
            ack,
            "too_many_players",
            `${engine.meta.name} supports up to ${engine.meta.maxPlayers} players.`,
          );
        }

        // Single games and playlists seat the same people: everyone who is
        // connected right now. Anyone who is offline sits this game out and
        // spectates until the next one.
        const players = connectedPlayers(room);

        if (players.length < engine.meta.minPlayers) {
          return fail(
            ack,
            "not_enough_players",
            `${engine.meta.name} needs at least ${engine.meta.minPlayers} connected players.`,
          );
        }

        try {
          room.playlist = null;
          store.resetAllScores(room);
          startEngine(store, room, engine, players);
        } catch (error) {
          room.gameId = null;
          room.game = null;
          room.phase = "lobby";
          console.error("[games] start failed", error);
          return fail(ack, "game_error", "The game could not be started.");
        }

        reply(ack, { ok: true, gameId: room.gameId });
        publish(io, store, room);
      });

      socket.on("admin:endGame", (payload, ack) => {
        const room = adminRoomOrFail(socket, store, ack);
        if (!room) return;

        if (!room.game) {
          return fail(ack, "no_game", "There is no active game.");
        }

        if (room.playlist?.active) {
          const reason = room.game.phase === "complete" ? "complete" : "ended";
          recordPlaylistResult(store, room, reason);
          clearPlaylistGame(room);
          room.playlist.awaitingNext = true;
          store.touch(room);
        } else {
          store.finishGame(room, "ended");
        }

        reply(ack, { ok: true });
        publish(io, store, room);
      });

      socket.on("admin:replayGame", (payload, ack) => {
        const room = adminRoomOrFail(socket, store, ack);
        if (!room) return;

        if (room.playlist?.active) {
          return fail(
            ack,
            "playlist_in_progress",
            "A playlist game cannot be replayed. Finish the game, then start the next one.",
          );
        }

        const engine = roomEngine(room);
        if (!engine || !room.game) {
          return fail(ack, "no_game", "There is no game to replay.");
        }

        const players = connectedPlayers(room);
        if (players.length < engine.meta.minPlayers) {
          return fail(
            ack,
            "not_enough_players",
            `${engine.meta.name} needs at least ${engine.meta.minPlayers} connected players to start again.`,
          );
        }

        try {
          store.resetAllScores(room);
          // Only connected players take a seat, exactly like a fresh start.
          room.game = engine.create({ ...room, players });
          room.phase = "playing";
          store.touch(room);
        } catch (error) {
          console.error("[games] replay failed", error);
          return fail(ack, "game_error", "The game could not be restarted.");
        }

        reply(ack, { ok: true });
        publish(io, store, room);
      });

      socket.on("admin:nextRound", (payload, ack) => {
        const room = adminRoomOrFail(socket, store, ack);
        if (!room) return;

        const engine = roomEngine(room);
        if (!engine || !room.game) {
          return fail(ack, "no_game", "There is no active game.");
        }

        let result;
        try {
          result = engine.nextRound(room, room.game);
        } catch (error) {
          console.error("[games] next round failed", error);
          return fail(ack, "game_error", "The next round could not start.");
        }

        if (!result?.ok) {
          return fail(
            ack,
            result?.code ?? "cannot_advance",
            result?.message ?? "The next round cannot start yet.",
          );
        }

        store.touch(room);
        reply(ack, { ok: true });
        publish(io, store, room);
      });

      socket.on("admin:gameAction", (payload, ack) => {
        const room = adminRoomOrFail(socket, store, ack);
        if (!room) return;

        const engine = roomEngine(room);
        if (!engine || !room.game) {
          return fail(ack, "no_game", "There is no active game.");
        }

        let result;
        try {
          result = engine.adminAction(room, room.game, payload?.type, payload);
        } catch (error) {
          console.error("[games] admin action failed", error);
          return fail(ack, "game_error", "That host action failed.");
        }

        if (!result?.ok) {
          return fail(
            ack,
            result?.code ?? "invalid_action",
            result?.message ?? "That host action is not available.",
          );
        }

        store.touch(room);
        reply(ack, { ok: true });
        publish(io, store, room);
      });

      socket.on("admin:startPlaylist", (payload, ack) => {
        const room = adminRoomOrFail(socket, store, ack);
        if (!room) return;

        if (room.playlist?.active) {
          return fail(ack, "playlist_in_progress", "A playlist is already running.");
        }

        if ((room.phase !== "lobby" && room.phase !== "between") || room.game) {
          return fail(ack, "game_in_progress", "Finish the current game first.");
        }

        const normalized = normalizeQueue(payload?.gameIds);
        if (normalized.error) {
          return fail(ack, "invalid_playlist", normalized.error);
        }

        const first = normalized.queue[0];
        const firstEngine = getGame(first.gameId);
        const players = connectedPlayers(room);
        if (players.length < firstEngine.meta.minPlayers) {
          return fail(
            ack,
            "not_enough_players",
            `${firstEngine.meta.name} needs at least ${firstEngine.meta.minPlayers} connected players.`,
          );
        }

        room.playlist = {
          active: true,
          finished: false,
          queue: normalized.queue,
          index: 0,
          currentGame: null,
          completed: [],
          awaitingNext: false,
          startedAt: now(),
          endedAt: null,
        };
        store.resetAllScores(room);

        try {
          startEngine(store, room, firstEngine, players);
        } catch (error) {
          room.playlist = null;
          room.game = null;
          room.gameId = null;
          room.phase = "lobby";
          console.error("[playlist] start failed", error);
          return fail(ack, "game_error", "The playlist could not be started.");
        }

        reply(ack, { ok: true, gameId: room.gameId });
        publish(io, store, room);
      });

      socket.on("admin:nextPlaylistGame", (payload, ack) => {
        const room = adminRoomOrFail(socket, store, ack);
        if (!room) return;

        const playlist = room.playlist;
        if (!playlist?.active) {
          return fail(ack, "no_playlist", "There is no active playlist.");
        }

        if (room.game && room.game.phase !== "complete") {
          return fail(
            ack,
            "game_in_progress",
            "Finish or skip the current game before starting the next one.",
          );
        }

        if (room.game) recordPlaylistResult(store, room, "complete");

        const nextIndex = playlist.index + 1;
        if (nextIndex >= playlist.queue.length) {
          finishPlaylist(store, room);
          reply(ack, { ok: true, finished: true });
          publish(io, store, room);
          return;
        }

        const nextEntry = playlist.queue[nextIndex];
        const nextEngine = getGame(nextEntry.gameId);
        const players = connectedPlayers(room);

        if (!nextEngine) {
          return fail(ack, "unknown_game", "The next game was not found.");
        }
        if (players.length < nextEngine.meta.minPlayers) {
          return fail(
            ack,
            "not_enough_players",
            `${nextEngine.meta.name} needs at least ${nextEngine.meta.minPlayers} connected players. Wait for players to reconnect, skip the game, or end the playlist.`,
          );
        }
        if (players.length > nextEngine.meta.maxPlayers) {
          return fail(
            ack,
            "too_many_players",
            `${nextEngine.meta.name} supports up to ${nextEngine.meta.maxPlayers} players.`,
          );
        }

        const previousIndex = playlist.index;
        try {
          playlist.index = nextIndex;
          startEngine(store, room, nextEngine, players);
        } catch (error) {
          playlist.index = previousIndex;
          console.error("[playlist] next game failed", error);
          return fail(ack, "game_error", "The next game could not be started.");
        }

        reply(ack, { ok: true, gameId: room.gameId });
        publish(io, store, room);
      });

      socket.on("admin:skipPlaylistGame", (payload, ack) => {
        const room = adminRoomOrFail(socket, store, ack);
        if (!room) return;

        const playlist = room.playlist;
        if (!playlist?.active) {
          return fail(ack, "no_playlist", "There is no active playlist.");
        }
        if (!room.game) {
          return fail(ack, "no_game", "There is no current game to skip.");
        }

        const reason = room.game.phase === "complete" ? "complete" : "skipped";
        recordPlaylistResult(store, room, reason);
        clearPlaylistGame(room);
        playlist.awaitingNext = true;
        store.touch(room);

        reply(ack, { ok: true });
        publish(io, store, room);
      });

      socket.on("admin:endPlaylist", (payload, ack) => {
        const room = adminRoomOrFail(socket, store, ack);
        if (!room) return;

        const playlist = room.playlist;
        if (!playlist?.active) {
          return fail(ack, "no_playlist", "There is no active playlist.");
        }

        finishPlaylist(store, room, "playlist_ended");
        reply(ack, { ok: true });
        publish(io, store, room);
      });

      socket.on("admin:playlistSetUpcoming", (payload, ack) => {
        const room = adminRoomOrFail(socket, store, ack);
        if (!room) return;

        const playlist = room.playlist;
        if (!playlist?.active) {
          return fail(ack, "no_playlist", "There is no active playlist.");
        }
        if (room.game && room.game.phase !== "complete" && room.phase !== "between") {
          return fail(
            ack,
            "game_in_progress",
            "Edit upcoming games between games.",
          );
        }

        const normalized = normalizeQueue(payload?.gameIds, { allowEmpty: true });
        if (normalized.error) {
          return fail(ack, "invalid_playlist", normalized.error);
        }

        playlist.queue = [
          ...playlist.queue.slice(0, playlist.index + 1),
          ...normalized.queue,
        ];
        store.touch(room);
        reply(ack, { ok: true });
        publish(io, store, room);
      });

      socket.on("admin:returnToLobby", (payload, ack) => {
        const room = adminRoomOrFail(socket, store, ack);
        if (!room) return;

        if (room.game) {
          return fail(ack, "game_in_progress", "Finish or skip the current game first.");
        }
        if (room.playlist?.active) {
          return fail(ack, "playlist_in_progress", "End the playlist first.");
        }

        room.phase = "lobby";
        store.touch(room);
        reply(ack, { ok: true });
        publish(io, store, room);
      });
    }

    if (socket.data.role === "player") {
      socket.on("room:check", (payload, ack) => {
        const gate = checkLimiter(clientIpFromSocket(socket));
        if (!gate.ok) return rateLimited(ack, gate);

        const room = store.getRoom(payload?.code);
        if (!room) {
          return fail(ack, "room_not_found", "That code does not match a room.");
        }

        reply(ack, {
          ok: true,
          room: {
            code: room.code,
            phase: room.phase,
            locked: room.locked,
            playerCount: room.players.length,
            connectedCount: store.connectedCount(room),
            minPlayers: config.minPlayers,
            maxPlayers: config.maxPlayers,
            joinable:
              room.phase === "lobby" &&
              !room.locked &&
              room.players.length < config.maxPlayers,
          },
        });
      });

      socket.on("room:join", (payload, ack) => {
        const gate = joinLimiter(clientIpFromSocket(socket));
        if (!gate.ok) return rateLimited(ack, gate);

        // The IP limit alone is bypassable by spoofing X-Forwarded-For, so
        // each connection also gets its own join budget.
        socket.data.joinCount = (socket.data.joinCount ?? 0) + 1;
        if (socket.data.joinCount > 12) {
          return fail(
            ack,
            "rate_limited",
            "Too many join attempts on this connection. Reconnect and try again.",
          );
        }

        const code = payload?.code;
        const room = store.getRoom(code);
        if (!room) {
          return fail(ack, "room_not_found", "That code does not match a room.");
        }

        if (socket.data.roomCode && socket.data.roomCode !== room.code) {
          detachFromCurrentRoom(io, store, socket);
        }

        if (payload?.token) {
          const result = store.resume(room, payload.token, socket.id);
          if (!result.ok) return fail(ack, result.code, result.message);

          if (
            result.previousSocketId &&
            result.previousSocketId !== socket.id
          ) {
            const oldSocket = io.sockets.sockets.get(
              result.previousSocketId,
            );
            if (oldSocket) {
              oldSocket.emit("session:replaced", { code: room.code });
              setTimeout(() => oldSocket.disconnect(true), 100);
            }
          }

          socket.data.roomCode = room.code;
          socket.data.playerId = result.player.id;
          socket.data.playerToken = result.player.token;
          socket.join(playerChannel(room.code));

          reply(ack, {
            ok: true,
            code: room.code,
            playerId: result.player.id,
            token: result.player.token,
            resumed: true,
          });
          broadcast(io, store, room);
          return;
        }

        const result = store.join(room, payload?.name, socket.id);
        if (!result.ok) return fail(ack, result.code, result.message);

        socket.data.roomCode = room.code;
        socket.data.playerId = result.player.id;
        socket.data.playerToken = result.player.token;
        socket.join(playerChannel(room.code));

        reply(ack, {
          ok: true,
          code: room.code,
          playerId: result.player.id,
          token: result.player.token,
          resumed: false,
        });
        broadcast(io, store, room);
      });

      socket.on("room:leave", (payload, ack) => {
        const room = store.getRoom(socket.data.roomCode);
        if (!room) {
          reply(ack, { ok: true });
          return;
        }

        const player = store.findPlayerBySocket(room, socket.id);
        if (player) {
          if (room.phase === "lobby") {
            store.removePlayer(room, player.id);
          } else {
            player.connected = false;
            player.socketId = null;
            player.lastSeenAt = now();
            store.touch(room);
          }
        }

        socket.emit("room:left", { code: room.code });
        socket.leave(playerChannel(room.code));
        socket.data.roomCode = null;
        socket.data.playerId = null;
        socket.data.playerToken = null;

        reply(ack, { ok: true });
        broadcast(io, store, room);
      });

      socket.on("game:action", (payload, ack) => {
        const gate = actionLimiter(clientIpFromSocket(socket));
        if (!gate.ok) return rateLimited(ack, gate);
        const room = store.getRoom(socket.data.roomCode);
        if (!room || !room.game) {
          return fail(ack, "no_game", "There is no active game.");
        }

        const player = store.findPlayerBySocket(room, socket.id);
        if (!player) {
          return fail(ack, "not_in_room", "Rejoin the room to continue.");
        }

        const engine = roomEngine(room);
        if (!engine) {
          return fail(ack, "unknown_game", "That game is not available.");
        }

        let result;
        try {
          result = engine.action(room, room.game, player.id, payload);
        } catch (error) {
          console.error("[games] player action failed", error);
          return fail(ack, "game_error", "That action could not be completed.");
        }

        if (!result?.ok) {
          return fail(
            ack,
            result?.code ?? "invalid_action",
            result?.message ?? "That action is not available.",
          );
        }

        store.touch(room);
        // The engine may return extra feedback, such as whether a guess was
        // right, so the player does not have to wait for the next state.
        reply(ack, { ok: true, ...result });
        publish(io, store, room);
      });

      /* The drawing board. Strokes are a stream, so they do not travel in
       * the game state: they go out on their own event, and the state only
       * carries the stroke count. */
      socket.on("draw:stroke", (payload, ack) => {
        const gate = strokeLimiter(clientIpFromSocket(socket));
        if (!gate.ok) return rateLimited(ack, gate);

        const room = store.getRoom(socket.data.roomCode);
        if (!room || !room.game) {
          return fail(ack, "no_game", "There is no active game.");
        }

        const engine = roomEngine(room);
        if (!engine?.acceptStroke) {
          return fail(ack, "not_supported", "This game has no drawing board.");
        }

        const player = store.findPlayerBySocket(room, socket.id);
        if (!player) {
          return fail(ack, "not_in_room", "Rejoin the room to continue.");
        }

        let result;
        try {
          result = engine.acceptStroke(room, room.game, player.id, payload);
        } catch (error) {
          console.error("[draw] stroke failed", error);
          return fail(ack, "game_error", "That stroke could not be added.");
        }

        if (!result?.ok) {
          return fail(
            ack,
            result?.code ?? "invalid_stroke",
            result?.message ?? "That stroke was refused.",
          );
        }

        store.touch(room);
        io.to(playerChannel(room.code)).emit("draw:stroke", result.stroke);

        /* The stroke count travels in the state, so a player who joins
         * mid-turn can tell that there is a drawing to catch up on. It is
         * published on a throttle, because a fast drawing would otherwise
         * push the whole state on every pointer move. */
        const last = strokePublish.get(room.code) ?? 0;
        if (now() - last >= 500) {
          strokePublish.set(room.code, now());
          publish(io, store, room);
        }
        reply(ack, { ok: true });
      });

      /* The drawer takes a stroke back. */
      socket.on("draw:undo", (payload, ack) => {
        const gate = strokeLimiter(clientIpFromSocket(socket));
        if (!gate.ok) return rateLimited(ack, gate);

        const room = store.getRoom(socket.data.roomCode);
        if (!room || !room.game) {
          return fail(ack, "no_game", "There is no active game.");
        }

        const engine = roomEngine(room);
        if (!engine?.undoStroke) {
          return fail(ack, "not_supported", "This game has no drawing board.");
        }

        const player = store.findPlayerBySocket(room, socket.id);
        if (!player) {
          return fail(ack, "not_in_room", "Rejoin the room to continue.");
        }

        let result;
        try {
          result = engine.undoStroke(room, room.game, player.id);
        } catch (error) {
          console.error("[draw] undo failed", error);
          return fail(ack, "game_error", "That could not be undone.");
        }

        if (!result?.ok) {
          return fail(
            ack,
            result?.code ?? "cannot_undo",
            result?.message ?? "That could not be undone.",
          );
        }

        store.touch(room);
        io.to(playerChannel(room.code)).emit("draw:remove", {
          id: result.strokeId,
        });
        publish(io, store, room);
        reply(ack, { ok: true });
      });

      /* The drawer wipes the board. */
      socket.on("draw:clear", (payload, ack) => {
        const gate = strokeLimiter(clientIpFromSocket(socket));
        if (!gate.ok) return rateLimited(ack, gate);

        const room = store.getRoom(socket.data.roomCode);
        if (!room || !room.game) {
          return fail(ack, "no_game", "There is no active game.");
        }

        const engine = roomEngine(room);
        if (!engine?.clearBoard) {
          return fail(ack, "not_supported", "This game has no drawing board.");
        }

        const player = store.findPlayerBySocket(room, socket.id);
        if (!player) {
          return fail(ack, "not_in_room", "Rejoin the room to continue.");
        }

        let result;
        try {
          result = engine.clearBoard(room, room.game, player.id);
        } catch (error) {
          console.error("[draw] clear failed", error);
          return fail(ack, "game_error", "The board could not be cleared.");
        }

        if (!result?.ok) {
          return fail(
            ack,
            result?.code ?? "cannot_clear",
            result?.message ?? "The board could not be cleared.",
          );
        }

        store.touch(room);
        io.to(playerChannel(room.code)).emit("draw:clear", {});
        publish(io, store, room);
        reply(ack, { ok: true });
      });

      /* A player who joins or reconnects mid-turn asks for the drawing so
       * far, so the drawer does not lose their turn to a phone that slept. */
      socket.on("draw:sync", (payload, ack) => {
        const room = store.getRoom(socket.data.roomCode);
        if (!room || !room.game) {
          return fail(ack, "no_game", "There is no active game.");
        }

        const engine = roomEngine(room);
        if (!engine?.strokeHistory) {
          return fail(ack, "not_supported", "This game has no drawing board.");
        }

        const player = store.findPlayerBySocket(room, socket.id);
        if (!player) {
          return fail(ack, "not_in_room", "Rejoin the room to continue.");
        }

        const strokes = engine.strokeHistory(room.game);
        socket.emit("draw:sync", {
          strokes,
          strokeCount: strokes.length,
          turn: room.game.turnIndex ?? 0,
        });
        reply(ack, { ok: true });
      });
    }

    socket.on("disconnect", () => {
      const result = store.disconnect(socket.id);
      if (result) broadcast(io, store, result.room);
    });
  });

  /* The one clock in the platform. The server owns it: a turn ends when
   * its deadline passes, and the reveal moves on when it is over. Clients
   * only draw a countdown from the deadline they were given, so a phone
   * that sleeps or misses an event can never end a turn. */
  const clock = setInterval(() => {
    const current = now();
    for (const room of store.rooms.values()) {
      const game = room.game;
      if (!game) continue;

      const engine = getGame(room.gameId);
      if (!engine?.meta?.timed) continue;

      const drawingDue =
        game.phase === "drawing" && game.deadline && current >= game.deadline;
      const revealDue =
        game.phase === "reveal" && game.revealUntil && current >= game.revealUntil;
      if (!drawingDue && !revealDue) continue;

      let result;
      try {
        result = engine.adminAction(room, game, "timeout", {});
      } catch (error) {
        console.error(`[clock:${room.gameId}] tick failed`, error);
        continue;
      }

      if (result?.ok) {
        store.touch(room);
        publish(io, store, room);
      }
    }
  }, 500);
  clock.unref?.();
}
