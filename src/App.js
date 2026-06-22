import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SocketProvider, useSocket } from "./context/SocketContext";
import { CallProvider } from "./context/CallContext";
import { DownloadProvider } from "./context/DownloadContext";
import { apiFetch, clearStoredAuth, getDeviceId, getStoredAuth, storeAuth } from "./api";
import Login from "./components/Login";
import Home from "./components/Home";
import Player from "./components/Player";
import Search from "./components/Search";
import Devices from "./components/Devices";
import Chat from "./components/Chat";
import Downloads from "./components/Downloads";
import Playlists from "./components/Playlists";
import CallModal from "./components/CallModal";
import Library from "./components/Library";
import Profile from "./components/Profile";
import Queue from "./components/Queue";
import ErrorBoundary from "./components/ErrorBoundary";
import "./App.css";

const NAV_ITEMS = [
  ["home", "Home"],
  ["search", "Search"],
  ["library", "Library"],
  ["playlists", "Playlists"],
  ["queue", "Queue"],
  ["chat", "Chat"],
  ["downloads", "Downloads"],
  ["devices", "Live Devices"],
  ["settings", "Settings"],
  ["profile", "Profile"],
];

const MOBILE_TABS = [
  ["home", "Home"],
  ["search", "Search"],
  ["library", "Library"],
  ["chat", "Chat"],
  ["profile", "Profile"],
];

const MENU_ITEMS = NAV_ITEMS.filter(([key]) => !MOBILE_TABS.some(([mobileKey]) => mobileKey === key));

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

function NavButton({ item, active, unread, onClick }) {
  const [key, label] = item;
  return (
    <button className={`nav-item ${active ? "active" : ""}`} onClick={() => onClick(key)}>
      <span>{label}</span>
      {key === "chat" && unread > 0 && <b>{unread}</b>}
    </button>
  );
}

async function retryRequest(fn, attempts = 3, delay = 900) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        await new Promise((resolve) => window.setTimeout(resolve, delay * (i + 1)));
      }
    }
  }
  throw lastError;
}

async function showChatNotification(sender, preview) {
  if (typeof window === "undefined" || !("Notification" in window)) return;

  try {
    let permission = window.Notification.permission;
    if (permission === "denied") return;

    if (permission === "default") {
      if (typeof window.Notification.requestPermission !== "function") return;
      permission = await window.Notification.requestPermission();
    }

    if (permission !== "granted") return;

    const title = "SyncWave Chat";
    const options = {
      body: `${sender}: ${preview}`,
      tag: "syncwave-chat",
      icon: "/icon.svg",
      badge: "/icon.svg",
    };

    if ("serviceWorker" in navigator) {
      try {
        const registration = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((resolve) => window.setTimeout(() => resolve(null), 1500)),
        ]);
        if (registration?.showNotification) {
          await registration.showNotification(title, options);
          return;
        }
      } catch (err) {
        console.warn("[SyncWave Notification] Service worker notification failed", err.message);
      }
    }

  } catch (err) {
    console.warn("[SyncWave Notification] Notification skipped", err.message);
  }
}

function Shell({ auth, onAuthUpdate, onLogout }) {
  const { state, connected, emit, messages } = useSocket();
  const [tab, setTab] = useState("home");
  const [toast, setToast] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatPopup, setChatPopup] = useState(null);
  const [unreadChat, setUnreadChat] = useState(0);
  const [installPrompt, setInstallPrompt] = useState(null);
  const prevRef = useRef(null);
  const lastMessageRef = useRef("");
  const [playlists, setPlaylists] = useState([]);

  const openTab = useCallback((next) => {
    setTab(next);
    setMenuOpen(false);
  }, []);

  useEffect(() => {
    const onInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onInstallPrompt);
  }, []);

  useEffect(() => {
    let alive = true;
    retryRequest(() => apiFetch("/api/playlists"), 3, 900)
      .then((data) => {
        if (!alive) return;
        setPlaylists(data.playlists || []);
        const legacyKey = `syncwave_playlists_imported_${auth.user?.id || "account"}`;
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
      .catch((err) => setToast(`Playlists unavailable: ${err.message || "Connection failed"}`));
    return () => { alive = false; };
  }, [auth.user?.id]);

  useEffect(() => {
    if (tab === "chat") {
      setUnreadChat(0);
      setChatPopup(null);
    }
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

    showChatNotification(sender, preview);

    const popupTimeout = setTimeout(() => setChatPopup(null), 5200);
    const toastTimeout = setTimeout(() => setToast(""), 3200);
    return () => {
      clearTimeout(popupTimeout);
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

  const onProfileUpdate = useCallback((user) => {
    const nextAuth = { ...auth, user };
    storeAuth(nextAuth, auth.remember !== false);
    onAuthUpdate(nextAuth);
  }, [auth, onAuthUpdate]);

  const logoutAll = useCallback(async () => {
    try {
      await apiFetch("/api/auth/logout-all", { method: "POST" });
    } catch (err) {
      setToast(err.message || "Unable to logout all devices");
    }
    clearStoredAuth();
    onAuthUpdate(null);
  }, [onAuthUpdate]);

  const playlistProps = useMemo(() => ({
    playlists,
    onCreate: createPlaylist,
    onRename: renamePlaylist,
    onDelete: deletePlaylist,
    onAddSong: addSongToPlaylist,
    onRemoveSong: removeSongFromPlaylist,
    onReorder: reorderPlaylistSong,
    onPlayPlaylist: playPlaylist,
  }), [addSongToPlaylist, createPlaylist, deletePlaylist, playPlaylist, playlists, removeSongFromPlaylist, renamePlaylist, reorderPlaylistSong]);

  const renderScreen = () => {
    if (tab === "home") return <Home playlists={playlists} onPlaySong={playSong} onPlayPlaylist={playPlaylist} onTab={openTab} />;
    if (tab === "search") return <Search />;
    if (tab === "library") return <Library playlists={playlists} onOpenPlaylists={() => openTab("playlists")} />;
    if (tab === "playlists") return <Playlists {...playlistProps} />;
    if (tab === "queue") return <Queue />;
    if (tab === "chat") return <Chat deviceName={auth.deviceName} />;
    if (tab === "downloads") return <Downloads />;
    if (tab === "devices") return <Devices />;
    if (tab === "settings") return (
      <div className="settings-panel page-pad">
        <h2>Settings</h2>
        <p>Device name: {auth.deviceName}</p>
        {installPrompt && (
          <button
            className="primary-action"
            onClick={async () => {
              await installPrompt.prompt();
              setInstallPrompt(null);
            }}
          >
            Install SyncWave
          </button>
        )}
        <button className="ghost-action danger" onClick={onLogout}>Logout This Device</button>
      </div>
    );
    if (tab === "profile") return <Profile auth={auth} onAuthUpdate={onProfileUpdate} onLogoutAll={logoutAll} />;
    return <Home playlists={playlists} onPlaySong={playSong} onPlayPlaylist={playPlaylist} onTab={openTab} />;
  };

  return (
    <div className="app">
      <aside className="desktop-sidebar">
        <div className="sidebar-brand">
          <span className="logo-mark">SW</span>
          <span className="logo-name">SyncWave</span>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavButton key={item[0]} item={item} active={tab === item[0]} unread={unreadChat} onClick={openTab} />
          ))}
        </nav>
        <div className={`sidebar-status ${connected ? "on" : "off"}`}>{connected ? "Online" : "Reconnecting"}</div>
      </aside>

      <header className="app-header">
        <div className="header-logo">
          <span className="logo-mark">SW</span>
          <span className="logo-name">SyncWave</span>
        </div>
        <div className={`conn-badge ${connected ? "on" : "off"}`}>{connected ? "Online" : "Reconnecting"}</div>
        <button className="menu-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="Open menu" aria-expanded={menuOpen}>
          <span />
          <span />
          <span />
          {unreadChat > 0 && <b>{unreadChat}</b>}
        </button>
        {menuOpen && (
          <>
            <button className="menu-backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
            <div className="hamburger-menu">
              <div className="menu-drawer-head">
                <span className="logo-mark">SW</span>
                <span className="logo-name">SyncWave</span>
              </div>
              {MENU_ITEMS.map((item) => (
                <NavButton key={item[0]} item={item} active={tab === item[0]} unread={unreadChat} onClick={openTab} />
              ))}
            </div>
          </>
        )}
      </header>

      <main className="app-main">
        <section className="app-content">
          <ErrorBoundary key={tab} name={NAV_ITEMS.find(([key]) => key === tab)?.[1] || tab}>
            {renderScreen()}
          </ErrorBoundary>
        </section>
      </main>

      <footer className="app-footer">
        <Player />
      </footer>

      <nav className="mobile-bottom-nav" aria-label="Primary navigation">
        {MOBILE_TABS.map((item) => (
          <NavButton key={item[0]} item={item} active={tab === item[0]} unread={unreadChat} onClick={openTab} />
        ))}
      </nav>

      <SyncToast msg={toast} />
      <ChatPopup item={chatPopup} onOpen={() => openTab("chat")} onClose={() => setChatPopup(null)} />
      <CallModal />
    </div>
  );
}

export default function Root() {
  const [auth, setAuth] = useState(null);
  const [checking, setChecking] = useState(true);
  const [socketError, setSocketError] = useState("");

  useEffect(() => {
    const logRuntimeError = (event) => {
      const details = {
        message: event.message || event.reason?.message || "Runtime error",
        stack: event.error?.stack || event.reason?.stack || "",
        time: new Date().toISOString(),
        userAgent: navigator.userAgent,
      };
      console.error("[SyncWave Runtime Error]", details);
      try {
        localStorage.setItem("syncwave_last_runtime_error", JSON.stringify(details));
      } catch (err) {
        // Ignore logging storage failures.
      }
    };
    window.addEventListener("error", logRuntimeError);
    window.addEventListener("unhandledrejection", logRuntimeError);
    return () => {
      window.removeEventListener("error", logRuntimeError);
      window.removeEventListener("unhandledrejection", logRuntimeError);
    };
  }, []);

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
    <ErrorBoundary name="SyncWave App">
      <SocketProvider auth={auth} onSocketError={setSocketError}>
        <CallProvider>
          <DownloadProvider>
            {socketError && <div className="socket-error">{socketError}</div>}
            <Shell auth={auth} onAuthUpdate={setAuth} onLogout={logout} />
          </DownloadProvider>
        </CallProvider>
      </SocketProvider>
    </ErrorBoundary>
  );
}
