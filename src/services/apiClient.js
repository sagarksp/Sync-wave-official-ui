import { API_URL, clearStoredAuth, getStoredAuth } from "../api";
import { discoverLog } from "./discover/discoverLogger";

const CACHE_PREFIX = "syncwave_api_cache:";

function cacheKey(path) {
  return `${CACHE_PREFIX}${path}`;
}

function friendlyError(err) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "Network unavailable";
  if (err?.name === "AbortError") return "Request timed out";
  if (err?.status === 429) return "Search limit reached";
  if (err?.status >= 500) return "Backend unavailable";
  return "No results found";
}

function readCache(path) {
  try {
    const raw = localStorage.getItem(cacheKey(path));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function writeCache(path, data) {
  try {
    localStorage.setItem(cacheKey(path), JSON.stringify({ data, cachedAt: Date.now() }));
  } catch (err) {
    // Local cache is best-effort.
  }
}

export async function apiClient(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const attempts = Math.max(1, Number(options.retries) || 2);
  const timeoutMs = Math.max(2500, Number(options.timeoutMs) || 10000);
  const cache = options.cache !== false && method === "GET";
  const auth = getStoredAuth();
  let lastError;

  for (let index = 0; index < attempts; index += 1) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    try {
      discoverLog("API", "request", { path, method, attempt: index + 1, timeoutMs });
      const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      };
      if (auth?.token) headers.Authorization = `Bearer ${auth.token}`;
      const response = await fetch(`${API_URL}${path}`, {
        ...options,
        method,
        headers,
        signal: options.signal || controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        clearStoredAuth();
        throw new Error("Session expired");
      }
      discoverLog("API", "response", { path, status: response.status, responseTimeMs: Date.now() - startedAt, items: data.reels?.length || data.articles?.length || 0 });
      if (!response.ok) {
        const err = new Error(data.message || data.error || "Backend unavailable");
        err.status = response.status;
        err.payload = data;
        throw err;
      }
      if (cache) writeCache(path, data);
      return data;
    } catch (err) {
      lastError = err;
      discoverLog("API", "error", { path, attempt: index + 1, status: err.status, error: err.message });
      if (err.status === 429) throw err;
      if (index < attempts - 1) await new Promise((resolve) => window.setTimeout(resolve, 450 * (index + 1)));
    } finally {
      window.clearTimeout(timer);
    }
  }

  if (cache) {
    const cached = readCache(path);
    if (cached?.data) {
      discoverLog("Cache", "local_hit", { path, cachedAt: cached.cachedAt });
      return { ...cached.data, fromLocalCache: true, cacheMessage: "Showing cached content" };
    }
  }
  throw new Error(friendlyError(lastError));
}
