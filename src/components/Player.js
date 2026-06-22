import React, { useEffect, useRef, useState } from "react";
import { useSocket } from "../context/SocketContext";
import DownloadButton from "./DownloadButton";
import { API_URL } from "../api";

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
  console.log("PLAYER RENDER");
  console.log({
    currentSong: state?.currentSong,
    isPlaying: state?.isPlaying,
    position: state?.position,
    volume: state?.volume,
  });

  useEffect(() => {
    latestStateRef.current = state;
    console.log("PLAYER UPDATED", {
      currentSong: state?.currentSong?.title || "",
      videoId: state?.currentSong?.videoId || "",
      streamUrl: state?.currentSong?.streamUrl || "",
      isPlaying: Boolean(state?.isPlaying),
      queueLength: state?.queue?.length || 0,
      playerType: "audio",
    });
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
    if (!audio || !currentState?.currentSong || !readyRef.current) {
      debug(deviceName, "PLAY_SKIPPED_NOT_READY", { reason, hasAudio: Boolean(audio), hasSong: Boolean(currentState?.currentSong), ready: readyRef.current });
      return;
    }

    if (currentState.isPlaying) {
      if (audio.paused) {
        debug(deviceName, "play triggered", { reason, src: audio.currentSrc || audio.src, readyState: audio.readyState });
        await audio.play().catch((err) => {
          debug(deviceName, "PLAY_BLOCKED", { reason, error: err.message });
        });
      }
    } else if (!audio.paused) {
      debug(deviceName, "pause triggered", { reason });
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
    debug(deviceName, "currentSong updated", { title: song.title, songId: song.id, hasStreamUrl: Boolean(song.streamUrl), loadId });

    audio.pause();
    audio.src = song.streamUrl || "";
    debug(deviceName, "player loaded", { title: song.title, src: audio.src, loadId });
    audio.load();

    let completed = false;
    const completeLoad = async (eventName) => {
      if (completed || loadIdRef.current !== loadId) return;
      completed = true;
      readyRef.current = true;
      setBuffering(false);
      debug(deviceName, "player ready", { eventName, loadId, readyState: audio.readyState, duration: audio.duration });
      safeRemoteSeek(expectedPosition(latestStateRef.current), "song-load");
      await applyPlayState("song-load");
    };

    const onCanPlay = () => completeLoad("canplay");
    const onLoadedMetadata = () => completeLoad("loadedmetadata");
    const onError = () => {
      const err = audio.error;
      debug(deviceName, "PLAYER_LOAD_ERROR", { code: err?.code, message: err?.message, src: audio.currentSrc || audio.src });
      setBuffering(false);
    };
    audio.addEventListener("canplay", onCanPlay, { once: true });
    audio.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });
    audio.addEventListener("error", onError, { once: true });

    return () => {
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("error", onError);
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
    emit(event, data, (res) => {
      console.log("PLAYER CONTROL ACK", { event, res });
    });
  };

  const handlePlayPause = () => {
    console.log("PLAYER PLAY BUTTON CLICK", {
      currentSong: song,
      isPlaying: state?.isPlaying,
    });
    emitControl("play_pause", { isPlaying: !state?.isPlaying });
  };

  const handleVolume = (e) => {
    const volume = Number(e.target.value);
    console.log("PLAYER VOLUME CHANGE", { volume });
    emitControl("volume_change", { volume });
  };

  const playSimilar = async () => {
    if (!song?.artist && !song?.language) return false;
    const term = [song.artist, song.language].filter(Boolean).join(" ");
    try {
      const res = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(term)}&limit=12`);
      const data = await res.json();
      const similar = (data.results || []).filter((item) => item.id !== song.id && item.streamUrl);
      if (!similar.length) return false;
      const nextQueue = [...(state?.queue || []), ...similar].filter((item, idx, list) => list.findIndex((s) => s.id === item.id) === idx).slice(0, 100);
      emitControl("set_queue", { queue: nextQueue });
      emitControl("play_song", { song: similar[0] });
      return true;
    } catch (err) {
      debug(deviceName, "AUTOPLAY_SIMILAR_FAILED", { error: err.message });
      return false;
    }
  };

  const handleEnded = async () => {
    debug(deviceName, "song ended", { title: song?.title, repeatMode, shuffle });
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
    const queue = state?.queue || [];
    const idx = queue.findIndex((item) => item.id === song?.id);
    const hasNext = idx >= 0 && idx < queue.length - 1;
    if (hasNext || repeatMode === "all") {
      emitControl("next_song");
      return;
    }
    const startedSimilar = await playSimilar();
    if (!startedSimilar) emitControl("play_pause", { isPlaying: false });
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
          <button className="ctrl play" onClick={handlePlayPause} disabled={!song}>
            {buffering ? "..." : state?.isPlaying ? "Pause" : "Play"}
          </button>
          <button
            className={`sync-btn live-sync-toggle ${state?.syncEnabled ? "on" : "off"}`}
            onClick={() => emitControl("toggle_sync", { syncEnabled: !state?.syncEnabled })}
            title={state?.syncEnabled ? "Live Sync Enabled" : "Live Sync Disabled"}
          >
            {state?.syncEnabled ? "Live Sync Enabled" : "Live Sync Disabled"}
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
        {song && <DownloadButton song={song} className="sync-btn download-btn" />}
        <label className="vol-wrap">
          Vol
          <input type="range" min={0} max={100} value={state?.volume ?? 80} onChange={handleVolume} className="vol-input" />
        </label>
      </div>
    </div>
  );
}
