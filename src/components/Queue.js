import React, { useState } from "react";
import { useSocket } from "../context/SocketContext";

function fmt(sec) {
  if (!sec) return "";
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

export default function Queue() {
  const { state, emit } = useSocket();
  const [dragId, setDragId] = useState(null);
  const queue = state?.queue || [];
  const currentId = state?.currentSong?.id;

  const setQueue = (next) => emit("set_queue", { queue: next });
  const play = (song) => emit("play_song", { song });
  const remove = (e, id) => {
    e.stopPropagation();
    setQueue(queue.filter((s) => s.id !== id));
  };

  const move = (e, from, to) => {
    e.stopPropagation();
    if (to < 0 || to >= queue.length) return;
    const next = [...queue];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setQueue(next);
  };

  const onDrop = (targetId) => {
    if (!dragId || dragId === targetId) return;
    const from = queue.findIndex((s) => s.id === dragId);
    const to = queue.findIndex((s) => s.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...queue];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setQueue(next);
    setDragId(null);
  };

  return (
    <div className="queue-panel">
      <div className="panel-header">
        <span className="panel-title">Queue</span>
        <div className="panel-actions">
          <span className="panel-badge">{queue.length}</span>
          {queue.length > 0 && <button className="clear-btn" onClick={() => setQueue([])}>Clear</button>}
        </div>
      </div>

      {queue.length === 0 ? (
        <div className="queue-empty">
          <div className="empty-title">No songs queued</div>
          <div>Use Add To Queue from search results.</div>
        </div>
      ) : (
        <div className="queue-list">
          {queue.map((song, idx) => {
            const active = song.id === currentId;
            return (
              <div
                key={song.id}
                className={`queue-item ${active ? "active" : ""} ${dragId === song.id ? "dragging" : ""}`}
                draggable
                onDragStart={() => setDragId(song.id)}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(song.id)}
                onClick={() => play(song)}
              >
                <button className="drag-handle" title="Drag to reorder">::</button>
                <div className="qi-left">
                  <div className="qi-cover-wrap">
                    <img src={song.cover} alt={song.title} className="qi-cover" onError={(e) => { e.target.src = "https://via.placeholder.com/36/1a1a2e/fff?text=SW"; }} />
                    {active && <div className="qi-bars"><span /><span /><span /></div>}
                  </div>
                  <div className="qi-info">
                    <span className="qi-title">{song.title}</span>
                    <span className="qi-artist">{song.artist}</span>
                  </div>
                </div>
                <div className="qi-right">
                  <span className="qi-dur">{fmt(song.duration)}</span>
                  <div className="qi-actions">
                    <button className="qi-btn" onClick={(e) => move(e, idx, idx - 1)}>Up</button>
                    <button className="qi-btn" onClick={(e) => move(e, idx, idx + 1)}>Down</button>
                    <button className="qi-btn del" onClick={(e) => remove(e, song.id)}>Remove</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
