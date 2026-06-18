import React, { useEffect, useRef, useState } from "react";
import { useSocket } from "../context/SocketContext";

function time(value) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Chat({ deviceName }) {
  const { emit, messages, typingDevices } = useSocket();
  const [text, setText] = useState("");
  const [reactions, setReactions] = useState({});
  const bottomRef = useRef(null);
  const typingRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    const ids = messages.map((message) => message._id).filter(Boolean);
    if (ids.length) emit("chat_seen", { messageIds: ids });
  }, [emit, messages]);

  const send = (e) => {
    e.preventDefault();
    const message = text.trim();
    if (!message) return;
    emit("chat_message", { message });
    emit("typing", { isTyping: false });
    setText("");
  };

  const handleChange = (e) => {
    setText(e.target.value);
    emit("typing", { isTyping: true });
    clearTimeout(typingRef.current);
    typingRef.current = setTimeout(() => emit("typing", { isTyping: false }), 900);
  };

  return (
    <div className="chat-panel">
      <div className="panel-header">
        <span className="panel-title">Chat</span>
        <span className="panel-badge">{messages.length}</span>
      </div>

      <div className="chat-list">
        {messages.length === 0 && <div className="chat-empty">Messages from your devices appear here.</div>}
        {messages.map((m) => {
          const mine = m.deviceName === deviceName;
          const key = m._id || `${m.timestamp}-${m.message}`;
          return (
            <div key={key} className={`chat-message ${mine ? "mine" : ""}`}>
              <div className="chat-meta">
                <span>{m.deviceName}</span>
                <time>{time(m.timestamp)}</time>
              </div>
              <div className="chat-bubble">{m.message}</div>
              {mine && (
                <div className="seen-line">
                  {(m.seenBy || []).filter((item) => item.deviceName !== deviceName).length ? "Seen" : "Sent"}
                </div>
              )}
              <div className="reaction-row">
                {["Like", "Fire", "Love"].map((label) => (
                  <button key={label} onClick={() => setReactions((prev) => ({ ...prev, [key]: prev[key] === label ? "" : label }))} className={reactions[key] === label ? "active" : ""}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="typing-line">
        {typingDevices.length ? `${typingDevices.join(", ")} typing...` : ""}
      </div>

      <form className="chat-form" onSubmit={send}>
        <button type="button" className="emoji-btn" onClick={() => setText((value) => `${value}:)`)}>
          Emoji
        </button>
        <input value={text} onChange={handleChange} placeholder="Message your devices" maxLength={1000} />
        <button disabled={!text.trim()}>Send</button>
      </form>
    </div>
  );
}
