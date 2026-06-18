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
    if (!Capacitor?.isNativePlatform?.()) return null;
    return {
      Filesystem: registerPlugin("Filesystem"),
      Directory: { Data: "DATA" },
    };
  } catch (err) {
    return null;
  }
}

function authHeaders() {
  const token = getStoredAuth()?.token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
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
    await fs.Filesystem.deleteFile({ path: item.path, directory: fs.Directory.Data }).catch(() => {});
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
  const res = await fetch(absoluteUrl, { headers: authHeaders() });
  if (!res.ok) throw new Error("Download failed");

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

  const blob = new Blob(chunks, { type: res.headers.get("content-type") || "audio/mpeg" });
  const fs = await loadCapacitorFilesystem();
  const resolvedSong = meta.song || song;
  const cleanTitle = String(resolvedSong.title || song.title || "song").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 48);
  const fileName = `${cleanTitle || "song"}-${song.id}.mp3`;
  let item;

  if (fs) {
    const path = `downloads/${fileName}`;
    await fs.Filesystem.writeFile({
      path,
      data: await blobToBase64(blob),
      directory: fs.Directory.Data,
      recursive: true,
    });
    const uri = await fs.Filesystem.getUri({ path, directory: fs.Directory.Data });
    item = { ...resolvedSong, id: song.id, size: blob.size, downloadedAt: Date.now(), path, offlineUrl: uri.uri, storage: "capacitor" };
  } else {
    item = { ...resolvedSong, id: song.id, size: blob.size, downloadedAt: Date.now(), blob, offlineUrl: URL.createObjectURL(blob), storage: "indexeddb" };
  }

  await putDownload(item);
  onProgress?.(100);
  return item;
}
