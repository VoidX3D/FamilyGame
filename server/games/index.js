/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
import * as actItOut from "./actItOut.js";
import * as drawIt from "./drawIt.js";
import * as oneOfUs from "./oneOfUs.js";
import * as truthOrDare from "./truthOrDare.js";
import * as whoIsIt from "./whoIsIt.js";
import * as whoWroteThat from "./whoWroteThat.js";
import { whoAmI, whereAmI } from "./turnGuess.js";
import * as captionThis from "./captionThis.js";
import * as emojiGuess from "./emojiGuess.js";
import * as spyfall from "./spyfall.js";
import * as wouldYouRather from "./wouldYouRather.js";
import * as twoTruthsOneLie from "./twoTruthsOneLie.js";

const engines = [
  actItOut,
  drawIt,
  oneOfUs,
  whoIsIt,
  whoAmI,
  whereAmI,
  truthOrDare,
  whoWroteThat,
  captionThis,
  emojiGuess,
  spyfall,
  wouldYouRather,
  twoTruthsOneLie,
];

export const GAMES = new Map(
  engines.map((engine) => [engine.meta.id, engine]),
);

export const GAME_LIST = engines.map((engine) => ({ ...engine.meta }));

export function getGame(gameId) {
  return GAMES.get(String(gameId ?? "")) ?? null;
}
