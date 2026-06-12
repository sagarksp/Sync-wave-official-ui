import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { downloadSong, listDownloads, removeDownload } from "../downloads";

const DownloadContext = createContext(null);

export function DownloadProvider({ children }) {
  const [downloads, setDownloads] = useState([]);
  const [progress, setProgress] = useState({});

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
    try {
      await downloadSong(song, (value) => {
        setProgress((prev) => ({ ...prev, [song.id]: { value, error: "" } }));
      });
      await refresh();
      window.setTimeout(() => {
        setProgress((prev) => {
          const next = { ...prev };
          delete next[song.id];
          return next;
        });
      }, 1200);
    } catch (err) {
      setProgress((prev) => ({ ...prev, [song.id]: { value: 0, error: err.message || "Download failed" } }));
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

  return <DownloadContext.Provider value={value}>{children}</DownloadContext.Provider>;
}

export function useDownloads() {
  return useContext(DownloadContext);
}
