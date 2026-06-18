import React, { useEffect, useRef, useState } from "react";
import { useSocket } from "../context/SocketContext";
import { useCall } from "../context/CallContext";

const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 700 * 1024;

function time(value) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fileToAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      dataUrl: reader.result,
    });
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function AttachmentCard({ item }) {
  const isImage = item.type?.startsWith("image/");
  return (
    <a className={`attachment-card ${isImage ? "image" : ""}`} href={item.dataUrl} download={item.name} target="_blank" rel="noreferrer">
      {isImage ? (
        <img src={item.dataUrl} alt={item.name} />
      ) : (
        <span className="attachment-icon">{item.type?.includes("pdf") ? "PDF" : "DOC"}</span>
      )}
      <span>{item.name}</span>
      <small>{Math.ceil((item.size || 0) / 1024)} KB</small>
    </a>
  );
}

export default function Chat({ deviceName }) {
  const { emit, messages, typingDevices, state, deviceId } = useSocket();
  const call = useCall();
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);
  const typingRef = useRef(null);
  const fileRef = useRef(null);
  const peerDevice = (state?.devices || []).find((device) => device.deviceId !== deviceId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    const ids = messages.map((message) => message._id).filter(Boolean);
    if (ids.length) emit("chat_seen", { messageIds: ids });
  }, [emit, messages]);

  const send = (e) => {
    e.preventDefault();
    const message = text.trim();
    if (!message && !attachments.length) return;
    emit("chat_message", { message, attachments });
    emit("typing", { isTyping: false });
    setText("");
    setAttachments([]);
    setError("");
  };

  const handleChange = (e) => {
    setText(e.target.value);
    emit("typing", { isTyping: true });
    clearTimeout(typingRef.current);
    typingRef.current = setTimeout(() => emit("typing", { isTyping: false }), 900);
  };

  const addFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setError("");
    const allowed = files.filter((file) => {
      const okType = file.type.startsWith("image/") || file.type === "application/pdf" || file.type.includes("document") || /\.(pdf|doc|docx|txt)$/i.test(file.name);
      const okSize = file.size <= MAX_ATTACHMENT_BYTES;
      if (!okType) setError("Only images, PDFs, and documents are supported.");
      if (!okSize) setError("Each attachment must be under 700 KB.");
      return okType && okSize;
    }).slice(0, MAX_ATTACHMENTS - attachments.length);
    const next = await Promise.all(allowed.map(fileToAttachment)).catch((err) => {
      setError(err.message);
      return [];
    });
    setAttachments((prev) => [...prev, ...next].slice(0, MAX_ATTACHMENTS));
  };

  return (
    <div className="chat-panel">
      <div className="panel-header">
        <div>
          <span className="panel-title">Chat</span>
          <div className="panel-badge">{messages.length} messages</div>
        </div>
        <div className="panel-actions">
          {peerDevice && (
            <>
              <button className="ghost-action" type="button" onClick={() => call?.startVoiceCall?.(peerDevice)}>Voice</button>
              <button className="ghost-action" type="button" onClick={() => call?.startVideoCall?.(peerDevice)}>Video</button>
            </>
          )}
          <button className="ghost-action" type="button" onClick={() => fileRef.current?.click()}>Attach</button>
        </div>
      </div>

      <div className="chat-list">
        {messages.length === 0 && <div className="chat-empty">Messages from your devices appear here.</div>}
        {messages.map((m) => {
          const mine = m.deviceName === deviceName;
          const key = m._id || `${m.timestamp}-${m.message}`;
          const seenBy = (m.seenBy || []).filter((item) => item.deviceName !== deviceName);
          return (
            <div key={key} className={`chat-message ${mine ? "mine" : ""}`}>
              <div className="chat-meta">
                <span>{m.deviceName}</span>
                <time>{time(m.timestamp)}</time>
              </div>
              <div className="chat-bubble">
                {m.message && <p>{m.message}</p>}
                {!!m.attachments?.length && (
                  <div className="attachment-grid">
                    {m.attachments.map((item, idx) => <AttachmentCard key={`${item.name}-${idx}`} item={item} />)}
                  </div>
                )}
              </div>
              {mine && (
                <div className="seen-line">
                  {seenBy.length ? `Seen by ${seenBy.map((item) => item.deviceName).join(", ")}` : "Sent"}
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="typing-line">
        {typingDevices.length ? `${typingDevices.join(", ")} typing...` : error}
      </div>

      {!!attachments.length && (
        <div className="attachment-preview-row">
          {attachments.map((item, idx) => (
            <div key={`${item.name}-${idx}`} className="attachment-preview">
              <AttachmentCard item={item} />
              <button type="button" onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}>Remove</button>
            </div>
          ))}
        </div>
      )}

      <form className="chat-form" onSubmit={send}>
        <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx,.txt,application/pdf" multiple onChange={addFiles} hidden />
        <button type="button" className="composer-icon" onClick={() => fileRef.current?.click()} title="Attach file">+</button>
        <input value={text} onChange={handleChange} placeholder="Message your devices" maxLength={1000} />
        <button className="send-btn" disabled={!text.trim() && !attachments.length}>Send</button>
      </form>
    </div>
  );
}
