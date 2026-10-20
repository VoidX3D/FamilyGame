import * as actItOut from "./actItOut.js";
import * as drawIt from "./drawIt.js";
import * as oneOfUs from "./oneOfUs.js";
import * as truthOrDare from "./truthOrDare.js";
import * as whoIsIt from "./whoIsIt.js";
import * as whoWroteThat from "./whoWroteThat.js";
import { whoAmI, whereAmI } from "./turnGuess.js";

const engines = [
  actItOut,
  drawIt,
  oneOfUs,
  whoIsIt,
  whoAmI,
  whereAmI,
  truthOrDare,
  whoWroteThat,
];

export const GAMES = new Map(
  engines.map((engine) => [engine.meta.id, engine]),
);

export const GAME_LIST = engines.map((engine) => ({ ...engine.meta }));

export function getGame(gameId) {
  return GAMES.get(String(gameId ?? "")) ?? null;
}
