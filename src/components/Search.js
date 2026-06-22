import React, { useRef, useState } from "react";
import { useSocket } from "../context/SocketContext";
import { API_URL } from "../api";
import DownloadButton from "./DownloadButton";

function formatDur(sec) {
  if (!sec) return "";
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

export default function Search() {
  const { emit, state, connected, socketId } = useSocket();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recent, setRecent] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("syncwave_recent_searches") || "[]");
    } catch (err) {
      return [];
    }
  });
  const debounceRef = useRef(null);
  const trending = ["Arijit Singh", "Hindi Hits", "Lo-fi Chill", "Punjabi Pop", "Workout Mix", "English Hits"];

  const doSearch = async (q) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const term = q.trim();
    const nextRecent = [term, ...recent.filter((item) => item.toLowerCase() !== term.toLowerCase())].slice(0, 8);
    setRecent(nextRecent);
    localStorage.setItem("syncwave_recent_searches", JSON.stringify(nextRecent));
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(term)}&limit=25`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      console.log("FIRST SEARCH RESULT", data.results?.[0] || null);
      setResults(data.results || []);
    } catch (e) {
      setError("Search failed. Make sure the server is running.");
    } finally {
      setLoading(false);
    }
  };

  const handleInput = (e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 350);
  };

  const playSong = (song) => {
    console.log("PLAY CLICK", song);
    console.log("SOCKET EMIT BEFORE", {
      event: "play_song",
      connected,
      socketId,
      id: song?.id,
      title: song?.title,
      videoId: song?.videoId,
      streamUrl: song?.streamUrl,
      hasStreamUrl: Boolean(song?.streamUrl),
    });
    if (!song.streamUrl) {
      alert("This song has no stream URL available.");
      return;
    }
    const currentQueue = state?.queue || [];
    const newQueue = currentQueue.find((s) => s.id === song.id)
      ? currentQueue
      : [song, ...currentQueue].slice(0, 100);
    emit("set_queue", { queue: newQueue }, (res) => {
      console.log("SOCKET EMIT AFTER", { event: "set_queue", res });
    });
    emit("play_song", { song }, (res) => {
      console.log("SOCKET EMIT AFTER", { event: "play_song", res });
    });
  };

  const addToQueue = (song) => {
    console.log("QUEUE CLICK", song);
    console.log("ADD TO QUEUE CLICK", {
      connected,
      socketId,
      id: song?.id,
      title: song?.title,
      hasStreamUrl: Boolean(song?.streamUrl),
    });
    const currentQueue = state?.queue || [];
    if (currentQueue.find((s) => s.id === song.id)) return;
    emit("set_queue", { queue: [...currentQueue, song].slice(0, 100) }, (res) => {
      console.log("SOCKET EMIT AFTER", { event: "set_queue", res });
    });
  };

  return (
    <div className="search-panel">
      <div className="search-bar">
        <span className="search-icon">Search</span>
        <input
          className="search-input"
          placeholder="Search songs, artists, albums..."
          value={query}
          onChange={handleInput}
          autoComplete="off"
        />
        {loading && <span className="search-spin">...</span>}
        {query && <button className="search-clear" onClick={() => { setQuery(""); setResults([]); }}>x</button>}
      </div>

      {error && <div className="search-error">{error}</div>}

      {!query && !results.length && (
        <div className="search-discovery">
          {recent.length > 0 && (
            <section className="home-section">
              <div className="section-head"><div><h2>Recent Searches</h2><p>Jump back into what you looked for.</p></div></div>
              <div className="chip-row">
                {recent.map((s) => <button key={s} className="suggestion-chip" onClick={() => { setQuery(s); doSearch(s); }}>{s}</button>)}
              </div>
            </section>
          )}
          <section className="home-section">
            <div className="section-head"><div><h2>Trending Searches</h2><p>Fresh starting points for your session.</p></div></div>
            <div className="chip-row">
              {trending.map((s) => <button key={s} className="suggestion-chip" onClick={() => { setQuery(s); doSearch(s); }}>{s}</button>)}
            </div>
          </section>
        </div>
      )}

      <div className="search-results">
        {results.map((song) => {
          const isPlaying = state?.currentSong?.id === song.id && state?.isPlaying;
          const inQueue = state?.queue?.some((s) => s.id === song.id);
          return (
            <div key={song.id} className={`result-item ${isPlaying ? "active" : ""}`}>
              <div className="result-cover-wrap" onClick={() => playSong(song)}>
                <img src={song.cover} alt={song.title} className="result-cover" onError={(e) => { e.target.src = "https://via.placeholder.com/48x48/1a1a2e/fff?text=SW"; }} />
                {isPlaying && <span className="result-playing">Play</span>}
              </div>
              <div className="result-info" onClick={() => playSong(song)}>
                <span className="result-title">{song.title}</span>
                <span className="result-artist">{song.artist}</span>
              </div>
              <div className="result-tags">
                {song.language && <span>{song.language}</span>}
                <span>{formatDur(song.duration)}</span>
              </div>
              <div className="result-actions">
                <button className="result-btn play-btn" onClick={() => playSong(song)} title="Play now">Play</button>
                <DownloadButton song={song} className="result-btn download-btn" />
                <button className={`result-btn queue-btn ${inQueue ? "queued" : ""}`} onClick={() => addToQueue(song)} title={inQueue ? "In queue" : "Add to queue"}>
                  {inQueue ? "Added" : "+"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
