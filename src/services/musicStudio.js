import { apiFetch } from "../api";

export function startSongGeneration(payload) {
  return apiFetch("/api/ai/generate-song", {
    method: "POST",
    timeoutMs: 20000,
    body: JSON.stringify(payload),
  });
}

export function getSongGenerationJob(jobId) {
  return apiFetch(`/api/ai/generation-jobs/${jobId}`);
}

export function listGeneratedSongs() {
  return apiFetch("/api/ai/generated-songs");
}

export function deleteGeneratedSong(id) {
  return apiFetch(`/api/ai/generated-songs/${id}`, { method: "DELETE" });
}
