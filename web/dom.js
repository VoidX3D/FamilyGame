/* Small DOM helpers shared by the player app and the game screens. */

export function initials(name) {
  const parts = String(name ?? "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) return "?";
  return parts
    .map((part) => Array.from(part)[0] ?? "")
    .join("")
    .toUpperCase();
}

export function toneClass(playerId) {
  let hash = 0;
  for (const char of String(playerId ?? "")) {
    hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  }
  return `tone-${hash % 6}`;
}

export function avatar(name, id) {
  const node = document.createElement("span");
  node.className = `avatar ${toneClass(id)}`;
  node.textContent = initials(name);
  node.setAttribute("aria-hidden", "true");
  return node;
}
