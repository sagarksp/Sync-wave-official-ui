import React, { useEffect, useState } from "react";
import { apiFetch } from "../api";

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function normalizeSong(song) {
  if (!song || typeof song !== "object") return null;
  return {
    id: String(song.id || song._id || ""),
    title: String(song.title || "Untitled Song"),
    genre: String(song.genre || ""),
    mood: String(song.mood || ""),
    language: String(song.language || ""),
    status: String(song.status || ""),
    coverImage: String(song.coverImage || ""),
    createdAt: song.createdAt || "",
  };
}

export default function AILibrary({ onCreate, onOpenSong }) {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    apiFetch("/api/ai/songs")
      .then((data) => {
        if (alive) setSongs((Array.isArray(data?.songs) ? data.songs : []).map(normalizeSong).filter(Boolean));
      })
      .catch((err) => {
        if (alive) setError(err.message || "Unable to load AI library");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  return (
    <div className="ai-library-page">
      <div className="panel-header">
        <div>
          <span className="panel-title">AI Library</span>
          <div className="panel-badge">{songs.length} generated projects</div>
        </div>
        <button className="primary-action" onClick={onCreate}>Generate Music</button>
      </div>

      {loading && <div className="queue-empty">Loading AI projects...</div>}
      {error && <div className="form-error page-pad">{error}</div>}
      {!loading && !songs.length && !error && (
        <div className="now-playing-empty">
          <div className="np-empty-title">No AI songs yet</div>
          <div className="np-empty-sub">Generate lyrics and production prompts from your first idea.</div>
          <button className="primary-action" onClick={onCreate}>Open AI Studio</button>
        </div>
      )}

      <div className="ai-project-grid">
        {songs.map((song) => (
          <button key={song.id} className="ai-project-card" onClick={() => onOpenSong(song.id)}>
            <div className="ai-cover">
              {song.coverImage ? <img src={song.coverImage} alt={song.title} /> : <span>AI</span>}
            </div>
            <div className="ai-project-meta">
              <strong>{song.title}</strong>
              <span>{song.genre} · {song.mood} · {song.language}</span>
              <small>{song.status} · {formatDate(song.createdAt)}</small>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
