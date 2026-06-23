import React, { useEffect, useMemo, useRef, useState } from "react";
import { API_URL } from "../api";
import { useSocket } from "../context/SocketContext";
import { deleteGeneratedSong, getSongGenerationJob, listGeneratedSongs, startSongGeneration } from "../services/musicStudio";

const GENRES = ["Rap", "Hip Hop", "Trap", "Pop", "Rock", "Bollywood", "LoFi", "EDM", "Classical", "Punjabi", "Haryanvi"];
const MOODS = ["Happy", "Sad", "Romantic", "Motivational", "Emotional", "Party", "Chill", "Dark"];
const VOICES = ["Male", "Female", "Deep Male", "Soft Female"];
const LANGUAGES = ["Hindi", "Hinglish", "English", "Punjabi", "Urdu"];
const STEPS = ["Generating Lyrics", "Generating Music", "Generating Voice", "Mixing Audio", "Completed"];

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="ai-select-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
  );
}

function absoluteUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_URL}${url}`;
}

function downloadText(filename, value) {
  const blob = new Blob([value || ""], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function normalizeSong(item) {
  if (!item || typeof item !== "object") return null;
  return {
    id: String(item.id || item._id || ""),
    title: String(item.title || "Untitled Song"),
    lyrics: String(item.lyrics || ""),
    genre: String(item.genre || ""),
    mood: String(item.mood || ""),
    language: String(item.language || ""),
    voice: String(item.voice || ""),
    status: String(item.status || ""),
    coverImage: String(item.coverImage || ""),
    finalSongUrl: String(item.finalSongUrl || ""),
    audioUrl: String(item.audioUrl || item.finalSongUrl || ""),
    createdAt: item.createdAt || "",
  };
}

function normalizeSongs(items) {
  return (Array.isArray(items) ? items : []).map(normalizeSong).filter(Boolean);
}

export default function GenerateMusic({ onOpenLibrary }) {
  const { on, off } = useSocket();
  const [prompt, setPrompt] = useState("");
  const [genre, setGenre] = useState("Bollywood");
  const [mood, setMood] = useState("Romantic");
  const [language, setLanguage] = useState("Hinglish");
  const [voice, setVoice] = useState("Male");
  const [job, setJob] = useState(null);
  const [song, setSong] = useState(null);
  const [songs, setSongs] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pollRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => () => window.clearInterval(pollRef.current), []);

  useEffect(() => {
    listGeneratedSongs()
      .then((data) => setSongs(normalizeSongs(data?.songs)))
      .catch((err) => setError(err.message || "Unable to load generated songs"));
  }, []);

  useEffect(() => {
    const handleProgress = (payload) => {
      setJob(payload);
      if (payload?.song) setSong(normalizeSong(payload.song));
    };
    const handleCompleted = (payload) => {
      setJob(payload);
      const nextSong = normalizeSong(payload?.song);
      if (nextSong) {
        setSong(nextSong);
        setSongs((prev) => [nextSong, ...prev.filter((item) => item.id !== nextSong.id)]);
      }
      setLoading(false);
    };
    const handleFailed = (payload) => {
      setJob(payload);
      if (payload?.song) setSong(normalizeSong(payload.song));
      setError(payload.error || "Generation failed");
      setLoading(false);
    };
    on("song_generation_started", handleProgress);
    on("song_generation_progress", handleProgress);
    on("song_generation_completed", handleCompleted);
    on("song_generation_failed", handleFailed);
    return () => {
      off("song_generation_started", handleProgress);
      off("song_generation_progress", handleProgress);
      off("song_generation_completed", handleCompleted);
      off("song_generation_failed", handleFailed);
    };
  }, [off, on]);

  const stepIndex = useMemo(() => {
    if (!job?.step) return 0;
    return Math.max(0, STEPS.findIndex((step) => step === job.step));
  }, [job?.step]);

  const startPolling = (jobId) => {
    window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      try {
        const next = await getSongGenerationJob(jobId);
        setJob(next);
        if (next?.song) setSong(normalizeSong(next.song));
        if (next.status === "completed" || next.status === "failed") {
          window.clearInterval(pollRef.current);
          setLoading(false);
          if (next.status === "failed") setError(next.error || "Generation failed");
        }
      } catch (err) {
        window.clearInterval(pollRef.current);
        setLoading(false);
        setError(err.message || "Unable to load generation progress");
      }
    }, 1500);
  };

  const generate = async (event) => {
    event.preventDefault();
    if (prompt.trim().length < 2 || loading) return;
    setLoading(true);
    setError("");
    setSong(null);
    setJob({ step: "Generating Lyrics", progress: 5, status: "queued" });
    try {
      const data = await startSongGeneration({ prompt, genre, mood, language, voice });
      setJob(data);
      startPolling(data.jobId);
    } catch (err) {
      setLoading(false);
      setError(err.message || "Unable to start AI generation");
    }
  };

  const finalUrl = absoluteUrl(song?.finalSongUrl);

  const playSong = (item) => {
    const nextSong = normalizeSong(item);
    if (!nextSong) return;
    setSong(nextSong);
    setActiveId(nextSong.id);
    window.setTimeout(() => {
      audioRef.current?.play().then(() => setPlaying(true)).catch((err) => setError(err.message));
    }, 30);
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !song?.finalSongUrl) return;
    if (audio.paused) audio.play().then(() => setPlaying(true)).catch((err) => setError(err.message));
    else {
      audio.pause();
      setPlaying(false);
    }
  };

  const removeSong = async (id) => {
    await deleteGeneratedSong(id);
    setSongs((prev) => prev.filter((item) => item.id !== id));
    if (song?.id === id) setSong(null);
  };

  return (
    <div className="ai-studio-page">
      <section className="ai-hero">
        <div>
          <span className="eyebrow">AI Music</span>
          <h1>Generate a complete song from a prompt.</h1>
          <p>Gemini writes the song, MusicGen creates the instrumental, OpenVoice creates vocals, and FFmpeg mixes the final MP3.</p>
        </div>
        <button className="ghost-action" type="button" onClick={onOpenLibrary}>AI Library</button>
      </section>

      <form className="ai-studio-grid" onSubmit={generate}>
        <section className="ai-card ai-prompt-card">
          <div className="ai-card-title">Prompt</div>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe your song idea..." maxLength={2000} />
        </section>

        <section className="ai-card ai-select-grid">
          <SelectField label="Genre" value={genre} onChange={setGenre} options={GENRES} />
          <SelectField label="Mood" value={mood} onChange={setMood} options={MOODS} />
          <SelectField label="Language" value={language} onChange={setLanguage} options={LANGUAGES} />
          <SelectField label="Voice" value={voice} onChange={setVoice} options={VOICES} />
        </section>

        <section className="ai-card ai-generate-card">
          <button className="ai-generate-btn" disabled={loading || prompt.trim().length < 2}>
            {loading ? job?.step || "Generating" : "Generate Song"}
          </button>
          <div className="ai-progress-track"><div style={{ width: `${job?.progress || 0}%` }} /></div>
          <div className="ai-progress-steps">
            {STEPS.map((step, index) => (
              <span key={step} className={index <= stepIndex || job?.status === "completed" ? "active" : ""}>{step}</span>
            ))}
          </div>
          {error && <div className="form-error">{error}</div>}
          {error && error.toLowerCase().includes("worker unavailable") && (
            <div className="ai-worker-note">Configure MusicGen/OpenVoice workers to complete audio generation.</div>
          )}
        </section>
      </form>

      {song && (
        <section className="ai-detail-hero">
          <div className="ai-cover large">
            {song.coverImage ? <img src={song.coverImage} alt={song.title} /> : <span>AI</span>}
          </div>
          <div className="ai-detail-copy">
            <span className="eyebrow">{song.status}</span>
            <h1>{song.title}</h1>
            <p>{song.genre} · {song.mood} · {song.language} · {song.voice}</p>
            {finalUrl ? <audio ref={audioRef} className="ai-audio" controls src={finalUrl} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} /> : <div className="ai-worker-note">Audio is not ready yet.</div>}
            <div className="hero-actions">
              {finalUrl && <button className="primary-action" type="button" onClick={togglePlay}>{playing ? "Pause" : "Play"}</button>}
              {finalUrl && <a className="primary-action" href={finalUrl} download>Download MP3</a>}
              <button className="ghost-action" type="button" onClick={() => downloadText(`${song.title || "lyrics"}.txt`, song.lyrics)}>Download Lyrics</button>
            </div>
          </div>
        </section>
      )}

      {song?.lyrics && (
        <section className="ai-card">
          <div className="ai-card-title">Lyrics Preview</div>
          <pre className="ai-lyrics">{song.lyrics}</pre>
        </section>
      )}

      <section className="ai-card">
        <div className="ai-card-title">My Songs</div>
        {!songs.length && <div className="queue-empty">Generated songs will appear here.</div>}
        <div className="ai-song-list">
          {songs.map((item) => {
            const url = absoluteUrl(item.finalSongUrl);
            return (
              <div key={item.id} className={`ai-song-row ${activeId === item.id ? "active" : ""}`}>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.genre} · {item.mood} · {item.status}</span>
                </div>
                <div className="hero-actions">
                  <button className="ghost-action" type="button" onClick={() => playSong(item)} disabled={!item.finalSongUrl}>Play</button>
                  {url && <a className="ghost-action" href={url} download>Download</a>}
                  <button className="ghost-action danger" type="button" onClick={() => removeSong(item.id)}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
