import React, { useState } from "react";
import { apiFetch } from "../api";
import Devices from "./Devices";

export default function Profile({ auth, onAuthUpdate, onLogoutAll }) {
  const [displayName, setDisplayName] = useState(auth.user?.displayName || auth.user?.username || "");
  const [avatarUrl, setAvatarUrl] = useState(auth.user?.avatarUrl || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const data = await apiFetch("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ displayName, avatarUrl }),
      });
      onAuthUpdate(data.user);
      setMessage("Profile updated");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await apiFetch("/api/profile/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, nextPassword }),
      });
      setMessage("Password changed. Please sign in again.");
      onLogoutAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-page">
      <section className="profile-card">
        <div className="profile-avatar">
          {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{(displayName || "SW").slice(0, 2).toUpperCase()}</span>}
        </div>
        <div className="profile-copy">
          <span className="eyebrow">Profile</span>
          <h2>{displayName || auth.user?.username}</h2>
          <p>{auth.user?.username}</p>
        </div>
      </section>

      <section className="settings-grid">
        <form className="settings-panel" onSubmit={saveProfile}>
          <div className="section-head compact-head"><div><h2>Account</h2><p>Update your public device account identity.</p></div></div>
          <label className="field"><span>Name</span><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} /></label>
          <label className="field"><span>Profile Picture URL</span><input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." /></label>
          <button className="primary-action" disabled={saving || displayName.trim().length < 2}>Save Profile</button>
        </form>

        <form className="settings-panel" onSubmit={changePassword}>
          <div className="section-head compact-head"><div><h2>Password</h2><p>Changing password signs out every device.</p></div></div>
          <label className="field"><span>Current Password</span><input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></label>
          <label className="field"><span>New Password</span><input type="password" value={nextPassword} onChange={(e) => setNextPassword(e.target.value)} minLength={6} /></label>
          <button className="ghost-action danger" disabled={saving || currentPassword.length < 6 || nextPassword.length < 6}>Change Password</button>
        </form>
      </section>

      {(message || error) && <div className={error ? "form-error" : "form-success"}>{error || message}</div>}

      <section className="settings-panel">
        <div className="section-head compact-head">
          <div><h2>Connected Devices</h2><p>Manage active sessions for this account.</p></div>
          <button className="ghost-action danger" onClick={onLogoutAll}>Logout All Devices</button>
        </div>
        <Devices />
      </section>
    </div>
  );
}
