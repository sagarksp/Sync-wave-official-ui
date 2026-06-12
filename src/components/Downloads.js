import React, { useMemo, useRef, useState } from "react";
import { useSocket } from "../context/SocketContext";
import { useDownloads } from "../context/DownloadContext";
import { formatBytes } from "../downloads";

function fmt(sec) {
  if (!sec) return "";
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

export default function Downloads() {
  const { emit, state, deviceId, deviceName } = useSocket();
  const { downloads, progress, deleteDownload } = useDownloads();
  const audioRef = useRef(null);
  const [offlineSong, setOfflineSong] = useState(null);
  const activeProgress = useMemo(() => Object.entries(progress), [progress]);
  const isHost = !state?.hostDeviceId || state.hostDeviceId === deviceId;

  const playOffline = (song) => {
    setOfflineSong(song);
    window.setTimeout(() => audioRef.current?.play().catch(() => {}), 30);
  };

  const syncSong = (song) => {
    if (!isHost) {
      console.log(`[${deviceName || "SyncWave Device"}] PLAY_SONG_BLOCKED_NON_HOST`, { hostDeviceName: state?.hostDeviceName });
      return;
    }
    emit("play_song", { song });
  };

  return (
    <div className="downloads-panel">
      <div className="panel-header">
        <span className="panel-title">Downloads</span>
        <span className="panel-badge">{downloads.length}</span>
      </div>

      <audio ref={audioRef} src={offlineSong?.offlineUrl || ""} controls className={`offline-audio ${offlineSong ? "show" : ""}`} />

      {activeProgress.length > 0 && (
        <div className="download-progress-list">
          {activeProgress.map(([id, item]) => (
            <div key={id} className={`download-progress ${item.error ? "error" : ""}`}>
              <div className="dp-top"><span>{item.error || "Downloading"}</span><span>{item.value || 0}%</span></div>
              <div className="dp-track"><div style={{ width: `${item.value || 0}%` }} /></div>
            </div>
          ))}
        </div>
      )}

      {downloads.length === 0 ? (
        <div className="queue-empty">
          <div className="empty-title">No downloads yet</div>
          <div>Downloaded songs will play here without the network.</div>
        </div>
      ) : (
        <div className="downloads-list">
          {downloads.map((song) => (
            <div key={song.id} className="download-row">
              <img src={song.cover} alt={song.title} className="qi-cover" onError={(e) => { e.target.src = "https://via.placeholder.com/42/1a1a2e/fff?text=SW"; }} />
              <div className="download-info">
                <span className="qi-title">{song.title}</span>
                <span className="qi-artist">{song.artist}</span>
                <span className="download-meta">{formatBytes(song.size)} {song.duration ? `- ${fmt(song.duration)}` : ""}</span>
              </div>
              <div className="download-actions">
                <button className="qi-btn" onClick={() => playOffline(song)}>Offline</button>
                <button className="qi-btn" onClick={() => syncSong(song)}>Sync</button>
                <button className="qi-btn del" onClick={() => deleteDownload(song.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
