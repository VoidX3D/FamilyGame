export const API_URL =
  window.APP_CONFIG?.API_URL ?? "http://localhost:3000";

export function createSocket(auth) {
  if (!window.io) {
    throw new Error("The Socket.IO client did not load.");
  }

  return window.io(API_URL, {
    auth,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
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

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

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
