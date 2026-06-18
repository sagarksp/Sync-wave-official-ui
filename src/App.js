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

function ChatPopup({ item, onOpen, onClose }) {
  if (!item) return null;
  return (
    <button className="chat-popup" onClick={onOpen} type="button">
      <span className="chat-popup-title">{item.sender}</span>
      <span className="chat-popup-text">{item.preview}</span>
      <span className="chat-popup-close" onClick={(e) => { e.stopPropagation(); onClose(); }}>Close</span>
    </button>
  );
}

function Shell({ auth, onLogout }) {
  const { state, connected, emit, messages } = useSocket();
  const [tab, setTab] = useState("home");
  const [toast, setToast] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatPopup, setChatPopup] = useState(null);
  const [unreadChat, setUnreadChat] = useState(0);
  const prevRef = useRef(null);
  const lastMessageRef = useRef("");
  const [playlists, setPlaylists] = useState([]);

  useEffect(() => {
    let alive = true;
    apiFetch("/api/playlists")
      .then((data) => {
        if (!alive) return;
        setPlaylists(data.playlists || []);
        const legacyKey = `syncwave_playlists_imported_${auth.user?.id || auth.user?._id || "account"}`;
        let legacy = [];
        try {
          legacy = JSON.parse(localStorage.getItem("syncwave_playlists") || "[]");
        } catch (err) {
          legacy = [];
        }
        if (!localStorage.getItem(legacyKey) && legacy.length && !(data.playlists || []).length) {
          localStorage.setItem(legacyKey, "1");
          Promise.all(legacy.slice(0, 50).map((playlist) => apiFetch("/api/playlists", {
            method: "POST",
            body: JSON.stringify({ name: playlist.name, songs: playlist.songs || [] }),
          }).catch(() => null))).then((created) => {
            const imported = created.map((item) => item?.playlist).filter(Boolean);
            if (imported.length) setPlaylists(imported);
          });
        }
      })
      .catch((err) => setToast(err.message || "Playlists unavailable"));
    return () => { alive = false; };
  }, [auth.user]);

  useEffect(() => {
    if (tab === "chat") {
      setUnreadChat(0);
      setChatPopup(null);
    }
    setMenuOpen(false);
  }, [tab]);

  useEffect(() => {
    const latest = messages[messages.length - 1];
    if (!latest) return;
    const id = latest._id || `${latest.timestamp}-${latest.deviceName}-${latest.message}`;
    if (lastMessageRef.current === id) return;
    lastMessageRef.current = id;
    if (latest.deviceName === auth.deviceName) return;

    const preview = String(latest.message || "").slice(0, 96);
    const sender = latest.deviceName || "SyncWave";
    setChatPopup({ sender, preview });
    setToast(`${sender}: ${preview}`);
    if (tab !== "chat") setUnreadChat((count) => count + 1);

    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification("SyncWave Chat", { body: `${sender}: ${preview}` });
      } else if (Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    }

    const timeout = setTimeout(() => setChatPopup(null), 5200);
    const toastTimeout = setTimeout(() => setToast(""), 3200);
    return () => {
      clearTimeout(timeout);
      clearTimeout(toastTimeout);
    };
  }, [auth.deviceName, messages, tab]);

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

  const savePlaylist = useCallback(async (id, patch) => {
    const data = await apiFetch(`/api/playlists/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    setPlaylists((prev) => prev.map((playlist) => playlist.id === id ? data.playlist : playlist));
    return data.playlist;
  }, []);

  const createPlaylist = useCallback(async (name) => {
    const temp = { id: `pending_${Date.now()}`, name, songs: [], createdAt: Date.now(), pending: true };
    setPlaylists((prev) => [temp, ...prev]);
    const data = await apiFetch("/api/playlists", {
      method: "POST",
      body: JSON.stringify({ name, songs: [] }),
    });
    const playlist = data.playlist;
    setPlaylists((prev) => [playlist, ...prev.filter((item) => item.id !== temp.id)]);
    return playlist;
  }, []);

  const renamePlaylist = useCallback((id, name) => {
    setPlaylists((prev) => prev.map((playlist) => playlist.id === id ? { ...playlist, name } : playlist));
    savePlaylist(id, { name }).catch((err) => setToast(err.message || "Rename failed"));
  }, [savePlaylist]);

  const deletePlaylist = useCallback((id) => {
    setPlaylists((prev) => prev.filter((playlist) => playlist.id !== id));
    apiFetch(`/api/playlists/${id}`, { method: "DELETE" }).catch((err) => setToast(err.message || "Delete failed"));
  }, []);

  const addSongToPlaylist = useCallback((id, song) => {
    setPlaylists((prev) => prev.map((playlist) => {
      if (playlist.id !== id || !song?.id || playlist.songs.some((item) => item.id === song.id)) return playlist;
      const next = { ...playlist, songs: [...playlist.songs, song] };
      savePlaylist(id, { songs: next.songs }).catch((err) => setToast(err.message || "Add failed"));
      return next;
    }));
  }, [savePlaylist]);

  const removeSongFromPlaylist = useCallback((id, songId) => {
    setPlaylists((prev) => prev.map((playlist) => {
      if (playlist.id !== id) return playlist;
      const next = { ...playlist, songs: playlist.songs.filter((song) => song.id !== songId) };
      savePlaylist(id, { songs: next.songs }).catch((err) => setToast(err.message || "Remove failed"));
      return next;
    }));
  }, [savePlaylist]);

  const reorderPlaylistSong = useCallback((id, from, to) => {
    setPlaylists((prev) => prev.map((playlist) => {
      if (playlist.id !== id || to < 0 || to >= playlist.songs.length) return playlist;
      const songs = [...playlist.songs];
      const [item] = songs.splice(from, 1);
      songs.splice(to, 0, item);
      const next = { ...playlist, songs };
      savePlaylist(id, { songs }).catch((err) => setToast(err.message || "Reorder failed"));
      return next;
    }));
  }, [savePlaylist]);

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
          {["home", "search", "now", "playlists"].map((item) => (
            <button key={item} className={`htab ${tab === item ? "active" : ""}`} onClick={() => setTab(item)}>
              {item === "home" && "Home"}
              {item === "search" && "Search"}
              {item === "now" && "Now Playing"}
              {item === "playlists" && <>Library {playlists.length > 0 && <span className="htab-badge">{playlists.length}</span>}</>}
            </button>
          ))}
        </div>
        <div className={`conn-badge ${connected ? "on" : "off"}`}>{connected ? "Online" : "Reconnecting"}</div>
        <button className="menu-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="Open menu" aria-expanded={menuOpen}>
          <span />
          <span />
          <span />
          {unreadChat > 0 && <b>{unreadChat}</b>}
        </button>
        <button className="logout-btn" onClick={onLogout}>Logout</button>
        {menuOpen && (
          <div className="hamburger-menu">
            {[
              ["profile", "Profile"],
              ["devices", "Connected Devices"],
              ["downloads", "Downloads"],
              ["settings", "Settings"],
              ["playlists", "Playlists"],
              ["calls", "Video Calls"],
              ["chat", `Chat${unreadChat ? ` (${unreadChat})` : ""}`],
              ["about", "About"],
            ].map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)}>{label}</button>
            ))}
          </div>
        )}
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
          {tab === "devices" && <Devices />}
          {tab === "profile" && <div className="simple-panel"><h2>Profile</h2><p>{auth.user?.username}</p></div>}
          {tab === "settings" && <div className="simple-panel"><h2>Settings</h2><p>Device: {auth.deviceName}</p></div>}
          {tab === "calls" && <div className="simple-panel"><h2>Video Calls</h2><p>Start calls from Connected Devices.</p></div>}
          {tab === "about" && <div className="simple-panel"><h2>About SyncWave</h2><p>Real-time music, chat, and calling for your devices.</p></div>}
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
      <ChatPopup item={chatPopup} onOpen={() => setTab("chat")} onClose={() => setChatPopup(null)} />
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
