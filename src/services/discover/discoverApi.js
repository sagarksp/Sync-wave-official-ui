import { apiClient } from "../apiClient";

function params(query = {}) {
  const search = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "" || value === "all") return;
    if (Array.isArray(value)) {
      if (value.length) search.set(key, value.join(","));
      return;
    }
    search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function getDiscoverMeta() {
  return apiClient("/api/discover/meta");
}

export function getDiscoverQuota() {
  return apiClient("/api/discover/quota");
}

export function getDiscoverFeed(query) {
  return apiClient(`/api/discover/feed${params(query)}`);
}

export function getDiscoverReels(query) {
  return apiClient(`/api/discover/reels${params(query)}`);
}

export function refreshDiscoverNews(body) {
  return apiClient("/api/discover/refresh-news", {
    method: "POST",
    body: JSON.stringify(body || {}),
    timeoutMs: 30000,
  });
}

export function sendDiscoverInteraction(type, id, body) {
  const routeType = type === "reel" ? "reels" : "articles";
  return apiClient(`/api/discover/${routeType}/${id}/interactions`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getDiscoverComments(type, id) {
  const routeType = type === "reel" ? "reels" : "articles";
  return apiClient(`/api/discover/${routeType}/${id}/comments`);
}

export function addDiscoverComment(type, id, body) {
  const routeType = type === "reel" ? "reels" : "articles";
  return apiClient(`/api/discover/${routeType}/${id}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function searchDiscover(query, scope = "all") {
  return apiClient(`/api/discover/search${params({ q: query, scope })}`);
}

export function searchDiscoverReels(query) {
  return apiClient(`/api/discover/reels/search${params({ q: query })}`);
}

export function getDiscoverTrending() {
  return apiClient("/api/discover/trending");
}

export function getDiscoverAdminDashboard() {
  return apiClient("/api/discover/admin/dashboard");
}

export function refreshDiscoverCache() {
  return apiClient("/api/discover/admin/cache/refresh", { method: "POST", timeoutMs: 45000 });
}

export function getDiscoverBookmarks() {
  return apiClient("/api/discover/bookmarks");
}

export function followDiscoverCreator(creatorId, action) {
  return apiClient(`/api/discover/creators/${creatorId}/follow`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

export function uploadDiscoverReel(body) {
  return apiClient("/api/discover/reels", {
    method: "POST",
    body: JSON.stringify(body),
    timeoutMs: 45000,
  });
}
