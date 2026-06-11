import React, { useCallback, useEffect, useRef, useState } from "react";
import { SocketProvider, useSocket } from "./context/SocketContext";
import { apiFetch, clearStoredAuth, getDeviceId, getStoredAuth, storeAuth } from "./api";
import Login from "./components/Login";
import Player from "./components/Player";
import Queue from "./components/Queue";
import Search from "./components/Search";
import Devices from "./components/Devices";
import NowPlaying from "./components/NowPlaying";
import Chat from "./components/Chat";
import "./App.css";

function SyncToast({ msg }) {
  if (!msg) return null;
  return <div className="sync-toast">{msg}</div>;
}

function Shell({ auth, onLogout }) {
  const { state, connected } = useSocket();
  const [tab, setTab] = useState("search");
  const [toast, setToast] = useState("");
  const prevRef = useRef(null);

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
    } else if (Math.abs((prev.position || 0) - (state.position || 0)) > 2) {
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

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-logo">
          <span className="logo-mark">SW</span>
          <span className="logo-name">SyncWave</span>
        </div>
        <div className="header-tabs">
          {["search", "queue", "chat", "now"].map((item) => (
            <button key={item} className={`htab ${tab === item ? "active" : ""}`} onClick={() => setTab(item)}>
              {item === "search" && "Search"}
              {item === "queue" && <>Queue {state?.queue?.length > 0 && <span className="htab-badge">{state.queue.length}</span>}</>}
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
          {tab === "search" && <Search />}
          {tab === "queue" && <Queue />}
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
      {socketError && <div className="socket-error">{socketError}</div>}
      <Shell auth={auth} onLogout={logout} />
    </SocketProvider>
  );
}
