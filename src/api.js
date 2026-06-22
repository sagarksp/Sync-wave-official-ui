const DEFAULT_SERVER_URL =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:3001"
    : "https://sync-wave-official-server.onrender.com";

export const API_URL = process.env.REACT_APP_API_URL || DEFAULT_SERVER_URL;
export const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || API_URL;

export function getStoredAuth() {
  const raw = localStorage.getItem("syncwave_auth") || sessionStorage.getItem("syncwave_auth");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

export function storeAuth(auth, remember) {
  const target = remember ? localStorage : sessionStorage;
  localStorage.removeItem("syncwave_auth");
  sessionStorage.removeItem("syncwave_auth");
  target.setItem("syncwave_auth", JSON.stringify(auth));
}

export function clearStoredAuth() {
  localStorage.removeItem("syncwave_auth");
  sessionStorage.removeItem("syncwave_auth");
}

export function getDeviceId() {
  let id = localStorage.getItem("syncwave_device_id");
  if (!id) {
    id = `device_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    localStorage.setItem("syncwave_device_id", id);
  }
  return id;
}

export async function apiFetch(path, options = {}) {
  const auth = getStoredAuth();
  const timeoutMs = options.timeoutMs || 12000;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (auth?.token) headers.Authorization = `Bearer ${auth.token}`;

  try {
    const res = await fetch(`${API_URL}${path}`, { ...options, headers, signal: options.signal || controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Connection timed out");
    throw err;
  } finally {
    window.clearTimeout(timeout);
  }
}
