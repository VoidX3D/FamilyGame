/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
/* The addresses this project talks to.
 *
 * This file has no DOM in it on purpose, so the browser, the dev server
 * and the test suites can all read the same numbers. There is exactly one
 * place where a host or a port is written down, and it is here.
 *
 * The one exception is the backend: `server/config.js` carries its own
 * copy of the allowed frontends, because the `backend` branch is a split
 * of `server/` alone and cannot reach this file. A smoke check makes sure
 * the two lists agree.
 */

/* The API port. The hosting service requires this one, so it is not a
 * choice that gets made anywhere else in the project. */
export const API_PORT = "12800";

/* The port the static preview runs on. Not a deployment port. */
export const WEB_PORT = "5173";

export const LOCAL_API = `http://localhost:${API_PORT}`;
export const LOCAL_WEB = `http://localhost:${WEB_PORT}`;

/* The deployed backend and the deployed front end. */
export const DEPLOYED_API = "https://familygame.wisp.uno";
export const DEPLOYED_WEB = "https://funfamilygame.vercel.app";

/* The origins the front end is allowed to be served from. The backend
 * keeps the same list in `server/config.js`. */
export const FRONTEND_ORIGINS = [
  `http://localhost:${WEB_PORT}`,
  `http://127.0.0.1:${WEB_PORT}`,
  DEPLOYED_WEB,
];

/* Every host the front end may have to talk to, for a content security
 * policy. */
export const CONNECT_ORIGINS = [
  LOCAL_API,
  `http://127.0.0.1:${API_PORT}`,
  DEPLOYED_API,
];

/* Is this a development machine? */
export function isLocalHost(hostname) {
  return ["localhost", "127.0.0.1", "0.0.0.0", "[::1]"].includes(
    String(hostname ?? ""),
  );
}
