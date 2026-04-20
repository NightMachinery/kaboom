export async function apiFetch(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error || `request_failed_${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export function createRoom(body) {
  return apiFetch("/api/rooms", { method: "POST", body });
}

export function joinRoom(code, body) {
  return apiFetch(`/api/rooms/${String(code || "").toUpperCase()}/join`, {
    method: "POST",
    body,
  });
}

export function buildWebSocketURL(code, roomSessionToken) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(`${protocol}//${window.location.host}/ws`);
  url.searchParams.set("room", String(code || "").toUpperCase());
  url.searchParams.set("session", roomSessionToken);
  return url.toString();
}
