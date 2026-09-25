const STORAGE_KEY = "oxide_gate_session";

export function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

export function saveSession(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}
