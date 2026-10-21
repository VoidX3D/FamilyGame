/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
/* The connection to the backend.
 *
 * The address comes from ./config.js, which is the one place that decides
 * where the API is. Nothing in this file decides anything about hosts or
 * ports, so there is no second copy to fall out of step. */

import { API_URL } from "./config.js";

export { API_URL };

export function createSocket(auth) {
  if (!window.io) {
    throw new Error("The Socket.IO client did not load.");
  }

  return window.io(API_URL, {
    auth,
    transports: ["websocket", "polling"],
    // The connection is expected to drop now and then: a phone on mobile
    // data, a laptop that slept, a server that redeployed. It always tries
    // to come back, with a short delay so a room full of phones does not
    // all reconnect at the same moment.
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 600,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.4,
    timeout: 10000,
  });
}

export function emitAck(socket, event, payload = {}, timeout = 7000) {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) {
      reject(new Error("Not connected to the game server."));
      return;
    }

    socket.timeout(timeout).emit(event, payload, (error, response) => {
      if (error) {
        reject(new Error("The server did not respond. Try again."));
        return;
      }
      resolve(response);
    });
  });
}

export async function api(path, { method = "GET", body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    // A blocked cross-origin request looks exactly like a dead server.
    throw new Error(
      `Could not reach the game server at ${API_URL}. If this site is not the one listed in the backend's FRONTEND_ORIGINS, the browser blocks the request.`,
      { cause: error },
    );
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Leave data null; the status code still explains the failure.
  }

  if (!response.ok || data?.ok === false) {
    const error = new Error(data?.error || `Request failed (${response.status}).`);
    error.status = response.status;
    error.code = data?.error;
    error.details = data?.errors ?? data?.details;
    error.data = data;
    throw error;
  }

  return data;
}
