import { api, createSocket, emitAck } from "./net.js";
import { avatar } from "./dom.js";
import { gameIcon, hydrateIcons, icon } from "./icons.js";

// Never accept or keep a passcode in the URL.
const initialParams = new URLSearchParams(location.search);
if (initialParams.has("passcode")) {
  initialParams.delete("passcode");
  const query = initialParams.toString();
  history.replaceState(
    history.state,
    "",
    `${location.pathname}${query ? `?${query}` : ""}${location.hash}`,
  );
}

/* Shared error sink. The browser smoke tests read this array, and it makes
 * runtime problems visible without needing the developer tools. */
window.__FG_ERRORS = [];
window.addEventListener("error", (event) => {
  window.__FG_ERRORS.push(String(event.message || event.error || "error"));
});
window.addEventListener("unhandledrejection", (event) => {
  window.__FG_ERRORS.push(
    String(event.reason?.message || event.reason || "unhandled rejection"),
  );
});

const TOKEN_KEY = "fg:adminToken";

const SUBMISSION_LABELS = {
  ready: "Roles seen",
  clues: "Clues",
  votes: "Votes",
  guesses: "Guesses",
  answers: "Answers",
  prompts: "Prompt sets",
  turns: "Turns",
  skippedPrompts: "Prompts skipped",
};

const PHASE_HINTS = {
  reveal: "Players are reading their roles.",
  clues: "Clues are coming in.",
  discuss: "Discussion is open. Start the vote when the room is ready.",
  vote: "Voting is in progress.",
  "imposter-guess": "The imposter is making a guess.",
  guess: "The guesser is working it out.",
  act: "The actor is acting it out.",
  results: "Turn complete.",
  complete: "Game complete.",
  writing: "Players are writing their answers.",
  guessing: "Players are matching answers to authors.",
  collect: "Players are writing truth and dare prompts.",
  play: "Turn by turn. Skip a turn if someone is stuck.",
  between: "The host is pacing the game night.",
};

const $ = (id) => document.getElementById(id);

/* The DOM helper used everywhere in this file. */
function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

const dom = {
  banner: $("connection-banner"),
  toast: $("toast"),
  login: $("admin-login"),
  loginForm: $("login-form"),
  passcode: $("passcode"),
  loginError: $("login-error"),
  loginSubmit: $("login-submit"),
  dashboard: $("admin-dashboard"),
  code: $("admin-code"),
  copyCode: $("copy-code"),
  joinUrl: $("admin-join-url"),
  copyInvite: $("copy-invite"),
  heroPlayerCount: $("hero-player-count"),
  heroConnectedCount: $("hero-connected-count"),
  roomState: $("room-state"),
  roomLock: $("room-lock"),
  toggleLock: $("toggle-lock"),
  resetRoom: $("reset-room"),
  logout: $("logout"),
  navItems: Array.from(document.querySelectorAll("[data-admin-tab]")),
  panels: Array.from(document.querySelectorAll("[data-admin-panel]")),
  players: $("admin-players"),
  startHint: $("start-hint"),
  liveEmpty: $("live-empty"),
  activeGame: $("active-game"),
  activeGameIcon: $("active-game-icon"),
  activeGameName: $("active-game-name"),
  activeGameRound: $("active-game-round"),
  activeGameStatus: $("active-game-status"),
  gameStats: $("game-stats"),
  gameControls: $("game-controls"),
  hostNotes: $("host-notes"),
  hostNotesList: $("host-notes-list"),
  gameScores: $("game-scores"),
  sessionScores: $("session-scores"),
  playlistGameControls: $("playlist-game-controls"),
  endGame: $("end-game"),
  replayGame: $("replay-game"),
  playlistHint: $("playlist-hint"),
  playlistBuilder: $("playlist-builder"),
  playlistPicker: $("playlist-picker"),
  playlistQueue: $("playlist-queue"),
  playlistAddAll: $("playlist-add-all"),
  playlistShuffle: $("playlist-shuffle"),
  startPlaylist: $("start-playlist"),
  clearPlaylist: $("clear-playlist"),
  playlistLive: $("playlist-live"),
  playlistLiveBadge: $("playlist-live-badge"),
  playlistProgress: $("playlist-progress"),
  playlistUpcoming: $("playlist-upcoming"),
  upcomingPicker: $("upcoming-picker"),
  addUpcoming: $("add-upcoming"),
  contentStatus: $("content-status"),
  contentCollection: $("content-collection"),
  contentSearch: $("content-search"),
  contentRefresh: $("content-refresh"),
  contentReset: $("content-reset"),
  contentError: $("content-error"),
  contentEditor: $("content-editor"),
  contentAdd: $("content-add"),
  contentSave: $("content-save"),
  contentDiscard: $("content-discard"),
  gameGrid: $("game-grid"),
  historyCard: $("history-card"),
  historyCount: $("history-count"),
  history: $("game-history"),
  prefConfirm: $("pref-confirm"),
};

let token = readToken();
let socket = null;
let currentState = null;
let catalog = [];
let catalogLoaded = false;
let catalogError = "";
let toastTimer = null;
let signingOut = false;
let playlistDraft = [];
let playlistBusy = false;
let upcomingPickerOpen = false;
let contentData = null;
let contentKey = "";
let contentDraft = [];
let contentDirty = false;
let contentLoading = false;
let contentSearch = "";
let confirmDestructive = readPreference("fg:confirmDestructive", true);
let activeTab = "room";

const ADMIN_TABS = ["room", "playlist", "live", "content", "settings"];
const ADMIN_PATHS = {
  room: "/admin/room",
  playlist: "/admin/playlist",
  live: "/admin/session",
  content: "/admin/content",
  settings: "/admin/config",
};
const PATH_TABS = {
  room: "room",
  playlist: "playlist",
  session: "live",
  live: "live",
  content: "content",
  config: "settings",
  settings: "settings",
};
activeTab = tabFromPath();

function readToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function readPreference(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function savePreference(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Preferences are optional; the console still works without storage.
  }
}

function tabFromPath() {
  const parts = location.pathname.split("/").filter(Boolean);
  if (parts[0] !== "admin") return "room";
  return PATH_TABS[parts[1]] ?? "room";
}

function setButtonLabel(button, label) {
  const node = button?.querySelector?.(".btn-label");
  if (node) node.textContent = label;
  else if (button) button.textContent = label;
}

function setButtonIcon(button, name) {
  const host = button?.querySelector?.(".btn-icon");
  if (!host) return;
  host.replaceChildren(icon(name));
}

function decorateButton(button, iconName, label) {
  button.replaceChildren(
    icon(iconName, { className: "btn-icon" }),
    Object.assign(document.createElement("span"), {
      className: "btn-label",
      textContent: label,
    }),
  );
  return button;
}

function decorateIconButton(button, iconName, label) {
  button.setAttribute("aria-label", label);
  button.title = label;
  button.replaceChildren(icon(iconName));
  return button;
}

function storeToken(next) {
  token = next;
  try {
    if (next) sessionStorage.setItem(TOKEN_KEY, next);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // The tab can still use an in-memory token.
  }
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
  toastTimer = setTimeout(() => dom.toast.classList.remove("is-visible"), 2400);
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

function inviteUrl(code = currentState?.admin?.code) {
  if (!code) return "";
  return `${location.origin}/g/${encodeURIComponent(code)}`;
}

async function copyInviteLink() {
  const url = inviteUrl();
  if (!url) return;
  try {
    await copyText(url);
    showToast("Invite link copied");
  } catch {
    showToast(url);
  }
}

async function copyRoomCode() {
  const code = currentState?.admin?.code;
  if (!code) return;
  try {
    await copyText(code);
    showToast("Room code copied");
  } catch {
    showToast(`Room code: ${code}`);
  }
}

function confirmAction(message) {
  return confirmDestructive ? window.confirm(message) : true;
}

function switchAdminTab(tab, { focus = false, historyMode = "push" } = {}) {
  if (!ADMIN_TABS.includes(tab)) return;
  activeTab = tab;

  for (const item of dom.navItems) {
    const selected = item.dataset.adminTab === tab;
    item.classList.toggle("is-active", selected);
    if (selected) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
    if (selected && focus) item.focus();
  }

  for (const panel of dom.panels) {
    panel.hidden = panel.dataset.adminPanel !== tab;
  }

  const path = ADMIN_PATHS[tab];
  if (historyMode !== "none" && location.pathname !== path) {
    window.history[`${historyMode}State`]({ tab }, "", path);
  }

  if (tab === "content" && !contentData && !contentLoading) void loadContent();
}

window.addEventListener("popstate", () => {
  switchAdminTab(tabFromPath(), { historyMode: "none" });
});

function setBusy(button, busy, busyLabel, idleLabel) {
  button.disabled = busy;
  setButtonLabel(button, busy ? busyLabel : idleLabel);
}

function showError(element, message) {
  element.textContent = message;
  element.hidden = false;
}

function clearError(element) {
  element.textContent = "";
  element.hidden = true;
}

function showLogin(message = "") {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  // A new host session must not inherit anything from the previous one.
  resetHostState();

  document.body.dataset.view = "login";
  dom.dashboard.hidden = true;
  dom.login.hidden = false;
  dom.passcode.value = "";

  if (message) showError(dom.loginError, message);
  else clearError(dom.loginError);

  setTimeout(() => dom.passcode.focus(), 50);
}

/* Clears every scrap of state that belongs to the signed-out host. */
function resetHostState() {
  currentState = null;
  playlistDraft = [];
  playlistBusy = false;
  upcomingPickerOpen = false;
  contentData = null;
  contentKey = "";
  contentDraft = [];
  contentDirty = false;
  contentLoading = false;
  contentSearch = "";
  playersSignature = "";
  catalogSignature = "";
  clearError(dom.contentError);
}

function showConsole() {
  document.body.dataset.view = "console";
  dom.login.hidden = true;
  dom.dashboard.hidden = false;
  clearError(dom.loginError);
  switchAdminTab(activeTab, { historyMode: "replace" });
  connectAdmin();
  void loadContent();
}

function canStartGame(admin, game) {
  const readyPhase =
    admin.phase === "lobby" ||
    (admin.phase === "between" && !admin.playlist?.active);
  return (
    readyPhase &&
    !admin.game &&
    !admin.playlist?.active &&
    admin.playerCount >= game.minPlayers &&
    admin.playerCount <= game.maxPlayers &&
    admin.connectedCount === admin.playerCount
  );
}

async function loadCatalog(force = false) {
  if (catalogLoaded && !force && catalog.length > 0) return;
  try {
    const result = await api("/api/games");
    catalog = Array.isArray(result.games) ? result.games : [];
    catalogLoaded = true;
    catalogError = "";
  } catch {
    catalogLoaded = true;
    catalog = [];
    catalogError = "Could not load the game list from the server.";
  }
  if (currentState) render(currentState);
}

/* Rebuilding a list replaces its buttons, so a click that is in flight can
 * be lost. The lists are therefore only rebuilt when their content really
 * changed. */
let playersSignature = "";
let catalogSignature = "";

function renderPlayers(admin) {
  const signature = (admin.players ?? [])
    .map((player) => `${player.id}:${player.name}:${player.connected ? 1 : 0}`)
    .join("|") + `#${admin.phase}`;
  if (signature === playersSignature) return;
  playersSignature = signature;

  dom.players.replaceChildren();
  const inLobby = admin.phase === "lobby";

  if (!Array.isArray(admin.players) || admin.players.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state empty-state-with-icon";
    const emptyIcon = make("span", "empty-icon");
    emptyIcon.append(icon("users", { size: 22 }));
    const copy = document.createElement("span");
    copy.textContent = inLobby
      ? "No players yet. Share the invite link."
      : "No players in this room.";
    empty.append(emptyIcon, copy);
    dom.players.append(empty);
    return;
  }

  for (const player of admin.players) {
    const row = document.createElement("li");
    row.className = "player-row";
    if (!player.connected) row.classList.add("is-offline");

    const avatarNode = avatar(player.name, player.id);

    const name = document.createElement("span");
    name.className = "player-name";
    name.textContent = player.name;

    const state = document.createElement("span");
    state.className = "player-connection";
    state.textContent = player.connected ? "Online" : "Offline";

    const dot = document.createElement("span");
    dot.className = "connection-dot";
    if (!player.connected) dot.classList.add("is-offline");
    dot.title = player.connected ? "Connected" : "Offline";

    row.append(avatarNode, name, state, dot);

    if (inLobby) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-button icon-button-danger remove-player";
      decorateIconButton(remove, "trash", `Remove ${player.name} from the room`);
      remove.addEventListener("click", () => void removePlayer(player));
      row.append(remove);
    }

    dom.players.append(row);
  }
}

function renderHint(admin) {
  if (admin.playlist?.active) {
    dom.startHint.textContent =
      "Game night is in progress. Use the playlist controls to pace the next game.";
    return;
  }

  if (admin.phase === "playing") {
    dom.startHint.textContent =
      "Game in progress. Use the live controls, or end the game to return to the lobby.";
    return;
  }

  if (admin.phase === "between") {
    dom.startHint.textContent =
      "Between games. Start the next playlist game, or choose a single game.";
    return;
  }

  if (admin.locked) {
    dom.startHint.textContent =
      "The room is locked. Unlock it to let more players in, or start a game with this group.";
    return;
  }

  const minPlayers = admin.minPlayers ?? 3;
  if (admin.connectedCount < minPlayers) {
    const remaining = minPlayers - admin.connectedCount;
    dom.startHint.textContent = `Need ${remaining} more ${
      remaining === 1 ? "player" : "players"
    } connected before a game can start. You can build the playlist now.`;
    return;
  }

  if (admin.connectedCount !== admin.playerCount) {
    dom.startHint.textContent =
      "Some players are offline. They will sit the next game out and rejoin automatically.";
    return;
  }

  dom.startHint.textContent =
    "Everyone is connected. Pick a game, or build a playlist for the whole night.";
}

function renderGameStats(game) {
  dom.gameStats.replaceChildren();
  const entries = Object.entries(game.submissions ?? {});

  for (const [key, value] of entries) {
    const stat = document.createElement("div");
    stat.className = "admin-stat";
    const label = document.createElement("span");
    label.className = "admin-stat-label";
    label.textContent = SUBMISSION_LABELS[key] ?? key;
    const count = document.createElement("strong");
    count.className = "admin-stat-value";
    count.textContent =
      value.total === null || value.total === undefined
        ? String(value.count ?? 0)
        : `${value.count ?? 0} / ${value.total}`;
    stat.append(label, count);
    dom.gameStats.append(stat);
  }
}

/* Every host action goes through here so that an expired session, a rate
 * limit or a rejected action always produces the same clear message. */
async function emitAdmin(event, payload, fallback) {
  let result;
  try {
    result = await emitAck(socket, event, payload ?? {});
  } catch (error) {
    showToast(error?.message || fallback);
    return null;
  }

  if (!result?.ok) {
    if (handleAdminFailure(result)) return null;
    showToast(result?.message || fallback);
    return null;
  }

  return result;
}

async function runControl(control, button) {
  button.disabled = true;
  try {
    if (control.event === "nextRound") {
      await emitAdmin("admin:nextRound", {}, "Could not advance.");
    } else if (control.event === "replay") {
      await emitAdmin("admin:replayGame", {}, "Could not restart.");
    } else {
      await emitAdmin(
        "admin:gameAction",
        { type: control.id },
        "Action unavailable.",
      );
    }
  } finally {
    button.disabled = false;
  }
}

function controlIcon(control) {
  const id = String(control.id ?? "").toLowerCase();
  const label = String(control.label ?? "").toLowerCase();
  if (id.includes("next") || label.includes("next")) return "arrow-right";
  if (id.includes("replay") || label.includes("restart")) return "rotate-ccw";
  if (id.includes("reveal") || label.includes("reveal")) return "eye";
  if (id.includes("skip") || label.includes("skip")) return "skip-forward";
  if (id.includes("end") || label.includes("end")) return "stop";
  if (id.includes("start") || label.includes("start")) return "play";
  if (label.includes("finish")) return "check";
  return "arrow-right";
}

function renderGameControls(game) {
  dom.gameControls.replaceChildren();
  const controls = Array.isArray(game.controls) ? game.controls : [];

  if (controls.length === 0) {
    const hint = document.createElement("p");
    hint.className = "fine";
    hint.textContent =
      game.phase === "complete"
        ? "The game is complete. Restart it or end it to return to the lobby."
        : "No host action is needed right now. Players are taking their turns.";
    dom.gameControls.append(hint);
    return;
  }

  for (const control of controls) {
    const node = document.createElement("button");
    node.type = "button";
    node.className =
      control.tone === "primary"
        ? "btn btn-primary btn-inline"
        : "btn btn-tonal btn-inline";
    decorateButton(node, controlIcon(control), control.label);
    node.addEventListener("click", () => void runControl(control, node));
    dom.gameControls.append(node);
  }
}

function renderGameScores(game, state) {
  dom.gameScores.replaceChildren();
  if (!game.hasScore) {
    dom.gameScores.hidden = true;
    return;
  }
  dom.gameScores.hidden = false;

  const playlistMode = Boolean(state.public?.playlist);
  const players = game.players ?? state.public?.players ?? [];
  const rows = players
    .map((player) => ({
      ...player,
      points: state.public?.scores?.[player.id] ?? 0,
      session: state.public?.sessionScores?.[player.id] ?? 0,
    }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.session - a.session ||
        a.name.localeCompare(b.name),
    );

  const title = document.createElement("p");
  title.className = "label";
  title.textContent = "Current game scores";
  dom.gameScores.append(title);

  const list = document.createElement("ul");
  list.className = "score-list";
  for (const row of rows) {
    const item = document.createElement("li");
    item.className = "score-row";
    const name = document.createElement("span");
    name.className = "player-name";
    name.textContent = row.name;
    const points = document.createElement("span");
    points.className = "score-points";
    points.textContent = String(row.points);
    item.append(name);
    if (playlistMode) {
      const session = document.createElement("span");
      session.className = "session-points";
      session.textContent = `${row.session} session`;
      item.append(session);
    }
    item.append(points);
    list.append(item);
  }
  dom.gameScores.append(list);
}

function renderSessionScores(admin) {
  const playlist = admin.playlist;
  dom.sessionScores.replaceChildren();
  dom.sessionScores.hidden = !playlist;
  if (!playlist) return;

  const players = Array.isArray(admin.players) ? admin.players : [];
  const rows = players
    .map((player) => ({
      ...player,
      session: admin.sessionScores?.[player.id] ?? 0,
    }))
    .sort(
      (a, b) => b.session - a.session || a.name.localeCompare(b.name),
    );

  const title = document.createElement("p");
  title.className = "label";
  title.textContent = "Game night totals";
  dom.sessionScores.append(title);

  const list = document.createElement("ul");
  list.className = "score-list";
  for (const row of rows) {
    const item = document.createElement("li");
    item.className = "score-row";
    const name = document.createElement("span");
    name.className = "player-name";
    name.textContent = row.name;
    const points = document.createElement("span");
    points.className = "score-points";
    points.textContent = String(row.session);
    item.append(name, points);
    list.append(item);
  }
  dom.sessionScores.append(list);
}

function renderHostNotes(game) {
  const assignment = game?.assignment;
  const notes = Array.isArray(assignment?.hints) ? assignment.hints : [];
  const hasAnswer = Boolean(assignment?.name);
  dom.hostNotesList.replaceChildren();
  dom.hostNotes.hidden = !hasAnswer && notes.length === 0;
  if (dom.hostNotes.hidden) return;

  if (hasAnswer) {
    const answer = document.createElement("li");
    answer.className = "host-answer";
    answer.textContent = `Current answer: ${assignment.name}${
      assignment.group ? ` · ${assignment.group}` : ""
    }`;
    dom.hostNotesList.append(answer);
  }

  for (const note of notes) {
    dom.hostNotesList.append(
      Object.assign(document.createElement("li"), { textContent: note }),
    );
  }
}

function playlistActionIcon(label) {
  const value = String(label).toLowerCase();
  if (value.includes("next") || value.includes("start")) return "play";
  if (value.includes("finish")) return "check-circle";
  if (value.includes("skip")) return "skip-forward";
  if (value.includes("end")) return "stop";
  if (value.includes("back") || value.includes("lobby")) return "door-open";
  return "arrow-right";
}

function playlistActionButton(label, tone, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className =
    tone === "primary"
      ? "btn btn-primary btn-inline"
      : tone === "text"
        ? "btn btn-text btn-inline"
        : "btn btn-tonal btn-inline";
  decorateButton(button, playlistActionIcon(label), label);
  button.disabled = playlistBusy;
  button.addEventListener("click", () => void handler());
  return button;
}

function renderPlaylistGameControls(admin) {
  dom.playlistGameControls.replaceChildren();
  const playlist = admin.playlist;
  if (!playlist) return;

  if (playlist.active) {
    if (
      admin.game?.phase === "complete" ||
      playlist.awaitingNext ||
      !admin.game
    ) {
      dom.playlistGameControls.append(
        playlistActionButton(
          playlist.next ? "Start next game" : "Finish playlist",
          "primary",
          nextPlaylistGame,
        ),
      );
    } else if (admin.game) {
      dom.playlistGameControls.append(
        playlistActionButton("Skip current game", "tonal", skipPlaylistGame),
      );
    }
    dom.playlistGameControls.append(
      playlistActionButton("End playlist", "text", endPlaylist),
    );
  } else if (playlist.finished) {
    dom.playlistGameControls.append(
      playlistActionButton("Back to lobby", "tonal", returnToLobby),
    );
  }
}

function renderActiveGame(state) {
  const admin = state.admin;
  const game = admin.game;
  const playlist = admin.playlist;
  dom.activeGame.hidden = !game && !playlist;
  dom.liveEmpty.hidden = Boolean(game) || Boolean(playlist);

  if (!game) {
    if (!playlist) return;

    dom.activeGameIcon.replaceChildren(icon("list", { size: 22 }));
    dom.activeGameName.textContent = "Playlist";
    dom.activeGameRound.textContent = `${playlist.completed?.length ?? 0} / ${playlist.total}`;
    dom.activeGameStatus.textContent = playlist.awaitingNext
      ? "Ready for the next game."
      : playlist.active
        ? "Playlist in progress."
        : "Playlist finished.";
    dom.gameStats.replaceChildren();
    dom.gameControls.replaceChildren();
    dom.hostNotes.hidden = true;
    dom.hostNotesList.replaceChildren();
    dom.gameScores.hidden = true;
    dom.gameScores.replaceChildren();
    dom.endGame.hidden = true;
    dom.replayGame.hidden = true;
    renderSessionScores(admin);
    renderPlaylistGameControls(admin);
    return;
  }

  dom.endGame.hidden = false;
  dom.activeGameIcon.replaceChildren(
    icon(gameIcon(game.id ?? game.gameId ?? game.name), { size: 22 }),
  );
  dom.activeGameName.textContent = game.name;
  if (game.oneTurnEach) {
    dom.activeGameRound.textContent = `Turn ${game.turnNumber} / ${game.totalTurns}`;
  } else if (game.endless) {
    dom.activeGameRound.textContent = `Pass ${game.pass ?? 1}`;
  } else {
    dom.activeGameRound.textContent = `Round ${game.round} / ${game.maxRounds}`;
  }

  let status = PHASE_HINTS[game.phase] ?? "Game in progress.";
  if (game.phase === "guess" && game.activePlayerName) {
    status = `${game.activePlayerName} is guessing. ${status}`;
  } else if (game.phase === "act" && game.actorName) {
    status = `${game.actorName} is acting. ${status}`;
  }
  dom.activeGameStatus.textContent = status;

  dom.endGame.disabled = false;
  setButtonLabel(
    dom.endGame,
    playlist?.active ? "End current game" : "End game",
  );
  dom.replayGame.disabled = Boolean(playlist?.active);
  dom.replayGame.hidden = Boolean(playlist?.active);

  renderGameStats(game);
  renderGameControls(game);
  renderHostNotes(game);
  renderGameScores(game, state);
  renderSessionScores(admin);
  renderPlaylistGameControls(admin);
}

function movePlaylistDraft(index, delta) {
  const next = index + delta;
  if (next < 0 || next >= playlistDraft.length) return;
  const [entry] = playlistDraft.splice(index, 1);
  playlistDraft.splice(next, 0, entry);
  if (currentState?.admin) renderPlaylist(currentState.admin);
}

function removePlaylistDraft(index) {
  playlistDraft.splice(index, 1);
  if (currentState?.admin) renderPlaylist(currentState.admin);
}

function addPlaylistDraft(game) {
  playlistDraft.push({
    gameId: game.id,
    name: game.name,
    minPlayers: game.minPlayers,
  });
  if (currentState?.admin) renderPlaylist(currentState.admin);
}

function duplicatePlaylistDraft(index) {
  const entry = playlistDraft[index];
  if (!entry) return;
  playlistDraft.splice(index + 1, 0, { ...entry });
  if (currentState?.admin) renderPlaylist(currentState.admin);
}

function shufflePlaylistDraft() {
  for (let index = playlistDraft.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [playlistDraft[index], playlistDraft[swap]] = [
      playlistDraft[swap],
      playlistDraft[index],
    ];
  }
  if (currentState?.admin) renderPlaylist(currentState.admin);
}

function renderPlaylistBuilder(admin) {
  dom.playlistPicker.replaceChildren();
  dom.playlistQueue.replaceChildren();

  if (!catalogLoaded) {
    const loading = document.createElement("p");
    loading.className = "empty-state";
    loading.textContent = "Loading games…";
    dom.playlistPicker.append(loading);
  } else if (catalog.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = catalogError || "No games are available.";
    dom.playlistPicker.append(empty);
  } else {
    for (const game of catalog) {
      const add = document.createElement("button");
      add.type = "button";
      add.className = "playlist-add";
      const gameGlyph = make("span", "playlist-add-icon");
      gameGlyph.append(icon(gameIcon(game.id), { size: 17 }));
      const name = make("span", "playlist-add-name", game.name);
      const meta = make("span", "playlist-add-meta", "Add");
      add.append(gameGlyph, name, meta);
      add.title = `Add ${game.name} to the queue`;
      add.addEventListener("click", () => addPlaylistDraft(game));
      dom.playlistPicker.append(add);
    }
  }

  if (playlistDraft.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state empty-state-with-icon";
    const emptyIcon = make("span", "empty-icon");
    emptyIcon.append(icon("list", { size: 22 }));
    empty.append(emptyIcon, make("span", null, "No games queued yet."));
    dom.playlistQueue.append(empty);
  }

  playlistDraft.forEach((entry, index) => {
    const item = document.createElement("li");
    item.className = "playlist-queue-row";

    const gameGlyph = make("span", "playlist-game-icon");
    gameGlyph.append(icon(gameIcon(entry.gameId), { size: 18 }));

    const position = make("span", "playlist-position", String(index + 1));

    const copy = make("div", "playlist-row-copy");
    copy.append(
      make("span", "player-name", entry.name),
      make("span", "fine", `Game ${index + 1} of ${playlistDraft.length}`),
    );

    const controls = make("div", "playlist-row-controls");

    const up = make("button", "icon-button");
    up.type = "button";
    decorateIconButton(up, "arrow-up", "Move up");
    up.disabled = index === 0;
    up.addEventListener("click", () => movePlaylistDraft(index, -1));

    const down = make("button", "icon-button");
    down.type = "button";
    decorateIconButton(down, "arrow-down", "Move down");
    down.disabled = index === playlistDraft.length - 1;
    down.addEventListener("click", () => movePlaylistDraft(index, 1));

    const duplicate = make("button", "icon-button");
    duplicate.type = "button";
    decorateIconButton(duplicate, "copy", `Duplicate ${entry.name}`);
    duplicate.addEventListener("click", () => duplicatePlaylistDraft(index));

    const remove = make("button", "icon-button icon-button-danger");
    remove.type = "button";
    decorateIconButton(remove, "trash", `Remove ${entry.name} from the queue`);
    remove.addEventListener("click", () => removePlaylistDraft(index));

    controls.append(up, down, duplicate, remove);
    item.append(gameGlyph, position, copy, controls);
    dom.playlistQueue.append(item);
  });

  const connected = admin.connectedCount ?? 0;
  const minPlayers = playlistDraft[0]?.minPlayers ?? admin.minPlayers ?? 3;
  const ready = connected >= minPlayers;
  const hasQueue = playlistDraft.length > 0;
  dom.startPlaylist.disabled = !hasQueue || !ready;
  dom.startPlaylist.title = !hasQueue
    ? "Add at least one game to the queue."
    : !ready
      ? `Start needs ${minPlayers} players online (${connected} online now).`
      : "Start this playlist";
  dom.clearPlaylist.disabled = !hasQueue;
  dom.playlistShuffle.disabled = playlistDraft.length < 2;

  if (!hasQueue) {
    dom.playlistHint.textContent = "Add games to the queue.";
  } else if (!ready) {
    dom.playlistHint.textContent = `${playlistDraft.length} ${
      playlistDraft.length === 1 ? "game" : "games"
    } queued. Start needs ${minPlayers} players online.`;
  } else {
    dom.playlistHint.textContent = `${playlistDraft.length} ${
      playlistDraft.length === 1 ? "game" : "games"
    } queued, starting with ${playlistDraft[0].name}.`;
  }
}

function playlistUpcomingIds() {
  const playlist = currentState?.admin?.playlist;
  if (!playlist) return [];
  return playlist.queue
    .slice(playlist.index + 1)
    .map((entry) => entry.gameId);
}

async function setUpcomingGameIds(gameIds) {
  if (playlistBusy) return;
  playlistBusy = true;
  if (currentState?.admin) renderPlaylist(currentState.admin);
  try {
    const result = await emitAck(socket, "admin:playlistSetUpcoming", {
      gameIds,
    });
    if (!result?.ok) {
      if (handleAdminFailure(result)) return;
      showToast(result?.message || "Could not update the upcoming games.");
      return;
    }
    showToast("Upcoming games updated");
  } catch (error) {
    showToast(error.message);
  } finally {
    playlistBusy = false;
    if (currentState?.admin) renderPlaylist(currentState.admin);
  }
}

function renderUpcomingPicker(admin, canEdit) {
  dom.upcomingPicker.replaceChildren();
  dom.upcomingPicker.hidden = !canEdit || !upcomingPickerOpen;
  if (dom.upcomingPicker.hidden) return;

  if (!catalogLoaded || catalog.length === 0) {
    const empty = document.createElement("p");
    empty.className = catalogError ? "empty-state is-error" : "empty-state";
    empty.textContent = catalogError || "Games are still loading.";
    dom.upcomingPicker.append(empty);
    return;
  }

  for (const game of catalog) {
    const add = document.createElement("button");
    add.type = "button";
    add.className = "playlist-add";
    add.disabled = playlistBusy;
    const gameGlyph = make("span", "playlist-add-icon");
    gameGlyph.append(icon(gameIcon(game.id), { size: 17 }));
    add.append(gameGlyph, make("span", "playlist-add-name", game.name), make("span", "playlist-add-meta", "Add"));
    add.title = `Add ${game.name} to upcoming games`;
    add.addEventListener("click", () => {
      void setUpcomingGameIds([...playlistUpcomingIds(), game.id]);
    });
    dom.upcomingPicker.append(add);
  }
}

function renderPlaylistLive(admin) {
  const playlist = admin.playlist;
  if (!playlist) return;

  const current = playlist.queue[playlist.index] ?? null;
  const currentName = current?.name ?? "None";

  if (dom.playlistLiveBadge) {
    dom.playlistLiveBadge.textContent = !playlist.active
      ? "Finished"
      : playlist.awaitingNext
        ? "Waiting for you"
        : "Host paced";
  }

  if (!playlist.active) {
    dom.playlistProgress.textContent = `Finished after ${
      playlist.completed?.length ?? 0
    } ${(playlist.completed?.length ?? 0) === 1 ? "game" : "games"}.`;
  } else if (playlist.awaitingNext) {
    dom.playlistProgress.textContent = `Game ${Math.min(
      playlist.index + 1,
      playlist.total,
    )} of ${playlist.total} (${currentName}) is complete. Start the next game when the room is ready.`;
  } else {
    dom.playlistProgress.textContent = `Game ${Math.min(
      playlist.index + 1,
      playlist.total,
    )} of ${playlist.total}: ${currentName}. Host-paced. Nothing starts until you continue.`;
  }

  const canEditUpcoming =
    playlist.active &&
    (admin.phase === "between" ||
      !admin.game ||
      admin.game.phase === "complete");
  const upcoming = playlist.queue.slice(playlist.index + 1);

  dom.playlistUpcoming.replaceChildren();
  if (upcoming.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "No upcoming games queued.";
    dom.playlistUpcoming.append(empty);
  } else {
    upcoming.forEach((entry, offset) => {
      const item = document.createElement("li");
      item.className = "playlist-upcoming-row";
      const gameGlyph = make("span", "playlist-game-icon");
      gameGlyph.append(icon(gameIcon(entry.gameId), { size: 18 }));
      const name = make("span", "player-name", entry.name);
      item.append(gameGlyph, name);

      if (canEditUpcoming) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "icon-button icon-button-danger";
        decorateIconButton(remove, "trash", "Remove upcoming game");
        remove.disabled = playlistBusy;
        remove.addEventListener("click", () => {
          const ids = playlistUpcomingIds();
          ids.splice(offset, 1);
          void setUpcomingGameIds(ids);
        });
        item.append(remove);
      }
      dom.playlistUpcoming.append(item);
    });
  }

  dom.addUpcoming.hidden = !playlist.active;
  dom.addUpcoming.disabled = !canEditUpcoming || playlistBusy;
  if (!canEditUpcoming && playlist.active && admin.game?.phase !== "complete") {
    dom.addUpcoming.title = "Finish the current game before editing upcoming games.";
  } else {
    dom.addUpcoming.removeAttribute("title");
  }
  renderUpcomingPicker(admin, canEditUpcoming);
}

function renderPlaylist(admin) {
  const playlist = admin.playlist;
  const canBuild = canBuildPlaylist(admin);

  dom.playlistBuilder.hidden = !canBuild;
  dom.playlistLive.hidden = !playlist;

  if (canBuild) {
    renderPlaylistBuilder(admin);
    dom.playlistHint.textContent = playlist
      ? "The game night is running. Add or remove the upcoming games below."
      : "Add games to build the queue. You decide when each one starts.";
  } else if (playlist) {
    dom.playlistHint.textContent =
      "The game night is running. Edit the upcoming games below.";
  } else {
    dom.playlistHint.textContent =
      "Playlist editing unlocks when the current game is finished or the room returns to the lobby.";
  }
  if (playlist) renderPlaylistLive(admin);
}

function canBuildPlaylist(admin) {
  return (
    !admin.game &&
    !admin.playlist?.active &&
    (admin.phase === "lobby" || admin.phase === "between")
  );
}

function renderCatalog(admin) {
  const signature = [
    catalog.map((game) => game.id).join(","),
    catalogError,
    admin.phase,
    admin.playerCount,
    admin.connectedCount,
    admin.game ? "game" : "none",
    admin.playlist?.active ? "playlist" : "lobby",
  ].join("#");
  if (signature === catalogSignature) return;
  catalogSignature = signature;

  dom.gameGrid.replaceChildren();

  if (!catalogLoaded) {
    const loading = document.createElement("p");
    loading.className = "empty-state";
    loading.textContent = "Loading games…";
    dom.gameGrid.append(loading);
    return;
  }

  if (catalog.length === 0) {
    const failed = document.createElement("p");
    failed.className = "empty-state is-error";
    failed.textContent = catalogError || "No games are available.";
    dom.gameGrid.append(failed);

    // A failed load must be recoverable without reloading the page.
    const retry = make("button", "btn btn-tonal btn-inline", "Try again");
    retry.type = "button";
    retry.addEventListener("click", () => void loadCatalog(true));
    dom.gameGrid.append(retry);
    return;
  }

  const playlistBuildable = canBuildPlaylist(admin);

  for (const game of catalog) {
    const startable = canStartGame(admin, game);
    const card = document.createElement("article");
    card.className = "game-card";
    if (!startable) card.classList.add("is-unavailable");

    const gameGlyph = make("span", "game-icon");
    gameGlyph.append(icon(gameIcon(game.id), { size: 22 }));

    const body = make("div", "game-body");
    const title = make("h3", null, game.name);
    const tagline = make("p", "game-tagline", game.tagline);

    const meta = make("div", "game-meta");
    const players = make(
      "span",
      "pill",
      `${game.minPlayers} to ${game.maxPlayers} players`,
    );
    const rounds = make(
      "span",
      "pill",
      game.oneTurnEach
        ? "One turn each"
        : game.endless
          ? "Endless turns"
          : game.maxRounds > 1
            ? `${game.maxRounds} rounds`
            : "One round",
    );
    meta.append(players, rounds);

    const actions = make("div", "game-actions");
    const start = document.createElement("button");
    start.type = "button";
    start.className = "btn btn-primary btn-inline game-start";
    decorateButton(start, "play", "Start");
    start.disabled = !startable;
    start.title = startable
      ? `Start ${game.name}`
      : admin.game || admin.playlist?.active
        ? "Finish the current game first."
        : `${game.name} needs ${game.minPlayers} to ${game.maxPlayers} connected players.`;
    start.addEventListener("click", () => void startGame(game));

    const add = document.createElement("button");
    add.type = "button";
    add.className = "btn btn-tonal btn-inline game-add";
    decorateButton(add, "plus", "Queue");
    add.disabled = !playlistBuildable;
    add.title = playlistBuildable
      ? `Add ${game.name} to the playlist`
      : "Playlist editing is available between games.";
    add.setAttribute("aria-label", `Add ${game.name} to the playlist`);
    add.addEventListener("click", () => {
      addPlaylistDraft(game);
      switchAdminTab("playlist");
      showToast(`${game.name} added to the playlist`);
    });

    actions.append(start, add);
    body.append(title, tagline, meta);
    card.append(gameGlyph, body, actions);
    dom.gameGrid.append(card);
  }
}

function renderHistory(admin) {
  const history = Array.isArray(admin.history) ? admin.history : [];
  dom.historyCard.hidden = history.length === 0;
  dom.historyCount.textContent = String(history.length);
  dom.history.replaceChildren();

  for (const entry of history) {
    const item = document.createElement("li");
    item.className = "history-entry";

    const head = document.createElement("div");
    head.className = "history-entry-head";
    const title = document.createElement("strong");
    title.textContent = entry.name;
    const when = document.createElement("span");
    when.className = "fine";
    when.textContent = new Date(entry.finishedAt).toLocaleString();
    head.append(title, when);

    const meta = document.createElement("p");
    meta.className = "fine";
    const progress =
      entry.maxRounds > 0
        ? `Round ${entry.round} of ${entry.maxRounds}`
        : "Completed";
    const reason =
      entry.reason === "ended"
        ? "ended by host"
        : entry.reason === "playlist_ended"
          ? "playlist ended"
          : entry.reason === "skipped"
            ? "skipped"
            : entry.reason;
    meta.textContent = `${progress} · ${reason}`;

    item.append(head, meta);

    if (Array.isArray(entry.scores) && entry.scores.length > 0) {
      const scores = document.createElement("div");
      scores.className = "history-scores";
      for (const row of entry.scores.slice(0, 5)) {
        scores.append(
          Object.assign(document.createElement("span"), {
            className: "pill",
            textContent: `${row.name} · ${row.points}`,
          }),
        );
      }
      item.append(scores);
    }

    dom.history.append(item);
  }
}


function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function currentCollection() {
  return (
    contentData?.collections?.find((entry) => entry.key === contentKey) ?? null
  );
}

function updateContentStatus() {
  const collection = currentCollection();

  if (!contentData) {
    dom.contentStatus.textContent = contentLoading
      ? "Loading game content…"
      : "Content is not loaded. Sign in again or refresh.";
    dom.contentSave.disabled = true;
    dom.contentAdd.disabled = true;
    dom.contentReset.disabled = true;
    dom.contentDiscard.disabled = true;
    return;
  }

  const bits = [
    `${contentDraft.length} ${contentDraft.length === 1 ? "entry" : "entries"}`,
  ];
  if (contentDirty) bits.push("Unsaved changes");
  else bits.push("All changes saved");
  if (contentData.status?.persisted === false) {
    bits.push("Disk save failed. Changes are in memory only");
  }
  dom.contentStatus.textContent = bits.join(" · ");
  dom.contentSave.disabled = !contentDirty || contentLoading;
  dom.contentAdd.disabled = !collection;
  dom.contentReset.disabled = !collection;
  dom.contentDiscard.disabled = !contentDirty || contentLoading;
}

function markContentDirty() {
  contentDirty = true;
  updateContentStatus();
}

function contentControls(index) {
  const controls = make("div", "content-row-controls");

  const up = make("button", "icon-button");
  up.type = "button";
  decorateIconButton(up, "arrow-up", "Move up");
  up.disabled = index === 0;
  up.addEventListener("click", () => {
    if (index === 0) return;
    const [item] = contentDraft.splice(index, 1);
    contentDraft.splice(index - 1, 0, item);
    markContentDirty();
    renderContent();
  });

  const down = make("button", "icon-button");
  down.type = "button";
  decorateIconButton(down, "arrow-down", "Move down");
  down.disabled = index === contentDraft.length - 1;
  down.addEventListener("click", () => {
    if (index >= contentDraft.length - 1) return;
    const [item] = contentDraft.splice(index, 1);
    contentDraft.splice(index + 1, 0, item);
    markContentDirty();
    renderContent();
  });

  const remove = make("button", "icon-button icon-button-danger");
  remove.type = "button";
  decorateIconButton(remove, "trash", "Remove this content entry");
  remove.addEventListener("click", () => {
    if (!confirmAction("Remove this content entry?")) return;
    contentDraft.splice(index, 1);
    markContentDirty();
    renderContent();
  });

  controls.append(up, down, remove);
  return controls;
}

function renderContentRow(item, index, collection) {
  const row = make("div", "content-row");

  if (collection.kind === "text") {
    const textarea = make("textarea", "field-input field-textarea");
    textarea.rows = 2;
    textarea.maxLength = collection.max ?? 180;
    textarea.value = String(item.text ?? "");
    textarea.placeholder = "Enter text…";
    textarea.addEventListener("input", () => {
      item.text = textarea.value;
      markContentDirty();
    });
    row.append(
      make("span", "content-index", String(index + 1)),
      textarea,
      contentControls(index),
    );
    return row;
  }

  const body = make("div", "content-item-body");
  const head = make("div", "content-item-head");
  head.append(make("span", "content-index", String(index + 1)));
  head.append(make("code", "content-id", item.id || "new entry"));
  head.append(contentControls(index));
  body.append(head);

  const fields = make("div", "content-fields");
  for (const field of collection.fields ?? []) {
    const label = make("label", "content-field");
    label.append(make("span", null, field.label));

    let input;
    if (field.type === "lines") {
      input = make("textarea", "field-input field-textarea");
      input.rows = 2;
      const value = Array.isArray(item[field.key])
        ? item[field.key].join("\n")
        : String(item[field.key] ?? "");
      input.value = value;
      input.placeholder = "One per line";

      const maxItems = field.maxItems ?? 8;
      const maxLength = (field.max ?? 120) * maxItems + maxItems;
      input.maxLength = maxLength;

      const error = make("span", "content-field-error");
      error.hidden = true;
      label.append(error);

      input.addEventListener("input", () => {
        const lines = input.value.split(/\r?\n/);
        const filled = lines.filter((line) => line.trim().length > 0);
        if (filled.length > maxItems) {
          // The server would silently drop the extra lines. Say so instead.
          input.value = filled.slice(0, maxItems).join("\n");
          item[field.key] = input.value;
          error.textContent = `Only ${maxItems} lines are kept.`;
          error.hidden = false;
        } else {
          item[field.key] = input.value;
          error.hidden = true;
        }
        markContentDirty();
      });
    } else {
      input = make("input", "field-input");
      input.type = "text";
      input.maxLength = field.max ?? 120;
      input.value = String(item[field.key] ?? "");
      input.addEventListener("input", () => {
        item[field.key] = input.value;
        markContentDirty();
      });
    }

    label.append(input);
    fields.append(label);
  }
  body.append(fields);
  row.append(body);
  return row;
}

function renderContent() {
  dom.contentCollection.replaceChildren();

  if (!contentData) {
    updateContentStatus();
    dom.contentCollection.disabled = true;
    dom.contentEditor.replaceChildren();
    const empty = make(
      "p",
      contentLoading ? "empty-state" : "empty-state is-error",
      contentLoading ? "Loading…" : "No content loaded.",
    );
    dom.contentEditor.append(empty);
    return;
  }

  const collections = Array.isArray(contentData.collections)
    ? contentData.collections
    : [];
  if (!collections.some((entry) => entry.key === contentKey)) {
    // The collection disappeared (or was never loaded). The draft belongs to
    // the old collection, so it must not be rendered against the new one.
    contentKey = collections[0]?.key ?? "";
    contentDraft = cloneJson(contentData.items?.[contentKey] ?? []) ?? [];
    contentDirty = false;
  }

  for (const collection of collections) {
    const option = document.createElement("option");
    option.value = collection.key;
    option.textContent = collection.label;
    dom.contentCollection.append(option);
  }
  dom.contentCollection.value = contentKey;
  dom.contentCollection.disabled = collections.length === 0;

  updateContentStatus();
  dom.contentEditor.replaceChildren();

  const collection = currentCollection();
  if (!collection) {
    dom.contentEditor.append(make("p", "empty-state", "Choose a collection."));
    return;
  }

  if (contentDraft.length === 0) {
    dom.contentEditor.append(
      make("p", "empty-state", "No entries. Add one before saving."),
    );
    return;
  }

  const query = contentSearch.trim().toLowerCase();
  const visible = [];
  contentDraft.forEach((entry, index) => {
    if (!query) {
      visible.push({ entry, index });
      return;
    }
    const haystack = JSON.stringify(entry).toLowerCase();
    if (haystack.includes(query)) visible.push({ entry, index });
  });

  if (visible.length === 0) {
    dom.contentEditor.append(
      make(
        "p",
        "empty-state",
        query
          ? `No entries match “${contentSearch.trim()}”.`
          : "No entries. Add one before saving.",
      ),
    );
    return;
  }

  for (const { entry, index } of visible) {
    dom.contentEditor.append(renderContentRow(entry, index, collection));
  }
}

async function loadContent({ force = false } = {}) {
  if (!token || contentLoading) return;
  if (contentDirty && !force) {
    renderContent();
    return;
  }

  contentLoading = true;
  updateContentStatus();
  try {
    const data = await api("/api/admin/content", { token });
    contentData = data;
    const keys = (data.collections ?? []).map((entry) => entry.key);
    if (!keys.includes(contentKey)) {
      contentKey = keys[0] ?? "";
      contentDraft = cloneJson(data.items?.[contentKey] ?? []) ?? [];
      contentDirty = false;
    }
    if (!contentDirty || force) {
      contentDraft = cloneJson(data.items?.[contentKey] ?? []) ?? [];
      contentDirty = false;
    }
    clearError(dom.contentError);
  } catch (error) {
    if (error.status === 401) {
      storeToken("");
      showLogin("Your admin session expired. Sign in again.");
      return;
    }
    // The status line is rewritten by updateContentStatus(), so the real
    // reason has to go into the error slot.
    showError(
      dom.contentError,
      "Could not load game content. Check the server and refresh.",
    );
    dom.contentStatus.textContent =
      "Could not load game content. Check the server and refresh.";
  } finally {
    contentLoading = false;
    renderContent();
  }
}

function selectContentCollection(key) {
  if (key === contentKey) return;
  if (contentDirty && !confirmAction("Discard unsaved content changes?")) {
    dom.contentCollection.value = contentKey;
    return;
  }

  contentKey = key;
  contentDraft = cloneJson(contentData?.items?.[key] ?? []) ?? [];
  contentDirty = false;
  clearError(dom.contentError);
  renderContent();
}

function addContentEntry() {
  const collection = currentCollection();
  if (!collection) return;

  const blank = {};
  for (const field of collection.fields ?? []) blank[field.key] = "";
  if (collection.kind === "text") blank.text = "";
  contentDraft.push(blank);
  contentDirty = true;
  clearError(dom.contentError);
  // A new entry may not match the active filter, so the filter is dropped.
  contentSearch = "";
  if (dom.contentSearch) dom.contentSearch.value = "";
  renderContent();
  dom.contentEditor.lastElementChild?.scrollIntoView({
    block: "nearest",
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
}

/* Checks the draft the same way the server will, so a blank required field
 * is reported here instead of failing the whole collection. */
function validateContentDraft(collection, items) {
  const problems = [];

  items.forEach((item, index) => {
    if (collection.kind === "text") {
      if (!String(item.text ?? "").trim()) {
        problems.push(`Entry ${index + 1}: text is required.`);
      }
      return;
    }

    for (const field of collection.fields ?? []) {
      const value = item[field.key];
      if (field.type === "lines") {
        const lines = Array.isArray(value)
          ? value
          : String(value ?? "")
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter(Boolean);
        if (field.minItems && lines.length < field.minItems) {
          problems.push(
            `Entry ${index + 1}: add at least ${field.minItems} ${field.label.toLowerCase()}.`,
          );
        }
      } else if (field.required && !String(value ?? "").trim()) {
        problems.push(
          `Entry ${index + 1}: ${field.label.toLowerCase()} is required.`,
        );
      }
    }
  });

  return problems;
}

async function saveContent() {
  const collection = currentCollection();
  if (!collection || !contentDirty) return;

  const items = cloneJson(contentDraft) ?? [];
  for (const item of items) {
    for (const field of collection.fields ?? []) {
      if (field.type === "lines" && typeof item[field.key] === "string") {
        item[field.key] = item[field.key]
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
      }
    }
  }

  const problems = validateContentDraft(collection, items);
  if (problems.length > 0) {
    showError(
      dom.contentError,
      `${problems[0]}${problems.length > 1 ? ` (+${problems.length - 1} more)` : ""}`,
    );
    showToast("Fix the highlighted entries before saving");
    return;
  }

  clearError(dom.contentError);
  setBusy(dom.contentSave, true, "Saving…", "Save changes");
  try {
    const result = await api(`/api/admin/content/${encodeURIComponent(contentKey)}`, {
      method: "PUT",
      token,
      body: { items },
    });
    contentData = result;
    contentDraft = cloneJson(result.items?.[contentKey] ?? []) ?? [];
    contentDirty = false;
    showToast(`${collection.game} content saved`);
  } catch (error) {
    if (error.status === 401) {
      storeToken("");
      showLogin("Your admin session expired. Sign in again.");
      return;
    }
    const details = Array.isArray(error.details)
      ? error.details.join(" ")
      : error.message;
    showError(dom.contentError, details);
    showToast("Content could not be saved");
  } finally {
    setBusy(dom.contentSave, false, "Saving…", "Save changes");
    renderContent();
  }
}

async function resetContent() {
  const collection = currentCollection();
  if (!collection) return;
  if (
    !confirmAction(
      `Reset ${collection.game} content to the built-in list? This replaces all edits in this collection.`,
    )
  ) {
    return;
  }

  clearError(dom.contentError);
  dom.contentReset.disabled = true;
  try {
    const result = await api(
      `/api/admin/content/${encodeURIComponent(contentKey)}/reset`,
      { method: "POST", token },
    );
    contentData = result;
    contentDraft = cloneJson(result.items?.[contentKey] ?? []) ?? [];
    contentDirty = false;
    showToast(`${collection.game} content reset`);
  } catch (error) {
    if (error.status === 401) {
      storeToken("");
      showLogin("Your admin session expired. Sign in again.");
      return;
    }
    showError(
      dom.contentError,
      "Could not reset this collection. The server rejected the request.",
    );
  } finally {
    renderContent();
  }
}

function render(state) {
  const admin = state?.admin;
  if (!admin) return;

  currentState = state;
  const code = admin.code;
  const url = inviteUrl(code);

  dom.code.textContent = code;
  dom.joinUrl.textContent = url;
  dom.joinUrl.title = url;
  dom.heroPlayerCount.textContent = `${admin.playerCount} / ${admin.maxPlayers}`;
  dom.heroConnectedCount.textContent = `${admin.connectedCount} online`;
  dom.roomState.textContent =
    admin.phase === "playing"
      ? "Game in progress"
      : admin.phase === "between"
        ? "Between games"
        : "Lobby";
  dom.roomLock.textContent = admin.locked ? "Locked" : "Open";
  setButtonLabel(dom.toggleLock, admin.locked ? "Unlock room" : "Lock room");
  setButtonIcon(dom.toggleLock, admin.locked ? "unlock" : "lock");
  dom.toggleLock.disabled = admin.phase !== "lobby";

  renderPlayers(admin);
  renderHint(admin);
  renderActiveGame(state);
  renderCatalog(admin);
  renderPlaylist(admin);
  renderHistory(admin);
}

async function createRoom() {
  if (!socket?.connected) return;

  const result = await emitAdmin(
    "admin:createRoom",
    {},
    "Could not create the room.",
  );
  if (!result) return;
  dom.code.textContent = result.code;
}

function handleAdminFailure(result) {
  if (result?.code === "admin_expired") {
    storeToken("");
    signingOut = true;
    showLogin("Your admin session expired. Sign in again.");
    return true;
  }
  return false;
}

function connectAdmin() {
  if (!token) {
    showLogin();
    return;
  }

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }

  try {
    socket = createSocket({ role: "admin", token });
  } catch {
    setBanner("The game client could not load. Refresh the page.", "error");
    return;
  }

  socket.on("connect", () => {
    signingOut = false;
    setBanner("");
    void createRoom();
  });

  socket.on("state", render);

  socket.on("disconnect", (reason) => {
    if (signingOut || reason === "io client disconnect") return;
    setBanner("Connection lost. Reconnecting…", "error");
  });

  socket.on("connect_error", (error) => {
    if (error?.message === "unauthorized") {
      storeToken("");
      showLogin("Your admin session expired. Sign in again.");
      return;
    }
    setBanner("Can't reach the game server. Retrying…", "error");
  });
}

async function verifyStoredToken() {
  if (!token) {
    showLogin();
    return;
  }

  try {
    await api("/api/admin/me", { token });
    showConsole();
  } catch (error) {
    if (error.status === 401) {
      storeToken("");
      showLogin("Enter the host passcode again.");
    } else {
      showLogin("Can't reach the game server. Check the backend and try again.");
    }
  }
}

async function removePlayer(player) {
  if (!confirmAction(`Remove ${player.name} from the room?`)) return;

  const result = await emitAdmin(
    "admin:removePlayer",
    { playerId: player.id },
    "Could not remove that player.",
  );
  if (!result) return;
  showToast(`${player.name} removed`);
}

async function startGame(game) {
  const admin = currentState?.admin;
  if (!admin) return;

  const offlineNote =
    admin.connectedCount < admin.playerCount
      ? " Offline players will sit this game out."
      : "";
  const extra = admin.playlist
    ? " This clears the finished playlist summary and starts a fresh session score."
    : "";
  if (
    !confirmAction(
      `Start ${game.name} with ${admin.connectedCount} ${
        admin.connectedCount === 1 ? "player" : "players"
      }?${offlineNote}${extra}`,
    )
  ) {
    return;
  }

  const result = await emitAdmin(
    "admin:startGame",
    { gameId: game.id },
    "Could not start that game.",
  );
  if (!result) return;
  playlistDraft = [];
  upcomingPickerOpen = false;
  showToast(`${game.name} started`);
}

async function toggleLock() {
  const admin = currentState?.admin;
  if (!admin || admin.phase !== "lobby") return;

  dom.toggleLock.disabled = true;
  try {
    const result = await emitAdmin(
      "admin:setLocked",
      { locked: !admin.locked },
      "Could not change the lock.",
    );
    if (!result) return;
    showToast(result.locked ? "Room locked" : "Room unlocked");
  } finally {
    dom.toggleLock.disabled = false;
  }
}

async function endGame() {
  const playlistMode = Boolean(currentState?.admin?.playlist?.active);
  const message = playlistMode
    ? "End the current playlist game? Its scores are final, and the playlist will wait for you to start the next game."
    : "End the current game and return to the lobby?";
  if (!confirmAction(message)) return;

  dom.endGame.disabled = true;
  try {
    const result = await emitAdmin(
      "admin:endGame",
      {},
      "Could not end the game.",
    );
    if (!result) return;
    upcomingPickerOpen = false;
    showToast(playlistMode ? "Current game ended" : "Game ended");
  } finally {
    dom.endGame.disabled = false;
  }
}

async function replayGame() {
  if (currentState?.admin?.playlist?.active) {
    showToast("Finish or skip the current game, then start the next one.");
    return;
  }

  if (!confirmAction("Restart this game from round one? Scores will reset.")) {
    return;
  }

  dom.replayGame.disabled = true;
  try {
    const result = await emitAdmin(
      "admin:replayGame",
      {},
      "Could not restart the game.",
    );
    if (!result) return;
    showToast("Game restarted");
  } finally {
    dom.replayGame.disabled = false;
  }
}

async function startPlaylist() {
  if (playlistBusy || playlistDraft.length === 0) return;
  const admin = currentState?.admin;
  if (!admin) return;

  const first = playlistDraft[0];
  const minPlayers = first.minPlayers ?? admin.minPlayers ?? 3;
  if (admin.connectedCount < minPlayers) {
    showToast(
      `At least ${minPlayers} players must be connected to start.`,
    );
    return;
  }

  const offlineNote =
    admin.connectedCount < admin.playerCount
      ? " Offline players will sit out the first game and can rejoin later."
      : "";
  if (
    !confirmAction(
      `Start a ${playlistDraft.length}-game playlist with ${first.name} first?${offlineNote}`,
    )
  ) {
    return;
  }

  playlistBusy = true;
  dom.startPlaylist.disabled = true;
  if (currentState?.admin) renderPlaylist(currentState.admin);
  try {
    const result = await emitAdmin(
      "admin:startPlaylist",
      { gameIds: playlistDraft.map((entry) => entry.gameId) },
      "Could not start the playlist.",
    );
    if (!result) return;
    playlistDraft = [];
    upcomingPickerOpen = false;
    showToast("Playlist started");
  } finally {
    playlistBusy = false;
    dom.startPlaylist.disabled = false;
    if (currentState?.admin) renderPlaylist(currentState.admin);
  }
}

function clearPlaylistDraft() {
  playlistDraft = [];
  if (currentState?.admin) renderPlaylist(currentState.admin);
}

async function nextPlaylistGame() {
  if (playlistBusy) return;
  playlistBusy = true;
  if (currentState?.admin) renderPlaylist(currentState.admin);
  try {
    const result = await emitAdmin(
      "admin:nextPlaylistGame",
      {},
      "Could not start the next game.",
    );
    if (!result) return;
    upcomingPickerOpen = false;
    showToast(result.finished ? "Playlist finished" : "Next game started");
  } finally {
    playlistBusy = false;
    if (currentState?.admin) {
      renderPlaylist(currentState.admin);
      renderActiveGame(currentState);
    }
  }
}

async function skipPlaylistGame() {
  if (playlistBusy) return;
  const playlist = currentState?.admin?.playlist;
  const current = playlist?.queue?.[playlist.index];
  if (
    !confirmAction(
      `Skip ${current?.name ?? "the current game"}? Its current scores are final for the game night total.`,
    )
  ) {
    return;
  }

  playlistBusy = true;
  if (currentState?.admin) renderPlaylist(currentState.admin);
  try {
    const result = await emitAdmin(
      "admin:skipPlaylistGame",
      {},
      "Could not skip that game.",
    );
    if (!result) return;
    upcomingPickerOpen = false;
    showToast("Game skipped. Start the next one when the room is ready.");
  } finally {
    playlistBusy = false;
    if (currentState?.admin) renderPlaylist(currentState.admin);
  }
}

async function endPlaylist() {
  if (playlistBusy) return;
  if (
    !confirmAction(
      "End the game night playlist? Session scores will be kept in the final summary.",
    )
  ) {
    return;
  }

  playlistBusy = true;
  if (currentState?.admin) renderPlaylist(currentState.admin);
  try {
    const result = await emitAdmin(
      "admin:endPlaylist",
      {},
      "Could not end the playlist.",
    );
    if (!result) return;
    upcomingPickerOpen = false;
    showToast("Playlist ended");
  } finally {
    playlistBusy = false;
    if (currentState?.admin) renderPlaylist(currentState.admin);
  }
}

async function returnToLobby() {
  if (playlistBusy) return;
  playlistBusy = true;
  if (currentState?.admin) renderPlaylist(currentState.admin);
  try {
    const result = await emitAdmin(
      "admin:returnToLobby",
      {},
      "Could not return to the lobby.",
    );
    if (!result) return;
    upcomingPickerOpen = false;
    showToast("Back in the lobby");
  } finally {
    playlistBusy = false;
    if (currentState?.admin) renderPlaylist(currentState.admin);
  }
}
function toggleUpcomingPicker() {
  upcomingPickerOpen = !upcomingPickerOpen;
  if (currentState?.admin) renderPlaylist(currentState.admin);
}

dom.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (dom.loginSubmit.disabled) return;

  clearError(dom.loginError);
  const passcode = dom.passcode.value;
  if (!passcode) {
    showError(dom.loginError, "Enter the host passcode.");
    dom.passcode.focus();
    return;
  }

  setBusy(dom.loginSubmit, true, "Checking…", "Continue");

  try {
    const result = await api("/api/admin/login", {
      method: "POST",
      body: { passcode },
    });
    storeToken(result.token);
    dom.passcode.value = "";
    showConsole();
  } catch (error) {
    if (error.code === "too_many_attempts") {
      showError(
        dom.loginError,
        "Too many attempts. Wait a few minutes, then try again.",
      );
    } else if (error.code === "invalid_passcode") {
      showError(dom.loginError, "That passcode is not correct.");
    } else {
      showError(
        dom.loginError,
        "Can't reach the game server. Check the backend and try again.",
      );
    }
    dom.passcode.focus();
  } finally {
    setBusy(dom.loginSubmit, false, "Checking…", "Continue");
  }
});

for (const item of dom.navItems) {
  item.addEventListener("click", (event) => {
    event.preventDefault();
    switchAdminTab(item.dataset.adminTab, { focus: true });
  });
}

for (const button of document.querySelectorAll("[data-goto-tab]")) {
  button.addEventListener("click", () =>
    switchAdminTab(button.dataset.gotoTab),
  );
}

dom.prefConfirm.addEventListener("change", () => {
  confirmDestructive = dom.prefConfirm.checked;
  savePreference("fg:confirmDestructive", confirmDestructive);
});

dom.code.addEventListener("click", () => void copyRoomCode());
dom.copyCode.addEventListener("click", () => void copyRoomCode());
dom.copyInvite.addEventListener("click", () => void copyInviteLink());

dom.toggleLock.addEventListener("click", () => void toggleLock());
dom.endGame.addEventListener("click", () => void endGame());
dom.replayGame.addEventListener("click", () => void replayGame());
dom.startPlaylist.addEventListener("click", () => void startPlaylist());
dom.clearPlaylist.addEventListener("click", clearPlaylistDraft);
dom.playlistAddAll.addEventListener("click", () => {
  const queued = new Set(playlistDraft.map((entry) => entry.gameId));
  const missing = catalog.filter((game) => !queued.has(game.id));
  if (missing.length === 0) {
    showToast("All games are already queued");
    return;
  }
  for (const game of missing) {
    playlistDraft.push({ gameId: game.id, name: game.name });
  }
  if (currentState?.admin) renderPlaylist(currentState.admin);
  showToast(`${missing.length} ${missing.length === 1 ? "game" : "games"} added`);
});
dom.playlistShuffle.addEventListener("click", shufflePlaylistDraft);
dom.addUpcoming.addEventListener("click", toggleUpcomingPicker);

dom.contentCollection.addEventListener("change", () => {
  selectContentCollection(dom.contentCollection.value);
});
dom.contentSearch.addEventListener("input", () => {
  contentSearch = dom.contentSearch.value;
  renderContent();
});
dom.contentRefresh.addEventListener("click", () => {
  if (
    contentDirty &&
    !confirmAction("Discard unsaved content changes and reload from the server?")
  ) {
    return;
  }
  void loadContent({ force: true });
});
dom.contentReset.addEventListener("click", () => void resetContent());
dom.contentAdd.addEventListener("click", addContentEntry);
dom.contentSave.addEventListener("click", () => void saveContent());
dom.contentDiscard.addEventListener("click", () => {
  if (!contentDirty) return;
  if (!confirmAction("Discard unsaved content changes?")) return;
  contentDraft = cloneJson(contentData?.items?.[contentKey] ?? []) ?? [];
  contentDirty = false;
  renderContent();
});

window.addEventListener("beforeunload", (event) => {
  if (!contentDirty) return;
  event.preventDefault();
  event.returnValue = "";
});

hydrateIcons();
dom.prefConfirm.checked = confirmDestructive;
renderContent();

dom.resetRoom.addEventListener("click", async () => {
  if (
    !confirmAction(
      "Close this room and create a new code? Everyone will need to rejoin.",
    )
  ) {
    return;
  }

  try {
    const result = await emitAck(socket, "admin:resetRoom", {});
    if (!result?.ok) {
      if (handleAdminFailure(result)) return;
      showToast(result?.message || "Could not create a new room.");
      return;
    }
    const maxPlayers = currentState?.admin?.maxPlayers ?? 10;
    playlistDraft = [];
    upcomingPickerOpen = false;
    currentState = null;
    playersSignature = "";
    catalogSignature = "";
    dom.players.replaceChildren();
    dom.heroPlayerCount.textContent = `0 / ${maxPlayers}`;
    dom.heroConnectedCount.textContent = "0 online";
    showToast(`New room: ${result.code}`);
  } catch (error) {
    showToast(error.message);
  }
});

dom.logout.addEventListener("click", async () => {
  signingOut = true;
  try {
    if (token) await api("/api/admin/logout", { method: "POST", token });
  } catch {
    // A local sign-out is enough if the network is down.
  }

  storeToken("");
  showLogin("Signed out.");
});

function intro() {
  if (!window.gsap || prefersReducedMotion()) return;

  const targets = document.querySelectorAll(".brand, .card, .foot");
  window.gsap.from(targets, {
    y: 18,
    autoAlpha: 0,
    duration: 0.55,
    stagger: 0.07,
    ease: "power3.out",
    clearProps: "opacity,visibility,transform",
  });
}

void verifyStoredToken();
void loadCatalog();
intro();
window.__FG_READY__ = "admin";
