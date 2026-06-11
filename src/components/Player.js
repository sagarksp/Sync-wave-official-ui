import React, { useEffect, useRef, useState } from "react";
import { useSocket } from "../context/SocketContext";

function fmt(sec) {
  if (!sec || isNaN(sec)) return "0:00";
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

export default function Player() {
  const { state, emit } = useSocket();
  const audioRef = useRef(null);
  const isSyncingRef = useRef(false);
  const lastSongIdRef = useRef(null);
  const [localPos, setLocalPos] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [buffering, setBuffering] = useState(false);

  const song = state?.currentSong;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !song || song.id === lastSongIdRef.current) return;
    lastSongIdRef.current = song.id;
    isSyncingRef.current = true;
    audio.src = song.streamUrl || "";
    audio.load();
    const onCanPlay = () => {
      audio.currentTime = state?.position || 0;
      isSyncingRef.current = false;
      if (state?.isPlaying) audio.play().catch(() => {});
    };
    audio.addEventListener("canplay", onCanPlay, { once: true });
    return () => audio.removeEventListener("canplay", onCanPlay);
  }, [song?.id, state?.position, state?.isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !song || isSyncingRef.current) return;
    if (state?.isPlaying) audio.play().catch(() => {});
    else audio.pause();
  }, [state?.isPlaying, song]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || dragging || isSyncingRef.current) return;
    const serverPos = state?.position || 0;
    if (Math.abs(audio.currentTime - serverPos) > 1.5) audio.currentTime = serverPos;
    setLocalPos(serverPos);
  }, [state?.position, dragging]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = (state?.volume ?? 80) / 100;
  }, [state?.volume]);

  const duration = song?.duration || 0;
  const progress = duration ? (localPos / duration) * 100 : 0;

  const handleSeekEnd = (e) => {
    const pos = Number(e.target.value);
    setDragging(false);
    if (audioRef.current) audioRef.current.currentTime = pos;
    emit("seek", { position: pos });
  };

  return (
    <div className="player">
      <audio
        ref={audioRef}
        onTimeUpdate={() => !dragging && setLocalPos(audioRef.current?.currentTime || 0)}
        onEnded={() => emit("next_song")}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        crossOrigin="anonymous"
      />

      <div className="player-info">
        {song ? (
          <>
            <img src={song.cover} alt={song.title} className="player-cover" onError={(e) => { e.target.src = "https://via.placeholder.com/46/1a1a2e/fff?text=SW"; }} />
            <div className="player-meta">
              <span className="player-title">{song.title}</span>
              <span className="player-artist">{song.artist}</span>
            </div>
          </>
        ) : (
          <span className="player-empty">No song playing</span>
        )}
      </div>

      <div className="player-center">
        <div className="player-ctrls">
          <button className="ctrl" onClick={() => emit("prev_song")} title="Previous">Prev</button>
          <button className="ctrl play" onClick={() => emit("play_pause", { isPlaying: !state?.isPlaying })} disabled={!song}>
            {buffering ? "..." : state?.isPlaying ? "Pause" : "Play"}
          </button>
          <button className="ctrl" onClick={() => emit("next_song")} title="Next">Next</button>
        </div>
        <div className="player-progress">
          <span className="ptime">{fmt(localPos)}</span>
          <div className="ptrack">
            <div className="pfill" style={{ width: `${progress}%` }} />
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={localPos}
              className="pinput"
              onMouseDown={() => setDragging(true)}
              onTouchStart={() => setDragging(true)}
              onChange={(e) => setLocalPos(Number(e.target.value))}
              onMouseUp={handleSeekEnd}
              onTouchEnd={handleSeekEnd}
            />
          </div>
          <span className="ptime">{fmt(duration)}</span>
        </div>
      </div>

      <div className="player-right">
        <button className={`sync-btn ${state?.syncEnabled ? "on" : "off"}`} onClick={() => emit("toggle_sync", { syncEnabled: !state?.syncEnabled })}>
          {state?.syncEnabled ? "Live Sync" : "Sync Off"}
        </button>
        <label className="vol-wrap">
          Vol
          <input type="range" min={0} max={100} value={state?.volume ?? 80} onChange={(e) => emit("volume_change", { volume: Number(e.target.value) })} className="vol-input" />
        </label>
      </div>
    </div>
  );
}
