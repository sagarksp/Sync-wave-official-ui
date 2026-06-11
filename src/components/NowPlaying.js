import React, { useEffect, useState } from "react";
import { useSocket } from "../context/SocketContext";

function fmt(sec) {
  if (!sec) return "0:00";
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

export default function NowPlaying() {
  const { state } = useSocket();
  const song = state?.currentSong;
  const [pos, setPos] = useState(0);

  useEffect(() => {
    setPos(state?.position || 0);
    if (!state?.isPlaying) return;
    const t = setInterval(() => setPos((p) => Math.min(p + 1, song?.duration || 9999)), 1000);
    return () => clearInterval(t);
  }, [state?.isPlaying, state?.position, song?.id, song?.duration]);

  if (!song) {
    return (
      <div className="now-playing-empty">
        <div className="np-empty-title">SyncWave</div>
        <div className="np-empty-sub">Search for a song to start listening.</div>
      </div>
    );
  }

  const pct = song.duration ? (pos / song.duration) * 100 : 0;

  return (
    <div className="now-playing">
      <div className="np-artwork-wrap">
        <img src={song.cover} alt={song.title} className={`np-artwork ${state?.isPlaying ? "rotating" : ""}`} onError={(e) => { e.target.src = "https://via.placeholder.com/240/1a1a2e/fff?text=SW"; }} />
      </div>
      <div className="np-info">
        <div className="np-song-title">{song.title}</div>
        <div className="np-song-artist">{song.artist}</div>
        {song.album && <div className="np-song-album">{song.album}</div>}
        {song.language && <span className="np-lang-badge">{song.language}</span>}
      </div>
      <div className="np-progress">
        <div className="np-prog-bar"><div className="np-prog-fill" style={{ width: `${pct}%` }} /></div>
        <div className="np-times"><span>{fmt(pos)}</span><span>{fmt(song.duration)}</span></div>
      </div>
      <div className="np-visualizer">
        {Array.from({ length: 18 }).map((_, i) => (
          <div key={i} className={`viz-bar ${state?.isPlaying ? "active" : ""}`} style={{ animationDelay: `${(i * 83) % 700}ms`, height: `${12 + ((i * 41 + 7) % 44)}px` }} />
        ))}
      </div>
    </div>
  );
}
