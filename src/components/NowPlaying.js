import React, { useEffect, useState } from "react";
import { useSocket } from "../context/SocketContext";
import DownloadButton from "./DownloadButton";

function fmt(sec) {
  if (!sec) return "0:00";
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

export default function NowPlaying() {
  const { state } = useSocket();
  const song = state?.currentSong;
  const [pos, setPos] = useState(0);
  const [autoplay, setAutoplay] = useState(true);

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
  const upNext = (state?.queue || []).filter((item) => item.id !== song.id).slice(0, 5);

  return (
    <div className="now-playing" style={{ "--art": `url(${song.cover})` }}>
      <section className="np-main">
        <div className="np-artwork-wrap">
          <img src={song.cover} alt={song.title} className="np-artwork" onError={(e) => { e.target.src = "https://via.placeholder.com/360/151923/fff?text=SW"; }} />
        </div>
        <div className="np-info">
          <span className="eyebrow">Now Playing</span>
          <div className="np-song-title">{song.title}</div>
          <div className="np-song-artist">{song.artist}</div>
          {song.album && <div className="np-song-album">{song.album}</div>}
          <div className="np-actions">
            {song.language && <span className="np-lang-badge">{song.language}</span>}
            <DownloadButton song={song} className="np-download-btn download-btn" />
          </div>
          <div className="np-progress">
            <div className="np-prog-bar"><div className="np-prog-fill" style={{ width: `${pct}%` }} /></div>
            <div className="np-times"><span>{fmt(pos)}</span><span>{fmt(song.duration)}</span></div>
          </div>
        </div>
      </section>

      <section className="np-lower">
        <div className="lyrics-card">
          <div className="section-head compact-head">
            <div>
              <h2>Track Details</h2>
              <p>{song.album || "SyncWave session"}</p>
            </div>
          </div>
          <div className="lyrics-placeholder">
            <strong>{song.title}</strong>
            <span>{song.artist}</span>
            {song.language && <span>{song.language}</span>}
            {song.year && <span>{song.year}</span>}
          </div>
        </div>
        <div className="up-next-card">
          <div className="section-head compact-head">
            <div>
              <h2>Up Next</h2>
              <p>{autoplay ? "Autoplay continues with related tracks." : "Autoplay is paused."}</p>
            </div>
            <button className={`toggle-pill ${autoplay ? "on" : ""}`} onClick={() => setAutoplay((v) => !v)}>Autoplay {autoplay ? "On" : "Off"}</button>
          </div>
          <div className="np-visualizer">
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className={`viz-bar ${state?.isPlaying ? "active" : ""}`} style={{ animationDelay: `${(i * 83) % 700}ms`, height: `${12 + ((i * 41 + 7) % 44)}px` }} />
            ))}
          </div>
          <div className="mini-list">
            {upNext.map((item) => (
              <div key={item.id} className="mini-song">
                <img src={item.cover} alt="" />
                <div><strong>{item.title}</strong><span>{item.artist}</span></div>
              </div>
            ))}
            {!upNext.length && <div className="queue-empty">Queue similar songs to fill Up Next.</div>}
          </div>
        </div>
      </section>
    </div>
  );
}
