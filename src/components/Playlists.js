import React, { useMemo, useState } from "react";
import { useSocket } from "../context/SocketContext";

function fmt(sec) {
  if (!sec) return "0:00";
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

function totalDuration(songs) {
  return (songs || []).reduce((sum, song) => sum + (Number(song.duration) || 0), 0);
}

export default function Playlists({ playlists, onCreate, onRename, onDelete, onAddSong, onRemoveSong, onReorder, onPlayPlaylist }) {
  const { state } = useSocket();
  const [selectedId, setSelectedId] = useState(playlists[0]?.id || "");
  const [name, setName] = useState("");
  const selected = useMemo(() => playlists.find((playlist) => playlist.id === selectedId) || playlists[0] || null, [playlists, selectedId]);
  const queue = state?.queue || [];
  const current = state?.currentSong;
  const availableSongs = useMemo(() => {
    const seen = new Set();
    return [current, ...queue].filter(Boolean).filter((song) => {
      if (!song.id || seen.has(song.id)) return false;
      seen.add(song.id);
      return true;
    });
  }, [current, queue]);

  const create = (e) => {
    e.preventDefault();
    const created = onCreate(name.trim() || "New Playlist");
    setName("");
    if (created?.id) setSelectedId(created.id);
  };

  return (
    <div className="playlists-page">
      <div className="playlist-sidebar">
        <div className="panel-header soft">
          <span className="panel-title">Playlists</span>
          <span className="panel-badge">{playlists.length}</span>
        </div>
        <form className="playlist-create" onSubmit={create}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New playlist name" />
          <button>Create</button>
        </form>
        <div className="playlist-nav">
          {playlists.map((playlist) => (
            <button key={playlist.id} className={selected?.id === playlist.id ? "active" : ""} onClick={() => setSelectedId(playlist.id)}>
              <span>{playlist.name}</span>
              <small>{playlist.songs.length} songs</small>
            </button>
          ))}
        </div>
      </div>

      <div className="playlist-detail">
        {selected ? (
          <>
            <section className="playlist-hero">
              <div className="playlist-cover large">
                {selected.songs[0]?.cover ? <img src={selected.songs[0].cover} alt="" /> : <span>Mix</span>}
              </div>
              <div className="playlist-copy">
                <span className="eyebrow">Playlist</span>
                <input className="playlist-name-input" value={selected.name} onChange={(e) => onRename(selected.id, e.target.value)} />
                <p>{selected.songs.length} songs · {fmt(totalDuration(selected.songs))}</p>
                <div className="hero-actions">
                  <button className="primary-action" disabled={!selected.songs.length} onClick={() => onPlayPlaylist(selected)}>Play Playlist</button>
                  <button className="ghost-action danger" onClick={() => onDelete(selected.id)}>Delete</button>
                </div>
              </div>
            </section>

            <section className="playlist-add">
              <div className="section-head">
                <div>
                  <h2>Add From Queue</h2>
                  <p>Use search or queue songs, then add them here.</p>
                </div>
              </div>
              <div className="add-song-grid">
                {availableSongs.map((song) => (
                  <button key={song.id} onClick={() => onAddSong(selected.id, song)}>
                    <img src={song.cover} alt="" onError={(e) => { e.target.src = "https://via.placeholder.com/48/151923/fff?text=SW"; }} />
                    <span>{song.title}</span>
                    <small>{song.artist}</small>
                  </button>
                ))}
                {!availableSongs.length && <div className="empty-feature">No songs available yet. Search or play music first.</div>}
              </div>
            </section>

            <section className="queue-list playlist-songs">
              {selected.songs.map((song, idx) => (
                <div key={`${song.id}-${idx}`} className="queue-item">
                  <div className="qi-left">
                    <img src={song.cover} alt={song.title} className="qi-cover" onError={(e) => { e.target.src = "https://via.placeholder.com/42/151923/fff?text=SW"; }} />
                    <div className="qi-info">
                      <span className="qi-title">{song.title}</span>
                      <span className="qi-artist">{song.artist}</span>
                    </div>
                  </div>
                  <span className="qi-dur">{fmt(song.duration)}</span>
                  <div className="qi-actions">
                    <button className="qi-btn" onClick={() => onReorder(selected.id, idx, 0)}>Top</button>
                    <button className="qi-btn" onClick={() => onReorder(selected.id, idx, idx - 1)}>Up</button>
                    <button className="qi-btn" onClick={() => onReorder(selected.id, idx, idx + 1)}>Down</button>
                    <button className="qi-btn del" onClick={() => onRemoveSong(selected.id, song.id)}>Remove</button>
                  </div>
                </div>
              ))}
              {!selected.songs.length && <div className="queue-empty">Add songs from your current queue to build this playlist.</div>}
            </section>
          </>
        ) : (
          <div className="now-playing-empty">
            <div className="np-empty-title">No playlists yet</div>
            <div>Create a playlist to start collecting songs.</div>
          </div>
        )}
      </div>
    </div>
  );
}
