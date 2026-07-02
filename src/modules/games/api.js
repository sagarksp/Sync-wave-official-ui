import { apiFetch } from "../../api";

export const gamesApi = {
  home: () => apiFetch("/api/games/home"),
  createRoom: (payload) => apiFetch("/api/games/rooms", { method: "POST", body: JSON.stringify(payload) }),
  joinRoom: (payload) => apiFetch("/api/games/rooms/join", { method: "POST", body: JSON.stringify(payload) }),
  leaveRoom: (code) => apiFetch(`/api/games/rooms/${encodeURIComponent(code)}/leave`, { method: "POST", body: JSON.stringify({}) }),
  startMatch: (code, payload = {}) => apiFetch(`/api/games/rooms/${encodeURIComponent(code)}/start`, { method: "POST", body: JSON.stringify(payload) }),
  endMatch: (code, payload = {}) => apiFetch(`/api/games/rooms/${encodeURIComponent(code)}/end`, { method: "POST", body: JSON.stringify(payload) }),
  leaderboard: (gameId = "all") => apiFetch(`/api/games/leaderboard?gameId=${encodeURIComponent(gameId)}`),
  history: (gameId = "") => apiFetch(`/api/games/history${gameId ? `?gameId=${encodeURIComponent(gameId)}` : ""}`),
  claimDaily: () => apiFetch("/api/games/rewards/daily", { method: "POST", body: JSON.stringify({}) }),
  syncOffline: (matches) => apiFetch("/api/games/offline/sync", { method: "POST", body: JSON.stringify({ matches }) }),
};
