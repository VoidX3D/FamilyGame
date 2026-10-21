/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
/* Where the API is.
 *
 * This is the one place in the front end that decides which backend to
 * talk to. Every other file imports the answer from here, so there is no
 * second copy to fall out of step with the first.
 *
 * Three ways to point the app somewhere, in order of precedence:
 *
 *   1. window.APP_CONFIG set before this file is evaluated. A test or a
 *      page that wants a different backend sets it first.
 *   2. A <meta name="api-url" content="..."> tag in the page. Use this
 *      when the site is deployed somewhere that is not Vercel.
 *   3. The defaults: the local API in development, the deployed backend
 *      everywhere else.
 *
 * The addresses themselves live in ./endpoints.js, so the hosts and the
 * ports are written down exactly once.
 */

import { DEPLOYED_API, LOCAL_API, isLocalHost } from "./endpoints.js";

/* A trailing slash would make every path read as "//api/games". */
function tidy(url) {
  return String(url ?? "").trim().replace(/\/+$/, "");
}

function fromWindow() {
  const preset = window.APP_CONFIG?.API_URL;
  return typeof preset === "string" && preset.trim() ? tidy(preset) : null;
}

function fromMeta() {
  const tag = document.querySelector('meta[name="api-url"]');
  const value = tag?.content?.trim();
  return value ? tidy(value) : null;
}

function resolve() {
  return (
    fromWindow() ??
    fromMeta() ??
    (isLocalHost(location.hostname) ? LOCAL_API : DEPLOYED_API)
  );
}

export const API_URL = resolve();

/* Kept on the window as well, because the service worker and anything
 * else that is not a module may want to read it. */
window.APP_CONFIG = { ...(window.APP_CONFIG ?? {}), API_URL };
