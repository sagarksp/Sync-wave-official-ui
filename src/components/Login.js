import React, { useState } from "react";
import { apiFetch, getDeviceId, storeAuth } from "../api";

export default function Login({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  const canSubmit = username.trim().length >= 3 && password.length >= 6 && deviceName.trim().length >= 2;

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">
          <span className="logo-mark">SW</span>
          <span className="logo-name">SyncWave</span>
        </div>
        <p className="login-sub">Sign in, name this device, and keep every screen in sync.</p>

        <div className="auth-tabs">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Login</button>
          <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Register</button>
        </div>

        <label className="field">
          <span>Username</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </label>

        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} />
        </label>

        <label className="field">
          <span>Enter Device Name</span>
          <input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} placeholder="Sagar Laptop" autoComplete="off" />
        </label>

        <label className="remember-row">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>Remember login</span>
        </label>

        {error && <div className="form-error">{error}</div>}

        <button className="login-btn" disabled={!canSubmit || loading}>
          {loading ? "Connecting..." : mode === "login" ? "Login" : "Create Account"}
        </button>
      </form>
    </div>
  );
}
