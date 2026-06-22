import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";

const GENRES = ["Rap", "Hip Hop", "Trap", "Pop", "Rock", "Bollywood", "LoFi", "EDM", "Classical", "Punjabi", "Haryanvi"];
const MOODS = ["Happy", "Sad", "Romantic", "Motivational", "Emotional", "Party", "Chill", "Dark"];
const VOICES = ["Male", "Female", "Deep Male", "Soft Female", "Rap Voice"];
const LANGUAGES = ["Hindi", "Hinglish", "English", "Punjabi", "Urdu"];
const EXAMPLES = ["Romantic Bollywood Song", "Punjabi Party Anthem", "Sad Breakup Song", "LoFi Study Music"];
const STEPS = ["Generating Lyrics", "Generating Beat Prompt", "Generating Music Prompt", "Generating Cover Prompt", "Completed"];

function PillGroup({ label, options, value, onChange }) {
  return (
    <section className="ai-card">
      <div className="ai-card-title">{label}</div>
      <div className="ai-pill-grid">
        {options.map((option) => (
          <button key={option} type="button" className={`ai-pill ${value === option ? "active" : ""}`} onClick={() => onChange(option)}>
            {option}
          </button>
        ))}
      </div>
    </section>
  );
}

export default function GenerateMusic({ onOpenSong, onOpenLibrary }) {
  const [prompt, setPrompt] = useState("");
  const [genre, setGenre] = useState("Bollywood");
  const [mood, setMood] = useState("Romantic");
  const [voice, setVoice] = useState("Male");
  const [language, setLanguage] = useState("Hinglish");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [bpm, setBpm] = useState(96);
  const [tempo, setTempo] = useState("Medium");
  const [energy, setEnergy] = useState("Medium");
  const [instruments, setInstruments] = useState("");
  const [loading, setLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);

  useEffect(() => {
    if (!loading) return undefined;
    const timer = window.setInterval(() => {
      setStepIndex((idx) => Math.min(idx + 1, STEPS.length - 2));
    }, 900);
    return () => window.clearInterval(timer);
  }, [loading]);

  const canGenerate = prompt.trim().length >= 2 && !loading;
  const progress = useMemo(() => loading ? Math.max(16, ((stepIndex + 1) / STEPS.length) * 100) : created ? 100 : 0, [created, loading, stepIndex]);

  const generate = async (event) => {
    event.preventDefault();
    if (!canGenerate) return;
    setLoading(true);
    setError("");
    setCreated(null);
    setStepIndex(0);
    try {
      console.log("[AI Debug] Frontend Form Submit", { prompt, genre, mood, language, voice, bpm, tempo, energy, instruments });
      const data = await apiFetch("/api/ai/generate", {
        method: "POST",
        timeoutMs: 45000,
        body: JSON.stringify({ prompt, genre, mood, voice, language, bpm, tempo, energy, instruments }),
      });
      setStepIndex(STEPS.length - 1);
      setCreated(data.song);
    } catch (err) {
      setError(err.message || "Unable to generate song");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ai-studio-page">
      <section className="ai-hero">
        <div>
          <span className="eyebrow">AI Music Studio</span>
          <h1>Generate lyrics, prompts, and cover concepts inside SyncWave.</h1>
          <p>Describe a vibe in one word, a sentence, or a full paragraph. SyncWave stores the generated song project in your AI library.</p>
        </div>
        <button className="ghost-action" type="button" onClick={onOpenLibrary}>AI Library</button>
      </section>

      <form className="ai-studio-grid" onSubmit={generate}>
        <section className="ai-card ai-prompt-card">
          <div className="ai-card-title">Prompt</div>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe your song idea..."
            maxLength={2000}
          />
          <div className="ai-example-row">
            {EXAMPLES.map((example) => (
              <button key={example} type="button" onClick={() => setPrompt(example)}>{example}</button>
            ))}
          </div>
        </section>

        <PillGroup label="Genre" options={GENRES} value={genre} onChange={setGenre} />
        <PillGroup label="Mood" options={MOODS} value={mood} onChange={setMood} />
        <PillGroup label="Voice Type" options={VOICES} value={voice} onChange={setVoice} />
        <PillGroup label="Language" options={LANGUAGES} value={language} onChange={setLanguage} />

        <section className="ai-card ai-advanced-card">
          <button className="ai-collapse" type="button" onClick={() => setAdvancedOpen((value) => !value)}>
            <span>Advanced Settings</span>
            <b>{advancedOpen ? "Close" : "Open"}</b>
          </button>
          {advancedOpen && (
            <div className="ai-advanced-fields">
              <label>BPM<input type="number" min="40" max="220" value={bpm} onChange={(event) => setBpm(Number(event.target.value))} /></label>
              <label>Tempo<input value={tempo} onChange={(event) => setTempo(event.target.value)} placeholder="Slow, Medium, Fast" /></label>
              <label>Energy<input value={energy} onChange={(event) => setEnergy(event.target.value)} placeholder="Low, Medium, High" /></label>
              <label>Instruments<input value={instruments} onChange={(event) => setInstruments(event.target.value)} placeholder="808 drums, dhol, synth pads..." /></label>
            </div>
          )}
        </section>

        <section className="ai-card ai-generate-card">
          <button className="ai-generate-btn" disabled={!canGenerate}>
            {loading ? STEPS[stepIndex] : "Generate Song"}
          </button>
          <div className="ai-progress-track"><div style={{ width: `${progress}%` }} /></div>
          <div className="ai-progress-steps">
            {STEPS.map((step, index) => (
              <span key={step} className={index <= stepIndex || created ? "active" : ""}>{step}</span>
            ))}
          </div>
          {error && <div className="form-error">{error}</div>}
          {created && (
            <div className="ai-created">
              <strong>{created.title}</strong>
              <span>{created.status === "metadata_ready" ? "Lyrics and prompts are ready. Music worker is disabled." : created.status}</span>
              <button type="button" className="primary-action" onClick={() => onOpenSong(created.id)}>Open Project</button>
            </div>
          )}
        </section>
      </form>
    </div>
  );
}
