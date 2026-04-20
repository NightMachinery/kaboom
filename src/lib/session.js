const GUEST_TOKEN_KEY = "kaboom_guest_token";
const GUEST_NAME_KEY = "kaboom_guest_name";
const ROOM_SESSION_PREFIX = "kaboom_room_session:";
const LAST_PLAYSET_KEY = "kaboom_last_playset";
const LAST_ROUND_TAB_KEY = "kaboom_last_round_tab";
const LAST_CUSTOM_ROUNDS_KEY = "kaboom_last_custom_rounds";

function randomHex(bytes = 24) {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function getGuestToken() {
  let token = localStorage.getItem(GUEST_TOKEN_KEY);
  if (!token) {
    token = randomHex();
    localStorage.setItem(GUEST_TOKEN_KEY, token);
  }
  return token;
}

export function getGuestName() {
  return localStorage.getItem(GUEST_NAME_KEY) || "";
}

export function setGuestName(name) {
  const normalized = String(name || "").trim();
  if (normalized) localStorage.setItem(GUEST_NAME_KEY, normalized);
  else localStorage.removeItem(GUEST_NAME_KEY);
}

export function getRoomSession(code) {
  return localStorage.getItem(`${ROOM_SESSION_PREFIX}${String(code || "").toUpperCase()}`) || "";
}

export function setRoomSession(code, token) {
  localStorage.setItem(`${ROOM_SESSION_PREFIX}${String(code || "").toUpperCase()}`, token);
}

export function clearRoomSession(code) {
  localStorage.removeItem(`${ROOM_SESSION_PREFIX}${String(code || "").toUpperCase()}`);
}

export function getRoomSessionFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("session") || "";
}

export function consumeRoomSessionFromURL(code) {
  const token = getRoomSessionFromURL();
  if (!token) return "";

  setRoomSession(code, token);

  const url = new URL(window.location.href);
  url.searchParams.delete("session");
  window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  return token;
}

export function buildCurrentRoomMigrationLink(token) {
  const url = new URL(window.location.href);
  url.searchParams.set("session", token);
  return url.toString();
}

export async function copyText(value) {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "readonly");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) throw new Error("copy_failed");
  return copied;
}

export function getLastPlaysetID() {
  return localStorage.getItem(LAST_PLAYSET_KEY) || "t0001";
}

export function setLastPlaysetID(id) {
  if (id) localStorage.setItem(LAST_PLAYSET_KEY, id);
}

export function getLastRoundTab() {
  return localStorage.getItem(LAST_ROUND_TAB_KEY) || "recommended";
}

export function setLastRoundTab(value) {
  localStorage.setItem(LAST_ROUND_TAB_KEY, value || "recommended");
}

export function getLastCustomRounds() {
  try {
    return JSON.parse(localStorage.getItem(LAST_CUSTOM_ROUNDS_KEY) || "null");
  } catch {
    return null;
  }
}

export function setLastCustomRounds(rounds) {
  localStorage.setItem(LAST_CUSTOM_ROUNDS_KEY, JSON.stringify(rounds || []));
}
