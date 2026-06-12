import React from "react";
import { useDownloads } from "../context/DownloadContext";

export default function DownloadButton({ song, className = "download-btn" }) {
  const downloads = useDownloads();
  if (!song?.id || !downloads) return null;

  const status = downloads.progress[song.id];
  const done = downloads.isDownloaded(song.id);
  const busy = status && !status.error && status.value < 100;

  return (
    <button
      className={`${className} ${done ? "downloaded" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        if (!busy && !done) downloads.startDownload(song);
      }}
      disabled={busy || done}
      title={status?.error || (done ? "Downloaded for offline playback" : "Download")}
    >
      {busy ? `${status.value}%` : done ? "Saved" : "⬇ Download"}
    </button>
  );
}
