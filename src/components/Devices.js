import React from "react";
import { useSocket } from "../context/SocketContext";
import { useCall } from "../context/CallContext";

function timeAgo(ts) {
  const then = typeof ts === "number" ? ts : new Date(ts).getTime();
  const s = Math.floor((Date.now() - then) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function Devices() {
  const { state, connected, deviceId } = useSocket();
  const call = useCall();
  const devices = state?.devices || [];
  const currentSong = state?.currentSong;

  const platformLabel = (name = "") => {
    const lower = name.toLowerCase();
    if (lower.includes("mobile") || lower.includes("phone") || lower.includes("android")) return "Mobile";
    if (lower.includes("laptop") || lower.includes("desktop") || lower.includes("pc")) return "Desktop";
    return "Device";
  };

  return (
    <div className="devices-panel">
      <div className="panel-header">
        <span className="panel-title">Connected Devices</span>
        <span className={`status-dot ${connected ? "on" : "off"}`} />
      </div>

      {devices.length === 0 ? (
        <div className="devices-empty">No devices online</div>
      ) : (
        <div className="devices-list">
          {devices.map((d) => (
            <div key={d.deviceId || d.socketId} className="device-row">
              <span className="device-icon">{platformLabel(d.deviceName).slice(0, 1)}</span>
              <div className="d-info">
                <span className="d-name">{d.deviceName}</span>
                <span className="d-time">{platformLabel(d.deviceName)} · {currentSong && state?.isPlaying ? "Listening Now" : "Idle"} · {timeAgo(d.joinedAt)}</span>
              </div>
              <span className="d-live" title="Online" />
              {d.deviceId !== deviceId && (
                <button className="device-call-btn" onClick={() => call?.startCall(d)} title={`Call ${d.deviceName}`}>
                  Call
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {state && (
        <div className={`sync-bar ${state.syncEnabled ? "on" : "off"}`}>
          {state.syncEnabled ? "Live sync active" : "Sync paused"}
        </div>
      )}
    </div>
  );
}
