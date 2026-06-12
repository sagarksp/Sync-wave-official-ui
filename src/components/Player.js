import React, { useEffect, useRef, useState } from "react";
import { useSocket } from "../context/SocketContext";
import DownloadButton from "./DownloadButton";

function fmt(sec) {
  if (!sec || isNaN(sec)) return "0:00";
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

function debug(deviceName, event, details) {
  console.log(`[${deviceName || "SyncWave Device"}] ${event}`, details || "");
}

function expectedPosition(state) {
  if (!state?.currentSong) return 0;
  const base = Number(state.position ?? state.positionAtPlay ?? 0);
  if (!state.isPlaying || !state.serverTime) return base;
  const elapsed = (Date.now() - state.serverTime) / 1000;
  return Math.min(base + elapsed, state.currentSong.duration || 9999);
}

export default function Player() {
  const { state, emit, deviceName } = useSocket();
  const audioRef = useRef(null);
  const latestStateRef = useRef(null);
  const loadIdRef = useRef(0);
  const readyRef = useRef(false);
  const remoteSeekRef = useRef(false);
  const [localPos, setLocalPos] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [bufferedPct, setBufferedPct] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState("off");
  const [favorite, setFavorite] = useState(false);

  const song = state?.currentSong;

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  const safeRemoteSeek = (position, reason) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(position)) return;
    remoteSeekRef.current = true;
    debug(deviceName, "SEEK_RECEIVED", { position, reason });
    try {
      audio.currentTime = Math.max(0, position);
      setLocalPos(audio.currentTime);
    } finally {
      window.setTimeout(() => {
        remoteSeekRef.current = false;
      }, 250);
    }
  };

  const applyPlayState = async (reason) => {
    const audio = audioRef.current;
    const currentState = latestStateRef.current;
    if (!audio || !currentState?.currentSong || !readyRef.current) return;

    if (currentState.isPlaying) {
      if (audio.paused) {
        debug(deviceName, "PLAY_APPLIED", { reason });
        await audio.play().catch((err) => {
          debug(deviceName, "PLAY_BLOCKED", { reason, error: err.message });
        });
      }
    } else if (!audio.paused) {
      debug(deviceName, "PAUSE_APPLIED", { reason });
      audio.pause();
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!song) {
      readyRef.current = false;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      setLocalPos(0);
      return;
    }

    const loadId = loadIdRef.current + 1;
    loadIdRef.current = loadId;
    readyRef.current = false;
    setBuffering(true);
    debug(deviceName, "SONG_CHANGE_RECEIVED", { title: song.title, loadId });

    audio.pause();
    audio.src = song.streamUrl || "";
    audio.load();

    let completed = false;
    const completeLoad = async (eventName) => {
      if (completed || loadIdRef.current !== loadId) return;
      completed = true;
      readyRef.current = true;
      setBuffering(false);
      debug(deviceName, "PLAYER_READY", { eventName, loadId });
      safeRemoteSeek(expectedPosition(latestStateRef.current), "song-load");
      await applyPlayState("song-load");
    };

    const onCanPlay = () => completeLoad("canplay");
    const onLoadedMetadata = () => completeLoad("loadedmetadata");
    audio.addEventListener("canplay", onCanPlay, { once: true });
    audio.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });

    return () => {
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      if (loadIdRef.current === loadId) readyRef.current = false;
    };
  }, [song?.id]);

  useEffect(() => {
    if (!song || !readyRef.current || dragging) return;
    const target = expectedPosition(state);
    const actual = audioRef.current?.currentTime || 0;
    const action = state?.lastAction || "";
    const isRemoteSeekAction = ["SEEK", "SONG_CHANGE", "NEXT", "PREV"].includes(action);
    if (isRemoteSeekAction || Math.abs(actual - target) > 2) {
      safeRemoteSeek(target, action || "drift");
    }
  }, [state?.lastActionId, state?.positionAtPlay, state?.startedAt, song?.id, dragging]);

  useEffect(() => {
    applyPlayState(state?.lastAction || "state-update");
  }, [state?.isPlaying, state?.lastActionId, song?.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = (state?.volume ?? 80) / 100;
  }, [state?.volume]);

  const updateBuffered = () => {
    const audio = audioRef.current;
    const duration = song?.duration || audio?.duration || 0;
    if (!audio || !duration || !audio.buffered?.length) {
      setBufferedPct(0);
      return;
    }
    const end = audio.buffered.end(audio.buffered.length - 1);
    setBufferedPct(Math.min(100, (end / duration) * 100));
  };

  useEffect(() => {
    const interval = window.setInterval(() => {
      const audio = audioRef.current;
      const currentState = latestStateRef.current;
      if (!audio || !currentState?.currentSong || !readyRef.current || dragging) return;

      debug(deviceName, "PLAYER_STATE", {
        paused: audio.paused,
        LOCAL_POSITION: audio.currentTime,
        SERVER_POSITION: expectedPosition(currentState),
        isPlaying: currentState.isPlaying,
      });

      const target = expectedPosition(currentState);
      if (Math.abs(audio.currentTime - target) > 4) safeRemoteSeek(target, "recovery-drift");
      if (currentState.isPlaying && audio.paused) applyPlayState("recovery-play");
      if (!currentState.isPlaying && !audio.paused) audio.pause();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [dragging, deviceName]);

  const duration = song?.duration || 0;
  const progress = duration ? (localPos / duration) * 100 : 0;

  const emitControl = (event, data) => {
    emit(event, data);
  };

  const handleEnded = () => {
    const audio = audioRef.current;
    if (repeatMode === "one" && audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
      return;
    }
    if (shuffle && state?.queue?.length > 1) {
      const options = state.queue.filter((item) => item.id !== song?.id);
      const next = options[Math.floor(Math.random() * options.length)];
      if (next) emitControl("play_song", { song: next });
      return;
    }
    emitControl("next_song");
  };

  const handleSeekEnd = (e) => {
    const pos = Number(e.target.value);
    setDragging(false);
    safeRemoteSeek(pos, "local-user");
    debug(deviceName, "SEEK_SENT", { position: pos });
    emitControl("seek", { position: pos });
  };

  return (
    <div className="player">
      <audio
        ref={audioRef}
        onTimeUpdate={() => {
          if (!dragging) setLocalPos(audioRef.current?.currentTime || 0);
        }}
        onProgress={updateBuffered}
        onLoadedMetadata={updateBuffered}
        onEnded={handleEnded}
        onWaiting={() => {
          debug(deviceName, "PLAYER_STATE", { state: "waiting" });
          setBuffering(true);
        }}
        onPlaying={() => {
          debug(deviceName, "PLAYER_STATE", { state: "playing" });
          setBuffering(false);
        }}
        onPause={() => debug(deviceName, "PLAYER_STATE", { state: "paused", remoteSeek: remoteSeekRef.current })}
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
          <button className={`icon-ctrl ${shuffle ? "active" : ""}`} onClick={() => setShuffle((v) => !v)} disabled={!song} title="Shuffle" aria-label="Shuffle">Shuffle</button>
          <button className="icon-ctrl" onClick={() => emitControl("prev_song")} disabled={!song} title="Previous" aria-label="Previous">Prev</button>
          <button className="ctrl play" onClick={() => emitControl("play_pause", { isPlaying: !state?.isPlaying })} disabled={!song}>
            {buffering ? "..." : state?.isPlaying ? "Pause" : "Play"}
          </button>
          <button className="icon-ctrl" onClick={() => emitControl("next_song")} disabled={!song} title="Next" aria-label="Next">Next</button>
          <button
            className={`icon-ctrl ${repeatMode !== "off" ? "active" : ""}`}
            onClick={() => setRepeatMode((mode) => mode === "off" ? "one" : mode === "one" ? "all" : "off")}
            disabled={!song}
            title={repeatMode === "one" ? "Repeat One" : repeatMode === "all" ? "Repeat All" : "Repeat"}
            aria-label="Repeat"
          >
            {repeatMode === "one" ? "One" : repeatMode === "all" ? "All" : "Repeat"}
          </button>
        </div>
        <div className="player-progress">
          <span className="ptime">{fmt(localPos)}</span>
          <div className="ptrack">
            <div className="pbuffer" style={{ width: `${bufferedPct}%` }} />
            <div className="pfill" style={{ width: `${progress}%` }} />
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={localPos}
              disabled={!song}
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
        <button className={`sync-btn favorite-btn ${favorite ? "on" : ""}`} onClick={() => setFavorite((v) => !v)} disabled={!song}>
          {favorite ? "Liked" : "Like"}
        </button>
        <button className="sync-btn" disabled={!song}>Playlist</button>
        {song && <DownloadButton song={song} className="sync-btn download-btn" />}
        <button className={`sync-btn ${state?.syncEnabled ? "on" : "off"}`} onClick={() => emitControl("toggle_sync", { syncEnabled: !state?.syncEnabled })}>
          {state?.syncEnabled ? "Live Sync" : "Sync Off"}
        </button>
        <label className="vol-wrap">
          Vol
          <input type="range" min={0} max={100} value={state?.volume ?? 80} onChange={(e) => emitControl("volume_change", { volume: Number(e.target.value) })} className="vol-input" />
        </label>
      </div>
    </div>
  );
}
