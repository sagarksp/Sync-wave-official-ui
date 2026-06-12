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
  const base = Number(state.position || state.positionAtStart || 0);
  if (!state.isPlaying || !state.serverTime) return base;
  const elapsed = (Date.now() - state.serverTime) / 1000;
  return Math.min(base + elapsed, state.currentSong.duration || 9999);
}

export default function Player() {
  const { state, emit, deviceId, deviceName } = useSocket();
  const audioRef = useRef(null);
  const latestStateRef = useRef(null);
  const loadIdRef = useRef(0);
  const readyRef = useRef(false);
  const remoteSeekRef = useRef(false);
  const [localPos, setLocalPos] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [buffering, setBuffering] = useState(false);

  const song = state?.currentSong;
  const isHost = !state?.hostDeviceId || state.hostDeviceId === deviceId;

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  const safeRemoteSeek = (position, reason) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(position)) return;
    remoteSeekRef.current = true;
    debug(deviceName, "SEEK_APPLIED_REMOTE", { position, reason });
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
    if (isRemoteSeekAction || Math.abs(actual - target) > 2.5) {
      safeRemoteSeek(target, action || "drift");
    }
  }, [state?.lastActionId, state?.position, song?.id, dragging]);

  useEffect(() => {
    applyPlayState(state?.lastAction || "state-update");
  }, [state?.isPlaying, state?.lastActionId, song?.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = (state?.volume ?? 80) / 100;
  }, [state?.volume]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const audio = audioRef.current;
      const currentState = latestStateRef.current;
      if (!audio || !currentState?.currentSong || !readyRef.current || dragging) return;

      debug(deviceName, "PLAYER_STATE", {
        paused: audio.paused,
        currentTime: audio.currentTime,
        serverPosition: expectedPosition(currentState),
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
    if (!isHost && event !== "volume_change" && event !== "toggle_sync") {
      debug(deviceName, `${event.toUpperCase()}_BLOCKED_NON_HOST`, { hostDeviceName: state?.hostDeviceName });
      return;
    }
    emit(event, data);
  };

  const handleSeekEnd = (e) => {
    const pos = Number(e.target.value);
    setDragging(false);
    safeRemoteSeek(pos, "local-user");
    emitControl("seek", { position: pos });
  };

  return (
    <div className="player">
      <audio
        ref={audioRef}
        onTimeUpdate={() => {
          if (!dragging) setLocalPos(audioRef.current?.currentTime || 0);
        }}
        onEnded={() => emitControl("next_song")}
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
          <button className="ctrl" onClick={() => emitControl("prev_song")} disabled={!song || !isHost} title="Previous">Prev</button>
          <button className="ctrl play" onClick={() => emitControl("play_pause", { isPlaying: !state?.isPlaying })} disabled={!song || !isHost}>
            {buffering ? "..." : state?.isPlaying ? "Pause" : "Play"}
          </button>
          <button className="ctrl" onClick={() => emitControl("next_song")} disabled={!song || !isHost} title="Next">Next</button>
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
              disabled={!song || !isHost}
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
