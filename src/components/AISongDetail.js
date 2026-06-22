import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";

function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function pdfEscape(text) {
  return String(text || "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function makeSimplePdf(title, body) {
  const lines = [`SyncWave AI - ${title}`, "", ...String(body || "").split(/\r?\n/)].slice(0, 90);
  const content = lines.map((line, idx) => `BT /F1 11 Tf 48 ${780 - idx * 14} Td (${pdfEscape(line).slice(0, 92)}) Tj ET`).join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj) => {
    offsets.push(pdf.length);
    pdf += `${obj}\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

function PromptBlock({ title, value }) {
  return (
    <section className="ai-card">
      <div className="ai-card-title">{title}</div>
      <pre className="ai-prompt-output">{value || "Pending"}</pre>
    </section>
  );
}

export default function AISongDetail({ songId, onBack }) {
  const [song, setSong] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiFetch(`/api/ai/songs/${songId}`)
      .then((data) => {
        if (alive) setSong(data.song);
      })
      .catch((err) => {
        if (alive) setError(err.message || "Unable to load AI song");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [songId]);

  const projectJson = useMemo(() => JSON.stringify(song || {}, null, 2), [song]);

  const copy = async (label, value) => {
    await navigator.clipboard?.writeText(value || "");
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1400);
  };

  if (loading) return <div className="queue-empty">Loading AI song...</div>;
  if (error) return <div className="form-error page-pad">{error}</div>;
  if (!song) return <div className="queue-empty">AI song not found.</div>;

  return (
    <div className="ai-detail-page">
      <section className="ai-detail-hero">
        <div className="ai-cover large">
          {song.coverImage ? <img src={song.coverImage} alt={song.title} /> : <span>AI</span>}
        </div>
        <div className="ai-detail-copy">
          <span className="eyebrow">AI Song Project</span>
          <h1>{song.title}</h1>
          <p>{song.genre} · {song.mood} · {song.voice} · {song.language} · {song.bpm || "Free"} BPM</p>
          <div className="hero-actions">
            <button className="primary-action" onClick={() => copy("lyrics", song.lyrics)}>Copy Lyrics</button>
            <button className="ghost-action" onClick={() => copy("prompt", song.musicPrompt)}>Copy Prompt</button>
            <button className="ghost-action" onClick={onBack}>AI Library</button>
          </div>
          {copied && <div className="form-success">Copied {copied}</div>}
        </div>
      </section>

      {song.audioUrl ? (
        <audio className="ai-audio" controls src={song.audioUrl} />
      ) : (
        <div className="ai-worker-note">MusicGen audio worker is not enabled yet. Lyrics and production prompts are ready.</div>
      )}

      <section className="ai-card">
        <div className="ai-card-title">Lyrics</div>
        <pre className="ai-lyrics">{song.lyrics}</pre>
      </section>

      <div className="ai-detail-grid">
        <PromptBlock title="Music Prompt" value={song.musicPrompt} />
        <PromptBlock title="Beat Prompt" value={song.beatPrompt} />
        <PromptBlock title="Instrument Prompt" value={song.instrumentPrompt} />
        <PromptBlock title="Cover Prompt" value={song.coverPrompt} />
      </div>

      <section className="ai-card ai-downloads">
        <div className="ai-card-title">Export</div>
        <button className="ghost-action" onClick={() => downloadBlob(`${song.title || "lyrics"}.txt`, song.lyrics, "text/plain")}>Download Lyrics TXT</button>
        <button className="ghost-action" onClick={() => downloadBlob(`${song.title || "lyrics"}.pdf`, makeSimplePdf(song.title, song.lyrics), "application/pdf")}>Download Lyrics PDF</button>
        <button className="ghost-action" onClick={() => downloadBlob(`${song.title || "project"}.json`, projectJson, "application/json")}>Download Project JSON</button>
      </section>
    </div>
  );
}
