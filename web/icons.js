/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
const SVG_NS = "http://www.w3.org/2000/svg";

const PATHS = {
  "arrow-down": '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  "arrow-right": '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  "arrow-up": '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
  "check": '<path d="M20 6 9 17l-5-5"/>',
  "check-circle":
    '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  "circle-help":
    '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-.9.7-1.7 1.2-1.7 2.7"/><path d="M12 17.5h.01"/>',
  clapperboard:
    '<path d="M20.2 6 3 11l-.9-2.4a2 2 0 0 1 1.4-2.5l13.5-4a2 2 0 0 1 2.5 1.4Z"/><path d="m6.2 5.3 3.1 3.9"/><path d="m12.4 3.4 3.1 4"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  copy:
    '<rect width="13" height="13" x="9" y="9" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  database:
    '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  dice:
    '<rect width="18" height="18" x="3" y="3" rx="4"/><path d="M8 8h.01"/><path d="M16 8h.01"/><path d="M12 12h.01"/><path d="M8 16h.01"/><path d="M16 16h.01"/>',
  download:
    '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 20h16"/>',
  "door-open":
    '<path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/><path d="M13 4.5v15L6 20V4.5Z"/>',
  "external-link":
    '<path d="M15 3h6v6"/><path d="m10 14 11-11"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  eye: '<path d="M2.1 12a10.9 10.9 0 0 1 19.8 0 10.9 10.9 0 0 1-19.8 0Z"/><circle cx="12" cy="12" r="3"/>',
  "eye-off":
    '<path d="m3 3 18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 4.2A10.9 10.9 0 0 1 21.9 12a10.6 10.6 0 0 1-2.7 3.9"/><path d="M6.6 6.6A10.9 10.9 0 0 0 2.1 12a10.9 10.9 0 0 0 13.4 6.6"/>',
  flame:
    '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.9-1.5-2.7-1.5-4.5A4.5 4.5 0 0 1 14 12c0-1.7 1-3.4 2-4.5a7 7 0 1 1-7.5 11.5c2.4 0 4.4-2 4.4-4.5"/>',
  gamepad:
    '<path d="M6 11h4"/><path d="M8 9v4"/><path d="M15 12h.01"/><path d="M18 10h.01"/><path d="M17.3 5H6.7a4 4 0 0 0-3.9 3.1l-1.3 6A2.6 2.6 0 0 0 6 16.3L8 14h8l2 2.3a2.6 2.6 0 0 0 4.5-2.2l-1.3-6A4 4 0 0 0 17.3 5Z"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  layers:
    '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  lock:
    '<rect width="16" height="11" x="4" y="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/>',
  unlock:
    '<rect width="16" height="11" x="4" y="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/><path d="M12 14v3"/>',
  "log-out":
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  "map-pin":
    '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  maximize:
    '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  minus: '<path d="M5 12h14"/>',
  moon: '<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"/>',
  pencil:
    '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  play: '<path d="m7 4 13 8-13 8Z"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  refresh:
    '<path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M5.1 9a7 7 0 0 1 11.3-2.8L20 10"/><path d="M18.9 15a7 7 0 0 1-11.3 2.8L4 14"/>',
  "rotate-ccw":
    '<path d="M4 10V4h6"/><path d="M4.5 4.5A8.5 8.5 0 1 1 3.5 14"/>',
  "search": '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  settings:
    '<path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21h-4v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.5V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  shield:
    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-5"/>',
  shuffle:
    '<path d="M3 6h3c4 0 4 12 8 12h4"/><path d="m15 15 3 3-3 3"/><path d="M3 18h3c1.5 0 2.5-1.7 3.4-4"/><path d="M14 6h4"/><path d="m15 3 3 3-3 3"/>',
  "skip-forward":
    '<path d="m5 4 10 8-10 8Z"/><path d="M19 5v14"/>',
  "sliders":
    '<path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M1 14h6"/><path d="M9 8h6"/><path d="M17 16h6"/>',
  sparkles:
    '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8Z"/>',
  stop:
    '<rect width="14" height="14" x="5" y="5" rx="2"/>',
  sun:
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m4.9 19.1 1.4-1.4"/><path d="m17.7 6.3 1.4-1.4"/>',
  trash:
    '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  "user-search":
    '<circle cx="10" cy="8" r="4"/><path d="M2 21a8 8 0 0 1 12.9-6.2"/><circle cx="18" cy="18" r="3"/><path d="m21 21-1.9-1.9"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
  "users-round":
    '<path d="M18 21a8 8 0 0 0-12 0"/><circle cx="12" cy="8" r="5"/><path d="M22 21a6 6 0 0 0-4-5.7"/><path d="M2 21a6 6 0 0 1 4-5.7"/>',
  "volume-2":
    '<path d="M11 5 6 9H2v6h4l5 4Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>',
  wifi:
    '<path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><path d="M12 20h.01"/>',
  "wifi-off":
    '<path d="m2 2 20 20"/><path d="M8.5 16a5 5 0 0 1 7 0"/><path d="M5 12.5a10 10 0 0 1 4-2.3"/><path d="M15 10.2a10 10 0 0 1 4 2.3"/><path d="M12 20h.01"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  "wand":
    '<path d="m15 4 5 5"/><path d="M3 21 17.5 6.5"/><path d="m14 10 4 4"/><path d="M6 3v3"/><path d="M4.5 4.5h3"/><path d="M20 16v3"/><path d="M18.5 17.5h3"/>',
};

const GAME_ICONS = {
  "act-it-out": "clapperboard",
  "one-of-us": "users-round",
  "who-is-it": "user-search",
  "who-am-i": "circle-help",
  "where-am-i": "map-pin",
  "truth-or-dare": "flame",
  "who-wrote-that": "pencil",
};

export function icon(name, { className = "", size = 20 } = {}) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", `icon ${className}`.trim());
  svg.dataset.iconName = name;
  svg.innerHTML = PATHS[name] ?? PATHS.sparkles;
  return svg;
}

export function gameIcon(gameId) {
  return GAME_ICONS[gameId] ?? "dice";
}

export function hydrateIcons(root = document) {
  for (const host of root.querySelectorAll("[data-icon]")) {
    if (host.dataset.iconReady === "true") continue;
    host.replaceChildren(icon(host.dataset.icon));
    host.dataset.iconReady = "true";
  }
}
