import React, { useCallback, useEffect, useRef, useState } from "react";
import { SocketProvider, useSocket } from "./context/SocketContext";
import { CallProvider } from "./context/CallContext";
import { DownloadProvider } from "./context/DownloadContext";
import { apiFetch, clearStoredAuth, getDeviceId, getStoredAuth, storeAuth } from "./api";
import Login from "./components/Login";
import Home from "./components/Home";
import Player from "./components/Player";
import Queue from "./components/Queue";
import Search from "./components/Search";
import Devices from "./components/Devices";
import NowPlaying from "./components/NowPlaying";
import Chat from "./components/Chat";
import Downloads from "./components/Downloads";
import Playlists from "./components/Playlists";
import CallModal from "./components/CallModal";
import "./App.css";

function SyncToast({ msg }) {
  if (!msg) return null;
  return <div className="sync-toast">{msg}</div>;
}

function Shell({ auth, onLogout }) {
  const { state, connected, emit } = useSocket();
  const [tab, setTab] = useState("home");
  const [toast, setToast] = useState("");
  const prevRef = useRef(null);
  const [playlists, setPlaylists] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("syncwave_playlists") || "[]");
    } catch (err) {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("syncwave_playlists", JSON.stringify(playlists));
  }, [playlists]);

  useEffect(() => {
    if (!state) return;
    if (!prevRef.current) {
      prevRef.current = state;
      return;
    }

    const prev = prevRef.current;
    let msg = "";
    if (state.lastDeviceEvent && prev.lastDeviceEvent !== state.lastDeviceEvent) {
      msg = state.lastDeviceEvent.type === "join"
        ? `New device connected: ${state.lastDeviceEvent.deviceName}`
        : `${state.lastDeviceEvent.deviceName} left`;
    } else if (prev.currentSong?.id !== state.currentSong?.id && state.currentSong) {
      msg = `Now playing: ${state.currentSong.title}`;
    } else if (state.lastAction === "SEEK" && prev.lastActionId !== state.lastActionId) {
      const m = Math.floor(state.position / 60);
      const s = String(Math.floor(state.position % 60)).padStart(2, "0");
      msg = `Seeked to ${m}:${s}`;
    } else if (prev.isPlaying !== state.isPlaying) {
      msg = state.isPlaying ? "Playing" : "Paused";
    } else if (JSON.stringify(prev.queue?.map((s) => s.id)) !== JSON.stringify(state.queue?.map((s) => s.id))) {
      msg = "Queue updated";
    }

    prevRef.current = state;
    if (msg) {
      setToast(msg);
      const timeout = setTimeout(() => setToast(""), 2500);
      return () => clearTimeout(timeout);
    }
  }, [state]);

  const playSong = useCallback((song) => {
    if (!song) return;
    const currentQueue = state?.queue || [];
    const nextQueue = currentQueue.some((item) => item.id === song.id) ? currentQueue : [song, ...currentQueue].slice(0, 100);
    emit("set_queue", { queue: nextQueue });
    emit("play_song", { song });
  }, [emit, state?.queue]);

  const createPlaylist = useCallback((name) => {
    const playlist = { id: `playlist_${Date.now()}`, name, songs: [], createdAt: Date.now() };
    setPlaylists((prev) => [playlist, ...prev]);
    return playlist;
  }, []);

  const renamePlaylist = useCallback((id, name) => {
    setPlaylists((prev) => prev.map((playlist) => playlist.id === id ? { ...playlist, name } : playlist));
  }, []);

  const deletePlaylist = useCallback((id) => {
    setPlaylists((prev) => prev.filter((playlist) => playlist.id !== id));
  }, []);

  const addSongToPlaylist = useCallback((id, song) => {
    setPlaylists((prev) => prev.map((playlist) => {
      if (playlist.id !== id || !song?.id || playlist.songs.some((item) => item.id === song.id)) return playlist;
      return { ...playlist, songs: [...playlist.songs, song] };
    }));
  }, []);

  const removeSongFromPlaylist = useCallback((id, songId) => {
    setPlaylists((prev) => prev.map((playlist) => playlist.id === id ? { ...playlist, songs: playlist.songs.filter((song) => song.id !== songId) } : playlist));
  }, []);

  const reorderPlaylistSong = useCallback((id, from, to) => {
    setPlaylists((prev) => prev.map((playlist) => {
      if (playlist.id !== id || to < 0 || to >= playlist.songs.length) return playlist;
      const songs = [...playlist.songs];
      const [item] = songs.splice(from, 1);
      songs.splice(to, 0, item);
      return { ...playlist, songs };
    }));
  }, []);

  const playPlaylist = useCallback((playlist) => {
    if (!playlist?.songs?.length) return;
    emit("set_queue", { queue: playlist.songs.slice(0, 100) });
    emit("play_song", { song: playlist.songs[0] });
  }, [emit]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-logo">
          <span className="logo-mark">SW</span>
          <span className="logo-name">SyncWave</span>
        </div>
        <div className="header-tabs">
          {["home", "search", "queue", "playlists", "downloads", "chat", "now"].map((item) => (
            <button key={item} className={`htab ${tab === item ? "active" : ""}`} onClick={() => setTab(item)}>
              {item === "home" && "Home"}
              {item === "search" && "Search"}
              {item === "queue" && <>Queue {state?.queue?.length > 0 && <span className="htab-badge">{state.queue.length}</span>}</>}
              {item === "playlists" && <>Playlists {playlists.length > 0 && <span className="htab-badge">{playlists.length}</span>}</>}
              {item === "downloads" && "Downloads"}
              {item === "chat" && "Chat"}
              {item === "now" && "Now"}
            </button>
          ))}
        </div>
        <div className={`conn-badge ${connected ? "on" : "off"}`}>{connected ? "Online" : "Reconnecting"}</div>
        <button className="logout-btn" onClick={onLogout}>Logout</button>
      </header>

      <main className="app-main">
        <aside className="sidebar-left">
          <Devices />
        </aside>

        <section className="app-content">
          {tab === "home" && <Home playlists={playlists} onPlaySong={playSong} onPlayPlaylist={playPlaylist} onTab={setTab} />}
          {tab === "search" && <Search />}
          {tab === "queue" && <Queue />}
          {tab === "playlists" && (
            <Playlists
              playlists={playlists}
              onCreate={createPlaylist}
              onRename={renamePlaylist}
              onDelete={deletePlaylist}
              onAddSong={addSongToPlaylist}
              onRemoveSong={removeSongFromPlaylist}
              onReorder={reorderPlaylistSong}
              onPlayPlaylist={playPlaylist}
            />
          )}
          {tab === "downloads" && <Downloads />}
          {tab === "chat" && <Chat deviceName={auth.deviceName} />}
          {tab === "now" && <NowPlaying />}
        </section>

        <aside className="sidebar-right">
          <NowPlaying />
          <Chat deviceName={auth.deviceName} />
        </aside>
      </main>

      <footer className="app-footer">
        <Player />
      </footer>

      <SyncToast msg={toast} />
      <CallModal />
    </div>
  );
}

export default function Root() {
  const [auth, setAuth] = useState(null);
  const [checking, setChecking] = useState(true);
  const [socketError, setSocketError] = useState("");

  useEffect(() => {
    const saved = getStoredAuth();
    if (!saved?.token) {
      setChecking(false);
      return;
    }

    apiFetch("/api/auth/session")
      .then((data) => {
        const restored = {
          ...saved,
          user: data.user,
          deviceId: saved.deviceId || getDeviceId(),
          deviceName: saved.deviceName || "SyncWave Device",
        };
        storeAuth(restored, saved.remember !== false);
        setAuth(restored);
      })
      .catch(() => clearStoredAuth())
      .finally(() => setChecking(false));
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch("/api/auth/logout", {
        method: "POST",
        body: JSON.stringify({ deviceId: auth?.deviceId }),
      });
    } catch (err) {
      // Local logout still succeeds if the server is unavailable.
    }
    clearStoredAuth();
    setAuth(null);
  }, [auth?.deviceId]);

  if (checking) return <div className="boot-screen">SyncWave</div>;
  if (!auth) return <Login onLogin={setAuth} />;

  return (
    <SocketProvider auth={auth} onSocketError={setSocketError}>
      <CallProvider>
        <DownloadProvider>
          {socketError && <div className="socket-error">{socketError}</div>}
          <Shell auth={auth} onLogout={logout} />
        </DownloadProvider>
      </CallProvider>
    </SocketProvider>
  );
}
