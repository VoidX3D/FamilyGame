/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
/* Small DOM helpers shared by the player app and the game screens. */

/* An emoji in a name is the player's own picture of themselves, so it
 * beats two initials. The pattern takes a whole cluster: a flag is two
 * regional symbols, a family is several people joined together, and a
 * thumb with a skin tone is one thing rather than two. */
const EMOJI_CLUSTER =
  /(?:\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*)/gu;

/* The first emoji in the name, or null when there is not one. */
export function firstEmoji(name) {
  const match = String(name ?? "").match(EMOJI_CLUSTER);
  return match?.[0] ?? null;
}

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

/* What goes in the round badge: the emoji if there is one, otherwise the
 * initials. */
export function avatarText(name) {
  return firstEmoji(name) ?? initials(name);
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
  node.textContent = avatarText(name);
  node.setAttribute("aria-hidden", "true");
  return node;
}
