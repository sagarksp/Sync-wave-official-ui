import React, { useMemo, useState } from "react";
import { apiFetch, getDeviceId, storeAuth } from "../api";

export default function Login({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const validation = useMemo(() => {
    if (username.trim().length > 0 && username.trim().length < 3) return "Username must be at least 3 characters.";
    if (password.length > 0 && password.length < 6) return "Password must be at least 6 characters.";
    if (deviceName.trim().length > 0 && deviceName.trim().length < 2) return "Device name must be at least 2 characters.";
    return "";
  }, [deviceName, password, username]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiFetch(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      const auth = {
        token: data.token,
        user: data.user,
        deviceId: getDeviceId(),
        deviceName: deviceName.trim(),
        remember,
      };
      storeAuth(auth, remember);
      onLogin(auth);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = username.trim().length >= 3 && password.length >= 6 && deviceName.trim().length >= 2 && !loading;

  return (
    <div className="login-screen">
      <section className="login-brand-panel">
        <div className="login-logo">
          <span className="logo-mark">SW</span>
          <span className="logo-name">SyncWave</span>
        </div>
        <h1>Music, chat, calls, and devices in one live session.</h1>
        <p>Sign in once, name this device, and keep playback, queue, downloads, chat, and calls synced across your account.</p>
        <div className="login-feature-row">
          <span>Live Sync</span>
          <span>Private Playlists</span>
          <span>HD Calls</span>
        </div>
      </section>

      <form className="login-card" onSubmit={submit}>
        <div>
          <span className="eyebrow">Welcome</span>
          <h2>{mode === "login" ? "Sign in to SyncWave" : "Create your account"}</h2>
          <p className="login-sub">Your playlists and messages stay scoped to your account.</p>
        </div>

        <div className="auth-tabs">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Login</button>
          <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Register</button>
        </div>

        <label className="field">
          <span>Username</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="sagar" />
        </label>

        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="At least 6 characters" />
        </label>

        <label className="field">
          <span>Device Name</span>
          <input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} placeholder="Sagar Laptop" autoComplete="off" />
        </label>

        <label className="remember-row">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>Remember login on this device</span>
        </label>

        {(error || validation) && <div className="form-error">{error || validation}</div>}

        <button className="login-btn" disabled={!canSubmit}>
          {loading ? "Connecting..." : mode === "login" ? "Login" : "Create Account"}
        </button>
      </form>
    </div>
  );
}
