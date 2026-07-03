import { API_URL, getStoredAuth } from "./api";

const DB_NAME = "syncwave_downloads";
const STORE_NAME = "songs";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putDownload(item) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllDownloads() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function deleteDownload(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function loadCapacitorFilesystem() {
  try {
    const { Capacitor, registerPlugin } = await import("@capacitor/core");
    const { Directory, Filesystem } = await import("@capacitor/filesystem");
    if (!Capacitor?.isNativePlatform?.()) return null;
    return {
      Capacitor,
      Filesystem,
      FileTransfer: registerPlugin("FileTransfer"),
      FileOpener: registerPlugin("FileOpener"),
      LocalNotifications: registerPlugin("LocalNotifications"),
      Directory,
    };
  } catch (err) {
    return null;
  }
}

async function notifyNativeDownload(fs, title, body) {
  try {
    const permissions = await fs.LocalNotifications?.requestPermissions?.();
    if (permissions && permissions.display === "denied") return;
    await fs.LocalNotifications?.schedule?.({
      notifications: [{
        id: Date.now() % 2147483647,
        title,
        body,
        schedule: { at: new Date(Date.now() + 200) },
      }],
    });
  } catch (err) {
    // Native notifications are optional in this app build.
  }
}

function authHeaders() {
  const token = getStoredAuth()?.token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function urlFromValue(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.find((item) => item?.quality === "320kbps")?.url ||
      value.find((item) => item?.quality === "160kbps")?.url ||
      value.find((item) => item?.url)?.url ||
      "";
  }
  if (typeof value === "object") return value.url || value.link || "";
  return "";
}

function directSongUrl(song) {
  return urlFromValue(song?.downloadUrl) || urlFromValue(song?.audioUrl) || urlFromValue(song?.mediaUrl) || urlFromValue(song?.streamUrl);
}

function safePart(value, fallback) {
  return String(value || fallback || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._ -]+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function extensionFromUrl(value) {
  try {
    const pathname = new URL(value, window.location.href).pathname.toLowerCase();
    const match = pathname.match(/\.([a-z0-9]{2,5})$/i);
    if (match && ["mp3", "m4a", "mp4", "aac", "wav", "webm"].includes(match[1])) return `.${match[1]}`;
  } catch (err) {
    // Fall back to content type.
  }
  return "";
}

function extensionFromType(value) {
  const type = String(value || "").toLowerCase();
  if (type.includes("mp4")) return ".mp4";
  if (type.includes("m4a") || type.includes("aac")) return ".m4a";
  if (type.includes("mpeg") || type.includes("mp3")) return ".mp3";
  if (type.includes("wav")) return ".wav";
  if (type.includes("webm")) return ".webm";
  return "";
}

function songFileName(song, url, contentType = "") {
  const artist = safePart(song?.artist || song?.artists, "Unknown Artist");
  const title = safePart(song?.title || song?.name, "Unknown Song");
  const ext = extensionFromUrl(url) || extensionFromType(contentType) || ".mp3";
  return `${artist} - ${title}${ext}`;
}

function triggerBrowserDownload(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs || 45000);
  try {
    return await fetch(url, { ...options, signal: options.signal || controller.signal });
  } catch (err) {
    if (err?.name === "AbortError") throw new Error("Network timeout. Please retry.");
    throw new Error(navigator.onLine === false ? "Network unavailable" : "Network error. Please retry.");
  } finally {
    window.clearTimeout(timeout);
  }
}

async function nativeDownload(fs, { absoluteUrl, path, directory, headers, onProgress }) {
  let progressHandle = null;
  const onNativeProgress = (event = {}) => {
    const bytes = Number(event.bytes || event.bytesDownloaded || event.loaded || 0);
    const total = Number(event.contentLength || event.totalBytes || event.total || 0);
    if (total > 0) onProgress?.(Math.min(96, Math.max(8, Math.round((bytes / total) * 100))));
  };
  try {
    if (fs.FileTransfer?.addListener) {
      progressHandle = await fs.FileTransfer.addListener("progress", onNativeProgress).catch(() => null);
    } else if (fs.Filesystem?.addListener) {
      progressHandle = await fs.Filesystem.addListener("progress", onNativeProgress).catch(() => null);
    }

    if (fs.FileTransfer?.downloadFile) {
      try {
        return await fs.FileTransfer.downloadFile({ url: absoluteUrl, path, directory, headers, progress: true });
      } catch (err) {
        // Some native builds do not include FileTransfer yet. Fall back to Filesystem.
      }
    }
    return await fs.Filesystem.downloadFile({ url: absoluteUrl, path, directory, headers, progress: true });
  } finally {
    await progressHandle?.remove?.().catch(() => {});
  }
}

export function formatBytes(bytes) {
  if (!bytes) return "Unknown size";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(idx ? 1 : 0)} ${units[idx]}`;
}

export async function listDownloads() {
  const items = await getAllDownloads();
  return items.map((item) => (
    item.storage === "indexeddb" && item.blob
      ? { ...item, offlineUrl: URL.createObjectURL(item.blob) }
      : item
  ));
}

export async function removeDownload(id) {
  const item = (await getAllDownloads()).find((d) => d.id === id);
  const fs = await loadCapacitorFilesystem();
  if (fs && item?.path) {
    await fs.Filesystem.deleteFile({ path: item.path, directory: item.directory || fs.Directory.Documents }).catch(() => {});
  }
  await deleteDownload(id);
}

export async function downloadSong(song, onProgress) {
  if (!song?.id) throw new Error("Missing song");
  onProgress?.(3);
  let meta = { song };
  const directUrl = directSongUrl(song);
  let downloadUrl = directUrl
    ? `/api/download/proxy?url=${encodeURIComponent(directUrl)}&songId=${encodeURIComponent(song.id)}`
    : "";

  if (!downloadUrl) {
    const metaRes = await fetch(`${API_URL}/api/download/${encodeURIComponent(song.id)}`, {
      headers: authHeaders(),
    });
    meta = await metaRes.json().catch(() => ({}));
    if (!metaRes.ok) throw new Error(meta.error || "Download unavailable");
    downloadUrl = meta.downloadUrl;
  }

  if (!downloadUrl) throw new Error("No downloadable URL is available for this song");

  const absoluteUrl = downloadUrl.startsWith("http") ? downloadUrl : `${API_URL}${downloadUrl}`;
  const fs = await loadCapacitorFilesystem();
  const resolvedSong = meta.song || song;
  const guessedName = songFileName(resolvedSong, directUrl || absoluteUrl);

  if (fs) {
    const directory = fs.Directory.ExternalStorage || fs.Directory.Documents;
    const path = `Download/${guessedName}`;
    await fs.Filesystem.requestPermissions?.().catch(() => null);
    onProgress?.(8);
    try {
      const result = await nativeDownload(fs, { absoluteUrl, path, directory, headers: authHeaders(), onProgress });
      onProgress?.(96);
      const uri = await fs.Filesystem.getUri({ path, directory }).catch(() => ({ uri: result?.path || result?.uri || path }));
      const item = { ...resolvedSong, id: song.id, size: Number(result?.bytesWritten) || 0, downloadedAt: Date.now(), fileName: guessedName, path, directory, offlineUrl: uri.uri, storage: "capacitor" };
      await putDownload(item);
      await notifyNativeDownload(fs, "Download complete", guessedName);
      await fs.FileOpener?.open?.({ filePath: uri.uri, contentType: "audio/*" }).catch(() => null);
      onProgress?.(100);
      return item;
    } catch (err) {
      throw new Error(err?.message || "Network unavailable. Download failed.");
    }
  }

  const res = await fetchWithTimeout(absoluteUrl, { headers: authHeaders() });
  if (!res.ok) throw new Error(res.status >= 500 ? "Download server unavailable" : "Download failed");

  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body?.getReader();
  const chunks = [];
  let loaded = 0;

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      if (total) onProgress?.(Math.min(98, Math.round((loaded / total) * 100)));
    }
  } else {
    chunks.push(new Uint8Array(await res.arrayBuffer()));
    loaded = chunks[0].length;
  }

  const contentType = res.headers.get("content-type") || "audio/mpeg";
  const blob = new Blob(chunks, { type: contentType });
  const fileName = songFileName(resolvedSong, directUrl || absoluteUrl, contentType);
  onProgress?.(99);
  triggerBrowserDownload(blob, fileName);
  const item = { ...resolvedSong, id: song.id, size: blob.size, downloadedAt: Date.now(), fileName, blob, offlineUrl: URL.createObjectURL(blob), storage: "indexeddb" };

  await putDownload(item);
  onProgress?.(100);
  return item;
}
