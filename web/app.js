/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
import {
  applyDrawStroke,
  clearDrawBoard,
  removeDrawStroke,
  renderGameScreen,
  syncDrawBoard,
} from "./games.js";
import { avatar } from "./dom.js";
import { hydrateIcons } from "./icons.js";
import { createSocket, emitAck } from "./net.js";
import { deleteStored, readStored, writeStored } from "./storage.js";

window.__FG_ERRORS = [];
window.addEventListener("error", (event) => {
  window.__FG_ERRORS.push(String(event.message || event.error || "error"));
});
window.addEventListener("unhandledrejection", (event) => {
  window.__FG_ERRORS.push(
    String(event.reason?.message || event.reason || "unhandled rejection"),
  );
});

const SESSION_KEY = "fg:session:v1";
const NAME_KEY = "fg:lastName:v1";
const RECENT_ROOM_KEY = "fg:recentRoom:v1";
let installPrompt = null;

function mirrorStored(key, value) {
  void writeStored(key, value).catch(() => {
    // localStorage remains the fallback for private browsing and older browsers.
  });
}

/* The name is remembered separately from the session, so a player whose
 * room disappeared only has to type their name once more. */
function rememberName(name) {
  try {
    localStorage.setItem(NAME_KEY, String(name ?? ""));
  } catch {
    // Private browsing can reject storage.
  }
  mirrorStored(NAME_KEY, String(name ?? ""));
}

function lastName() {
  try {
    return localStorage.getItem(NAME_KEY) || "";
  } catch {
    return "";
  }
}

function loadRecentRoom() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_ROOM_KEY) || "null");
    return /^[A-Z2-9]{5}$/.test(parsed?.code) ? parsed : null;
  } catch {
    return null;
  }
}

function renderSavedRoom() {
  const recent = loadRecentRoom();
  if (!dom.savedRoom) return;
  dom.savedRoom.hidden = !recent;
  if (recent) dom.useSavedRoom.textContent = recent.code;
}

function rememberRoom(code, name = lastName()) {
  const value = { code, name, savedAt: Date.now() };
  try {
    localStorage.setItem(RECENT_ROOM_KEY, JSON.stringify(value));
  } catch {
    // Private browsing can reject storage.
  }
  mirrorStored(RECENT_ROOM_KEY, value);
  renderSavedRoom();
}

function forgetRoom() {
  try {
    localStorage.removeItem(RECENT_ROOM_KEY);
  } catch {
    // Ignore storage failures.
  }
  void deleteStored(RECENT_ROOM_KEY).catch(() => {});
  renderSavedRoom();
}

async function hydratePersistentState() {
  const [storedSession, storedName, storedRoom] = await Promise.all([
    readStored(SESSION_KEY).catch(() => null),
    readStored(NAME_KEY).catch(() => null),
    readStored(RECENT_ROOM_KEY).catch(() => null),
  ]);

  if (!session && storedSession?.code && storedSession?.token) {
    session = storedSession;
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(storedSession));
    } catch {
      // Keep the IndexedDB value as the durable copy.
    }
    dom.lobbyCode.textContent = storedSession.code;
    dom.lobbyStatus.textContent = "Rejoining your room…";
    showStep("lobby");
  }

  if (!lastName() && typeof storedName === "string" && storedName) {
    rememberName(storedName);
  }

  if (!loadRecentRoom() && storedRoom?.code) {
    try {
      localStorage.setItem(RECENT_ROOM_KEY, JSON.stringify(storedRoom));
    } catch {
      // Keep the IndexedDB value as the durable copy.
    }
  }
  renderSavedRoom();
}

const $ = (id) => document.getElementById(id);

const dom = {
  banner: $("connection-banner"),
  toast: $("toast"),
  installApp: $("install-app"),
  savedRoom: $("saved-room"),
  useSavedRoom: $("use-saved-room"),
  clearSavedRoom: $("clear-saved-room"),

  codeForm: $("code-form"),
  codeInput: $("room-code"),
  codeError: $("code-error"),
  codeSubmit: $("code-submit"),

  nameForm: $("name-form"),
  nameInput: $("player-name"),
  nameError: $("name-error"),
  nameSubmit: $("name-submit"),
  pendingCode: $("pending-code"),
  backToCode: $("back-to-code"),

  lobby: $("step-lobby"),
  lobbyCode: $("lobby-code"),
  lobbyInvite: $("copy-invite"),
  lobbyCount: $("lobby-count"),
  lobbyStatus: $("lobby-status"),
  lobbyPlayers: $("lobby-players"),
  lobbyPlaylist: $("lobby-playlist"),
  lobbyHint: $("lobby-hint"),
  leaveRoom: $("leave-room"),

  game: $("step-game"),
};

const steps = {
  code: dom.codeForm,
  name: dom.nameForm,
  lobby: dom.lobby,
  game: dom.game,
};

let socket = null;
let session = loadSession();
let pendingCode = "";
let currentView = "";
let sessionReplaced = false;
let toastTimer = null;
let resumeInFlight = false;
let inviteCode = normalizeCode(
  location.pathname.match(/^\/g\/([a-z0-9]{5})\/?$/i)?.[1] ??
    new URLSearchParams(location.search).get("invitecode") ??
    "",
);
let inviteStarted = false;
let codeCheckInFlight = false;

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.code === "string" &&
      typeof parsed?.token === "string" &&
      parsed.token.length > 0
    ) {
      return {
        code: parsed.code,
        token: parsed.token,
        name: typeof parsed.name === "string" ? parsed.name : "",
      };
    }
  } catch {
    // A corrupt session should not block joining a room.
  }
  return null;
}

function saveSession(next) {
  session = next;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  } catch {
    // Private browsing can reject storage; the in-memory session still works.
  }
  mirrorStored(SESSION_KEY, next);
}

function clearSession() {
  session = null;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore storage failures.
  }
  void deleteStored(SESSION_KEY).catch(() => {});
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function setBanner(message, tone = "info") {
  if (!message) {
    dom.banner.hidden = true;
    dom.banner.textContent = "";
    return;
  }
  dom.banner.textContent = message;
  dom.banner.dataset.tone = tone;
  dom.banner.hidden = false;
}

function showToast(message) {
  dom.toast.textContent = message;
  dom.toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    dom.toast.classList.remove("is-visible");
  }, 2200);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Fall back for browsers that block clipboard access.
  }

  const area = document.createElement("textarea");
  area.value = text;
  area.readOnly = true;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  const copied = document.execCommand?.("copy");
  area.remove();
  if (!copied) throw new Error("Copy is blocked in this browser.");
}

function inviteUrl(code = session?.code) {
  if (!code) return "";
  return `${location.origin}/g/${encodeURIComponent(code)}`;
}

function showError(element, message) {
  element.textContent = message;
  element.hidden = false;
}

function clearError(element) {
  element.textContent = "";
  element.hidden = true;
}

function setBusy(button, busy, busyLabel, idleLabel) {
  button.disabled = busy;
  button.textContent = busy ? busyLabel : idleLabel;
}

function showStep(name) {
  if (!steps[name]) return;

  // The very first paint is animated by intro(), so do not tween it twice.
  const changed = currentView !== "" && currentView !== name;
  for (const [key, element] of Object.entries(steps)) {
    element.hidden = key !== name;
  }

  document.body.dataset.view = name;
  currentView = name;

  if (changed && window.gsap && !prefersReducedMotion()) {
    window.gsap.fromTo(
      steps[name],
      { y: 12, autoAlpha: 0 },
      {
        y: 0,
        autoAlpha: 1,
        duration: 0.35,
        ease: "power2.out",
        clearProps: "opacity,visibility,transform",
      },
    );
  }
}

function renderPlayers(players, youId) {
  dom.lobbyPlayers.replaceChildren();

  if (!Array.isArray(players) || players.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "No players yet. Share the room code.";
    dom.lobbyPlayers.append(empty);
    return;
  }

  for (const player of players) {
    const item = document.createElement("li");
    item.className = "player-row";
    if (player.id === youId) item.classList.add("is-you");

    const name = document.createElement("span");
    name.className = "player-name";
    name.textContent = player.name;

    item.append(avatar(player.name, player.id), name);

    if (player.id === youId) {
      const you = document.createElement("span");
      you.className = "you-badge";
      you.textContent = "You";
      item.append(you);
    }

    const dot = document.createElement("span");
    dot.className = "connection-dot";
    if (!player.connected) dot.classList.add("is-offline");
    dot.title = player.connected ? "Connected" : "Offline";
    dot.setAttribute("aria-label", player.connected ? "Connected" : "Offline");
    item.append(dot);

    dom.lobbyPlayers.append(item);
  }
}

function renderLobby(state) {
  const room = state.public;
  const players = Array.isArray(room.players) ? room.players : [];
  const connected = players.filter((player) => player.connected).length;

  dom.lobbyCode.textContent = room.code;
  dom.lobbyCount.textContent = `${players.length} ${
    players.length === 1 ? "player" : "players"
  }`;

  const minPlayers = room.minPlayers ?? 3;
  if (players.length < minPlayers) {
    dom.lobbyStatus.textContent = "Waiting for players to join.";
  } else if (connected < players.length) {
    dom.lobbyStatus.textContent = `${connected} of ${players.length} connected. Waiting for the host.`;
  } else {
    dom.lobbyStatus.textContent = "Everyone is here. Waiting for the host.";
  }

  const remaining = Math.max(0, minPlayers - players.length);
  dom.lobbyHint.textContent =
    remaining > 0
      ? `Need ${remaining} more ${remaining === 1 ? "player" : "players"} before the host can start.`
      : "The host can start the game from the console.";

  renderPlayers(players, state.you?.playerId);
  renderLobbyPlaylist(room);
}

function renderLobbyPlaylist(room) {
  dom.lobbyPlaylist.replaceChildren();
  const playlist = room.playlist;
  if (!playlist) {
    dom.lobbyPlaylist.hidden = true;
    return;
  }

  dom.lobbyPlaylist.hidden = false;
  const title = document.createElement("h3");
  title.className = "block-title";
  title.textContent = playlist.finished ? "Last game night" : "Game night";
  dom.lobbyPlaylist.append(title);

  const status = document.createElement("p");
  status.className = "hint";
  status.textContent = playlist.finished
    ? `${playlist.completed?.length ?? 0} ${
        (playlist.completed?.length ?? 0) === 1 ? "game" : "games"
      } played. The host can start a new game.`
    : playlist.next
      ? `Next up: ${playlist.next.name}`
      : "The host is choosing the next game.";
  dom.lobbyPlaylist.append(status);

  const players = Array.isArray(room.players) ? room.players : [];
  const rows = players
    .map((player) => ({
      ...player,
      session: room.sessionScores?.[player.id] ?? 0,
    }))
    .sort((a, b) => b.session - a.session || a.name.localeCompare(b.name));

  const list = document.createElement("ul");
  list.className = "score-list";
  for (const row of rows) {
    const item = document.createElement("li");
    item.className = "score-row";
    const avatar = document.createElement("span");
    avatar.className = `avatar ${toneClass(row.id)}`;
    avatar.textContent = initials(row.name);
    avatar.setAttribute("aria-hidden", "true");
    const name = document.createElement("span");
    name.className = "player-name";
    name.textContent = row.name;
    const points = document.createElement("span");
    points.className = "score-points";
    points.textContent = String(row.session);
    item.append(avatar, name, points);
    list.append(item);
  }
  dom.lobbyPlaylist.append(list);

  if (playlist.finished && Array.isArray(playlist.completed) && playlist.completed.length > 0) {
    const games = document.createElement("p");
    games.className = "fine";
    games.textContent = playlist.completed
      .map((entry) => entry.name)
      .join(" · ");
    dom.lobbyPlaylist.append(games);
  }
}

async function sendGameAction(payload) {
  if (!socket?.connected) {
    throw new Error("Still connecting. Try again in a moment.");
  }
  const result = await emitAck(socket, "game:action", payload);
  if (!result?.ok) {
    throw new Error(result?.message || "That action is not available.");
  }
  return result;
}

async function leaveRoom() {
  if (!window.confirm("Leave this room?")) return;

  try {
    if (socket?.connected) await emitAck(socket, "room:leave", {});
  } catch {
    // The local session is cleared either way.
  }

  clearSession();
  resetLobby();
  showStep("code");
  dom.codeInput.value = "";
  dom.codeInput.focus();
}

function renderGame(state) {
  renderGameScreen(dom.game, state, {
    send: sendGameAction,
    toast: showToast,
    onLeave: () => void leaveRoom(),
    stroke: (stroke) => {
      if (socket?.connected) socket.emit("draw:stroke", stroke);
    },
    requestSync: () => {
      if (socket?.connected) socket.emit("draw:sync", {});
    },
    undo: () => {
      if (socket?.connected) socket.emit("draw:undo", {});
    },
    clearBoard: () => {
      if (socket?.connected) socket.emit("draw:clear", {});
    },
  });
}

function handleState(state) {
  if (!state?.public) return;

  if (state.public.phase === "lobby") {
    showStep("lobby");
    renderLobby(state);
  } else {
    showStep("game");
    renderGame(state);
  }
}

async function attemptResume() {
  if (!session || !socket?.connected || sessionReplaced || resumeInFlight) return;
  resumeInFlight = true;

  const resumeSession = { ...session };
  setBanner("Rejoining your room…");

  try {
    const result = await emitAck(socket, "room:join", {
      code: resumeSession.code,
      token: resumeSession.token,
    });

    if (!result?.ok) {
      // The room is gone: the server restarted, or the room expired. The
      // code and the name are kept so the player can be back in the room
      // with a tap instead of typing everything again.
      const stale = resumeSession;
      clearSession();
      if (stale?.code) dom.codeInput.value = stale.code;
      if (stale?.name) rememberName(stale.name);
      showStep("code");
      showError(
        dom.codeError,
        result?.message ||
          "That room is no longer there. Enter your name to rejoin, or ask the host for a new code.",
      );
      setBanner("");
      return;
    }

    saveSession({
      code: result.code,
      token: result.token,
      name: resumeSession.name,
    });

    if (currentView !== "lobby" && currentView !== "game") {
      dom.lobbyCode.textContent = result.code;
      dom.lobbyStatus.textContent = "Rejoining your room…";
      showStep("lobby");
    }
    setBanner("");
  } catch (error) {
    setBanner("Can't reach the game server. Retrying…", "error");
  } finally {
    resumeInFlight = false;
  }
}

function connectSocket() {
  try {
    socket = createSocket({ role: "player" });
  } catch (error) {
    setBanner("The game client could not load. Refresh the page.", "error");
    return;
  }

  socket.on("connect", () => {
    if (sessionReplaced) return;
    setBanner("");
    dom.codeSubmit.disabled = false;
    if (session) {
      void attemptResume();
    } else if (inviteCode && !inviteStarted) {
      inviteStarted = true;
      dom.codeInput.value = inviteCode;
      showStep("code");
      void checkRoomCode(inviteCode);
    } else {
      showStep("code");
    }
  });

  socket.on("disconnect", (reason) => {
    if (sessionReplaced) return;
    dom.codeSubmit.disabled = true;
    if (reason === "io client disconnect") return;
    setBanner("Connection lost. Coming back…", "error");
  });

  socket.on("connect_error", () => {
    dom.codeSubmit.disabled = true;
    setBanner("Can't reach the game server. Retrying…", "error");
  });

  /* A dropped connection is normal on a phone. The banner stays up until
   * the seat is back, so nobody wonders where the game went. */
  socket.io.on("reconnect_attempt", (attempt) => {
    if (sessionReplaced) return;
    setBanner(
      attempt > 1
        ? `Connection lost. Trying again… (${attempt})`
        : "Connection lost. Coming back…",
      "error",
    );
  });

  socket.io.on("reconnect", () => {
    if (sessionReplaced) return;
    setBanner("Back in the room.", "info");
  });

  socket.on("state", handleState);

  /* The drawing board travels on its own channel, not in the game state. */
  socket.on("draw:stroke", (stroke) => {
    applyDrawStroke(stroke);
  });

  socket.on("draw:sync", (payload) => {
    syncDrawBoard(payload);
  });

  socket.on("draw:remove", (payload) => {
    removeDrawStroke(payload);
  });

  socket.on("draw:clear", () => {
    clearDrawBoard();
  });

  socket.on("room:closed", () => {
    clearSession();
    showStep("code");
    showError(dom.codeError, "The host closed this room. Ask for the new code.");
  });

  socket.on("room:removed", () => {
    clearSession();
    showStep("code");
    showError(dom.codeError, "The host removed you from the room.");
  });

  socket.on("session:replaced", () => {
    sessionReplaced = true;
    clearSession();
    socket.disconnect();
    showStep("code");
    showError(
      dom.codeError,
      "This room is open in another tab. Only one tab can play at a time.",
    );
    setBanner("");
  });
}

function normalizeCode(value) {
  return String(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5);
}

function resetLobby() {
  dom.lobbyCode.textContent = "-----";
  dom.lobbyCount.textContent = "0 players";
  dom.lobbyStatus.textContent = "Connecting…";
  dom.lobbyPlayers.replaceChildren();
  dom.lobbyPlaylist.replaceChildren();
  dom.lobbyPlaylist.hidden = true;
  dom.lobbyHint.textContent = "The admin will start the game from the console.";
}

dom.codeInput.addEventListener("input", () => {
  dom.codeInput.value = normalizeCode(dom.codeInput.value);
  clearError(dom.codeError);
});

dom.nameInput.addEventListener("input", () => {
  clearError(dom.nameError);
});

async function checkRoomCode(code) {
  if (codeCheckInFlight) return;
  clearError(dom.codeError);

  if (!/^[A-Z2-9]{5}$/.test(code)) {
    showError(dom.codeError, "Enter the 5-character room code.");
    dom.codeInput.focus();
    return;
  }

  if (!socket?.connected) {
    showError(dom.codeError, "Still connecting. Try again in a moment.");
    return;
  }

  codeCheckInFlight = true;
  setBusy(dom.codeSubmit, true, "Checking…", "Continue");

  try {
    const result = await emitAck(socket, "room:check", { code });

    if (!result?.ok) {
      showError(dom.codeError, result?.message || "That room code was not found.");
      dom.codeInput.focus();
      return;
    }

    if (!result.room?.joinable) {
      const reason = result.room?.locked
        ? "The host has locked this room."
        : result.room?.phase !== "lobby"
          ? "That game has already started."
          : "That room is full.";
      showError(dom.codeError, reason);
      return;
    }

    pendingCode = result.room.code;
    dom.pendingCode.textContent = pendingCode;
    // The last name is offered again, so a returning player does not have
    // to type it.
    dom.nameInput.value = lastName();
    clearError(dom.nameError);
    showStep("name");
    setTimeout(() => dom.nameInput.focus(), 50);
  } catch (error) {
    showError(dom.codeError, error.message);
  } finally {
    codeCheckInFlight = false;
    setBusy(dom.codeSubmit, false, "Checking…", "Continue");
  }
}

dom.codeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (dom.codeSubmit.disabled) return;
  void checkRoomCode(normalizeCode(dom.codeInput.value));
});

dom.nameForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (dom.nameSubmit.disabled) return;

  clearError(dom.nameError);
  const name = dom.nameInput.value.replace(/\s+/g, " ").trim();
  const length = Array.from(name).length;

  if (length < 1 || length > 16) {
    showError(dom.nameError, "Enter a name between 1 and 16 characters.");
    dom.nameInput.focus();
    return;
  }

  if (!socket?.connected) {
    showError(dom.nameError, "Still connecting. Try again in a moment.");
    return;
  }

  setBusy(dom.nameSubmit, true, "Joining…", "Join room");

  try {
    const result = await emitAck(socket, "room:join", {
      code: pendingCode,
      name,
    });

    if (!result?.ok) {
      showError(dom.nameError, result?.message || "Could not join the room.");
      dom.nameInput.focus();
      return;
    }

    saveSession({ code: result.code, token: result.token, name });
    rememberName(name);
    rememberRoom(result.code, name);
    dom.lobbyCode.textContent = result.code;
    dom.lobbyStatus.textContent = "Joining the room…";
    showStep("lobby");
  } catch (error) {
    showError(dom.nameError, error.message);
  } finally {
    setBusy(dom.nameSubmit, false, "Joining…", "Join room");
  }
});

dom.backToCode.addEventListener("click", () => {
  pendingCode = "";
  dom.pendingCode.textContent = "----";
  clearError(dom.nameError);
  showStep("code");
  dom.codeInput.focus();
});

dom.leaveRoom.addEventListener("click", () => void leaveRoom());

dom.lobbyCode.addEventListener("click", async () => {
  const code = dom.lobbyCode.textContent.trim();
  if (!/^[A-Z2-9]{5}$/.test(code)) return;

  try {
    await copyText(code);
    showToast("Room code copied");
  } catch {
    showToast(`Room code: ${code}`);
  }
});

dom.lobbyInvite.addEventListener("click", async () => {
  const url = inviteUrl();
  if (!url) return;
  try {
    await copyText(url);
    showToast("Invite link copied");
  } catch {
    showToast(url);
  }
});

dom.useSavedRoom.addEventListener("click", () => {
  const recent = loadRecentRoom();
  if (!recent) return;
  dom.codeInput.value = recent.code;
  dom.nameInput.value = recent.name || lastName();
  void checkRoomCode(recent.code);
});

dom.clearSavedRoom.addEventListener("click", () => {
  forgetRoom();
  showToast("Saved room forgotten");
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  dom.installApp.hidden = false;
});

dom.installApp.addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  const choice = await installPrompt.userChoice;
  if (choice.outcome === "accepted") showToast("Family Game Hub installed");
  installPrompt = null;
  dom.installApp.hidden = true;
});

window.addEventListener("appinstalled", () => {
  installPrompt = null;
  dom.installApp.hidden = true;
  showToast("Ready for game night");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // The game remains fully usable if a host blocks service workers.
    });
  });
}

function intro() {
  if (!window.gsap || prefersReducedMotion()) return;

  const targets = document.querySelectorAll(".brand, .card");
  window.gsap.from(targets, {
    y: 18,
    autoAlpha: 0,
    duration: 0.55,
    stagger: 0.07,
    ease: "power3.out",
    clearProps: "opacity,visibility,transform",
  });
}

if (inviteCode && session && session.code !== inviteCode) {
  clearSession();
}

if (session) {
  dom.lobbyCode.textContent = session.code;
  dom.lobbyStatus.textContent = "Rejoining your room…";
  showStep("lobby");
} else {
  showStep("code");
}

hydrateIcons();
renderSavedRoom();
void hydratePersistentState();
connectSocket();
intro();
window.__FG_READY__ = "player";
