import React from "react";

export default function Settings({ auth, installPrompt, onInstall, onLogout }) {
  return (
    <div className="settings-panel page-pad">
      <h2>Settings</h2>
      <p>Device name: {auth.deviceName}</p>
      {installPrompt && (
        <button className="primary-action" onClick={onInstall}>
          Install SyncWave
        </button>
      )}
      <button className="ghost-action danger" onClick={onLogout}>Logout This Device</button>
    </div>
  );
}
