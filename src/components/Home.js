import React from "react";
import { useSocket } from "../context/SocketContext";
import { useCall } from "../context/CallContext";

function uniqueSongs(songs) {
  const seen = new Set();
  return (songs || []).filter((song) => {
    if (!song?.id || seen.has(song.id)) return false;
    seen.add(song.id);
    return true;
  });
}

function SongRail({ title, subtitle, songs, onPlay }) {
  if (!songs.length) return null;
  return (
    <section className="home-section">
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      <div className="song-rail">
        {songs.map((song) => (
          <button key={song.id} className="media-card" onClick={() => onPlay(song)}>
            <img src={song.cover} alt={song.title} onError={(e) => { e.target.src = "https://via.placeholder.com/180/151923/fff?text=SW"; }} />
            <span className="media-title">{song.title}</span>
            <span className="media-sub">{song.artist || song.album || "SyncWave"}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export default function Home({ playlists, onPlaySong, onPlayPlaylist, onTab }) {
  const { state } = useSocket();
  const call = useCall();
  const queue = state?.queue || [];
  const current = state?.currentSong;
  const songs = uniqueSongs([current, ...queue].filter(Boolean));
  const recommended = uniqueSongs([...queue].reverse()).slice(0, 10);
  const callState = call?.call || { status: "idle" };

  return (
    <div className="home-page">
      {callState.status !== "idle" && (
        <section className="active-call-banner">
          <div>
            <span className="eyebrow">Active Call</span>
            <strong>{callState.peer?.deviceName || "SyncWave Device"}</strong>
            <p>{callState.status === "connected" ? "Call is running in the background." : "Call is connecting."}</p>
          </div>
          <button className="primary-action" onClick={() => onTab("devices")}>Open Call</button>
        </section>
      )}

      <section className="home-section continue-grid">
        <div className="section-head">
          <div>
            <h2>Continue Listening</h2>
            <p>{current ? "Pick up where the room left off." : "Start a track to build your listening hub."}</p>
          </div>
          <button className="text-action" onClick={() => onTab("queue")}>Queue</button>
        </div>
        <div className="continue-card">
          <div className="continue-art">
            {current ? <img src={current.cover} alt={current.title} onError={(e) => { e.target.src = "https://via.placeholder.com/96/151923/fff?text=SW"; }} /> : <span>SW</span>}
          </div>
          <div className="continue-meta">
            <strong>{current?.title || "Nothing playing yet"}</strong>
            <span>{current?.artist || "Search for a song to start a session."}</span>
          </div>
          <button className="round-command" onClick={() => current ? onPlaySong(current) : onTab("search")} aria-label="Play">Play</button>
        </div>
      </section>

      <SongRail title="Recently Played" subtitle="From your active queue" songs={songs.slice(0, 10)} onPlay={onPlaySong} />

      <SongRail title="Recommended Songs" subtitle="Based on your current queue" songs={recommended} onPlay={onPlaySong} />

      <section className="home-section">
        <div className="section-head">
          <div>
            <h2>Your Playlists</h2>
            <p>Create mixes for every mood.</p>
          </div>
          <button className="text-action" onClick={() => onTab("playlists")}>Manage</button>
        </div>
        <div className="playlist-grid compact">
          {playlists.length ? playlists.slice(0, 6).map((playlist) => (
            <button key={playlist.id} className="playlist-card" onClick={() => onPlayPlaylist(playlist)}>
              <div className="playlist-cover">
                {playlist.songs[0]?.cover ? <img src={playlist.songs[0].cover} alt="" /> : <span>Mix</span>}
              </div>
              <strong>{playlist.name}</strong>
              <span>{playlist.songs.length} songs</span>
            </button>
          )) : (
            <button className="empty-feature" onClick={() => onTab("playlists")}>Create your first playlist</button>
          )}
        </div>
      </section>

    </div>
  );
}
