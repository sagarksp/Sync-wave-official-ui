import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { downloadSong, listDownloads, removeDownload } from "../downloads";

const DownloadContext = createContext(null);

export function DownloadProvider({ children }) {
  const [downloads, setDownloads] = useState([]);
  const [progress, setProgress] = useState({});
  const [toast, setToast] = useState("");

  const refresh = useCallback(async () => {
    const items = await listDownloads().catch(() => []);
    setDownloads(items.sort((a, b) => (b.downloadedAt || 0) - (a.downloadedAt || 0)));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const startDownload = useCallback(async (song) => {
    if (!song?.id) return;
    setProgress((prev) => ({ ...prev, [song.id]: { value: 1, error: "" } }));
    setToast(`Downloading ${song.title || "song"}...`);
    try {
      const item = await downloadSong(song, (value) => {
        setProgress((prev) => ({ ...prev, [song.id]: { value, error: "" } }));
      });
      await refresh();
      setToast(`Downloaded ${item.title || song.title || "song"}`);
      window.setTimeout(() => {
        setProgress((prev) => {
          const next = { ...prev };
          delete next[song.id];
          return next;
        });
      }, 1200);
      window.setTimeout(() => setToast(""), 3200);
    } catch (err) {
      const message = err.message || "Download failed";
      setProgress((prev) => ({ ...prev, [song.id]: { value: 0, error: message } }));
      setToast(message);
      window.setTimeout(() => setToast(""), 4200);
    }
  }, [refresh]);

  const deleteDownload = useCallback(async (id) => {
    await removeDownload(id);
    await refresh();
  }, [refresh]);

  const value = useMemo(() => ({
    downloads,
    progress,
    refresh,
    startDownload,
    deleteDownload,
    isDownloaded: (id) => downloads.some((item) => item.id === id),
  }), [deleteDownload, downloads, progress, refresh, startDownload]);

  return (
    <DownloadContext.Provider value={value}>
      {children}
      {toast && <div className="sync-toast download-toast">{toast}</div>}
    </DownloadContext.Provider>
  );
}

export function useDownloads() {
  return useContext(DownloadContext);
}
