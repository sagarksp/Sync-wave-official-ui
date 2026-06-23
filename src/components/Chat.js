import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_URL, apiFetch } from "../api";
import { useSocket } from "../context/SocketContext";
import { useCall } from "../context/CallContext";

const MAX_ATTACHMENTS = 4;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;
const DOC_EXT = /\.(pdf|docx?|txt)$/i;
const IMAGE_MAX = 10 * 1024 * 1024;
const DOC_MAX = 25 * 1024 * 1024;
const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎵"];

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch (err) {
    return "";
  }
}

function getMessageText(message) {
  return safeText(message?.text || message?.message || "");
}

function getSenderName(message) {
  return safeText(message?.senderName || message?.deviceName || "Unknown");
}

function getMessageKey(item, index) {
  return item?._id?.toString?.() || item?.id?.toString?.() || index.toString();
}

function fileLimit(file) {
  const type = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();
  const image = type.startsWith("image/") || IMAGE_EXT.test(name);
  const doc = type === "application/pdf" ||
    type === "text/plain" ||
    type.includes("word") ||
    type.includes("document") ||
    DOC_EXT.test(name);
  if (image) return { ok: file.size <= IMAGE_MAX, kind: "image", max: IMAGE_MAX };
  if (doc) return { ok: file.size <= DOC_MAX, kind: "document", max: DOC_MAX };
  return { ok: false, kind: "", max: 0 };
}

function sizeLabel(bytes) {
  if (!bytes) return "0 KB";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function deriveChatKey(auth, deviceName) {
  const account = auth?.user?.id || auth?.user?.username || "syncwave";
  const seed = `${account}:${auth?.user?.createdAt || ""}:chat-v1`;
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(seed), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: new TextEncoder().encode(`syncwave-chat:${account}`), iterations: 120000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptBytes(key, buffer) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, buffer);
  return { iv: arrayBufferToBase64(iv), data: arrayBufferToBase64(encrypted) };
}

async function decryptBytes(key, payload) {
  if (!payload?.iv || !payload?.data) return new ArrayBuffer(0);
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(base64ToArrayBuffer(payload.iv)) },
    key,
    base64ToArrayBuffer(payload.data)
  );
}

async function encryptString(key, value) {
  return encryptBytes(key, new TextEncoder().encode(String(value || "")));
}

async function decryptString(key, payload) {
  const buffer = await decryptBytes(key, payload);
  return new TextDecoder().decode(buffer);
}

async function encryptedFileDataUrl(key, file) {
  const encrypted = await encryptBytes(key, await file.arrayBuffer());
  return {
    iv: encrypted.iv,
    encryptedDataUrl: `data:application/octet-stream;base64,${encrypted.data}`,
  };
}

function plainPreview(message) {
  return safeText(message?.decryptedText || message?.notificationPreview || getMessageText(message) || "Attachment").slice(0, 120);
}

function AttachmentCard({ item, chatKey }) {
  const safeItem = item || {};
  const [view, setView] = useState({
    name: safeText(safeItem?.name, "Attachment"),
    type: safeText(safeItem?.type),
    url: safeText(safeItem?.dataUrl),
    loading: Boolean(safeItem?.encrypted),
  });

  useEffect(() => {
    let alive = true;
    let objectUrl = "";
    async function loadEncrypted() {
      if (!safeItem?.encrypted || !chatKey) return;
      try {
        const [name, type] = await Promise.all([
          decryptString(chatKey, safeItem?.encryptedName).catch(() => "Attachment"),
          decryptString(chatKey, safeItem?.encryptedType).catch(() => "application/octet-stream"),
        ]);
        const res = await fetch(`${API_URL}${safeText(safeItem?.fileUrl)}`);
        const encrypted = await res.arrayBuffer();
        const decrypted = await decryptBytes(chatKey, { iv: safeItem?.iv, data: arrayBufferToBase64(encrypted) });
        objectUrl = URL.createObjectURL(new Blob([decrypted], { type }));
        console.log("ATTACHMENT_RECEIVED", { name, type, size: safeItem?.size });
        if (alive) setView({ name, type, url: objectUrl, loading: false });
      } catch (err) {
        console.warn("ATTACHMENT_DECRYPT_FAILED", err.message);
        if (alive) setView((prev) => ({ ...prev, loading: false }));
      }
    }
    loadEncrypted();
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [chatKey, safeItem]);

  const isImage = view.type?.startsWith("image/");
  return (
    <a className={`attachment-card ${isImage ? "image" : ""}`} href={view.url || "#"} download={view.name} target="_blank" rel="noreferrer">
      {view.loading ? (
        <span className="attachment-icon">...</span>
      ) : isImage ? (
        <img src={view.url} alt={view.name} />
      ) : (
        <span className="attachment-icon">{view.type?.includes("pdf") ? "PDF" : "DOC"}</span>
      )}
      <span>{view.name}</span>
      <small>{sizeLabel(safeItem?.size)}</small>
    </a>
  );
}

function MessageText({ message, chatKey, onDecrypted }) {
  const encrypted = Boolean(message?.encrypted);
  const [text, setText] = useState(encrypted ? "" : getMessageText(message));
  const [reply, setReply] = useState(null);

  useEffect(() => {
    let alive = true;
    async function decrypt() {
      if (!encrypted || !chatKey) return;
      try {
        const decrypted = await decryptString(chatKey, message?.encryptedMessage);
        const replyText = message?.replyTo?.messageId ? {
          messageId: message?.replyTo?.messageId,
          sender: await decryptString(chatKey, message?.replyTo?.sender).catch(() => ""),
          text: await decryptString(chatKey, message?.replyTo?.text).catch(() => ""),
        } : null;
        console.log("MESSAGE_DECRYPTED", { messageId: message?._id?.toString?.() || "" });
        if (alive) {
          setText(decrypted);
          setReply(replyText);
          onDecrypted(message?._id, decrypted);
        }
      } catch (err) {
        console.warn("MESSAGE_DECRYPT_FAILED", { messageId: message?._id?.toString?.() || "", error: err.message });
        if (alive) setText("[Unable to decrypt message]");
      }
    }
    decrypt();
    return () => { alive = false; };
  }, [
    chatKey,
    message?._id,
    encrypted,
    message?.encryptedMessage?.iv,
    message?.encryptedMessage?.data,
    message?.replyTo?.messageId,
    message?.replyTo?.sender?.iv,
    message?.replyTo?.sender?.data,
    message?.replyTo?.text?.iv,
    message?.replyTo?.text?.data,
    message?.message,
    message?.text,
    onDecrypted,
  ]);

  const legacyReply = !encrypted && message?.replyTo?.text;
  return (
    <>
      {(reply || legacyReply) && (
        <div className="reply-preview">
          <strong>↩ Replying to: {(reply?.sender || message?.replyTo?.sender || "Message")}</strong>
          <span>{reply?.text || message?.replyTo?.text || ""}</span>
        </div>
      )}
      {text && <p>{text}</p>}
    </>
  );
}

export default function Chat({ deviceName, auth }) {
  const { emit, messages, typingDevices, state, deviceId } = useSocket();
  const call = useCall();
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [error, setError] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [chatKey, setChatKey] = useState(null);
  const [sending, setSending] = useState(false);
  const [decryptedText, setDecryptedText] = useState({});
  const bottomRef = useRef(null);
  const typingRef = useRef(null);
  const fileRef = useRef(null);
  const safeMessages = useMemo(() => Array.isArray(messages) ? messages.filter(Boolean) : [], [messages]);
  const safeTypingDevices = Array.isArray(typingDevices) ? typingDevices.filter(Boolean) : [];
  const safeDeviceName = safeText(deviceName, "Unknown Device");
  const peerDevice = (state?.devices || []).find((device) => device?.deviceId !== deviceId);

  useEffect(() => {
    if (!window.crypto?.subtle) {
      setError("Encryption unavailable on this device.");
      return;
    }
    deriveChatKey(auth, safeDeviceName)
      .then(setChatKey)
      .catch((err) => setError(`Encryption unavailable: ${err.message}`));
  }, [auth, safeDeviceName]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    const ids = safeMessages.map((message) => message?._id).filter(Boolean);
    if (ids.length) emit("chat_seen", { messageIds: ids });
  }, [emit, safeMessages]);

  const decryptedMessages = useMemo(() => safeMessages.map((message) => ({
    ...message,
    decryptedText: decryptedText[message?._id],
  })), [decryptedText, safeMessages]);

  const rememberDecryptedText = useCallback((id, value) => {
    if (!id) return;
    setDecryptedText((prev) => prev[id] === value ? prev : { ...prev, [id]: value });
  }, []);

  const uploadEncryptedAttachment = async (file) => {
    console.log("ATTACHMENT_SELECTED", { name: file.name, size: file.size, type: file.type });
    const encryptedFile = await encryptedFileDataUrl(chatKey, file);
    const uploaded = await apiFetch("/api/chat/attachments", {
      method: "POST",
      timeoutMs: 90000,
      body: JSON.stringify({
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        encryptedDataUrl: encryptedFile.encryptedDataUrl,
      }),
    });
    console.log("ATTACHMENT_UPLOADED", { name: file.name, fileUrl: uploaded.fileUrl });
    return {
      name: "encrypted",
      type: "application/octet-stream",
      size: file.size,
      encrypted: true,
      iv: encryptedFile.iv,
      fileUrl: uploaded.fileUrl,
      encryptedName: await encryptString(chatKey, file.name),
      encryptedType: await encryptString(chatKey, file.type || "application/octet-stream"),
    };
  };

  const send = async (e) => {
    e.preventDefault();
    console.log("MESSAGE_SEND_SUBMIT", { text, attachments: attachments.length, replyTo });
    const message = text.trim();
    if ((!message && !attachments.length) || !chatKey || sending) return;
    setSending(true);
    setError("");
    try {
      const encryptedMessage = await encryptString(chatKey, message);
      const encryptedAttachments = [];
      for (const item of attachments) encryptedAttachments.push(await uploadEncryptedAttachment(item.file));
      const encryptedReply = replyTo ? {
        messageId: replyTo.messageId,
        sender: await encryptString(chatKey, replyTo.sender),
        text: await encryptString(chatKey, replyTo.text),
      } : undefined;
      emit("chat_message", {
        encrypted: true,
        encryptedMessage,
        notificationPreview: message,
        message: "",
        attachments: encryptedAttachments,
        replyTo: encryptedReply,
      }, (res) => {
        console.log("MESSAGE_SENT", res);
        if (!res?.ok) setError(res?.error || "Message failed");
      });
      emit("typing", { isTyping: false });
      setText("");
      setAttachments([]);
      setReplyTo(null);
    } catch (err) {
      setError(err.message || "Unable to send message");
    } finally {
      setSending(false);
    }
  };

  const handleChange = (e) => {
    setText(e.target.value);
    emit("typing", { isTyping: true });
    clearTimeout(typingRef.current);
    typingRef.current = setTimeout(() => emit("typing", { isTyping: false }), 900);
  };

  const addFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    console.log("FILE_PICKER_CHANGE", files.map((file) => ({ name: file.name, size: file.size, type: file.type })));
    e.target.value = "";
    if (!files.length) return;
    setError("");
    const next = [];
    for (const file of files) {
      const limit = fileLimit(file);
      if (!limit.kind) {
        setError("Only jpg, jpeg, png, webp, gif, pdf, doc, docx, and txt files are supported.");
        continue;
      }
      if (!limit.ok) {
        setError(`${limit.kind === "image" ? "Images" : "Documents"} must be under ${sizeLabel(limit.max)}.`);
        continue;
      }
      next.push({
        file,
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        dataUrl: URL.createObjectURL(file),
      });
    }
    setAttachments((prev) => [...prev, ...next].slice(0, MAX_ATTACHMENTS));
  };

  const createReply = (m) => {
    const value = {
      messageId: m?._id,
      sender: getSenderName(m),
      text: plainPreview(m),
    };
    console.log("REPLY_CREATED", value);
    setReplyTo(value);
  };

  const addReaction = (m, emoji) => {
    emit("chat_reaction", { messageId: m?._id, emoji }, (res) => {
      console.log("REACTION_ADDED", { messageId: m?._id, emoji, res });
      if (!res?.ok) setError(res?.error || "Reaction failed");
    });
  };

  return (
    <div className="chat-panel">
      <div className="panel-header">
        <div>
          <span className="panel-title">Chat</span>
          <div className="panel-badge">{safeMessages.length} messages</div>
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
        {!chatKey && !error && <div className="chat-empty">Preparing secure chat...</div>}
        {decryptedMessages.length === 0 && <div className="chat-empty">Messages from your devices appear here.</div>}
        {decryptedMessages.map((m, index) => {
          const mine = getSenderName(m) === safeDeviceName;
          const key = getMessageKey(m, index);
          const attachmentsList = Array.isArray(m?.attachments) ? m.attachments : [];
          const reactionsList = Array.isArray(m?.reactions) ? m.reactions : [];
          const seenBy = (Array.isArray(m?.seenBy) ? m.seenBy : []).filter((item) => item?.deviceName !== safeDeviceName);
          return (
            <div key={key} className={`chat-message ${mine ? "mine" : ""}`} onDoubleClick={() => createReply(m)} onContextMenu={(event) => { event.preventDefault(); createReply(m); }}>
              <div className="chat-meta">
                <span>{getSenderName(m)}</span>
                <time>{m?.createdAt || m?.timestamp ? formatDate(m?.createdAt || m?.timestamp) : ""}</time>
                <button type="button" onClick={() => createReply(m)}>Reply</button>
              </div>
              <div className="chat-bubble">
                <MessageText message={m} chatKey={chatKey} onDecrypted={rememberDecryptedText} />
                {!!attachmentsList.length && (
                  <div className="attachment-grid">
                    {attachmentsList.map((item, idx) => <AttachmentCard key={`${safeText(item?.name, "attachment")}-${idx}`} item={item} chatKey={chatKey} />)}
                  </div>
                )}
                <div className="reaction-bar">
                  {REACTIONS.map((emoji) => <button key={emoji} type="button" onClick={() => addReaction(m, emoji)}>{emoji}</button>)}
                </div>
              </div>
              {!!reactionsList.length && (
                <div className="reaction-line">
                  {reactionsList.map((item, idx) => <span key={`${item?.deviceId || "device"}-${item?.emoji || "reaction"}-${idx}`}>{item?.emoji || ""}</span>)}
                </div>
              )}
              {mine && (
                <div className="seen-line">
                  {seenBy.length ? `✓✓ Seen by ${seenBy.map((item) => item?.deviceName || "Unknown").join(", ")}` : m?._id ? "✓✓ Delivered" : "✓ Sent"}
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="typing-line">
        {safeTypingDevices.length ? `${safeTypingDevices.join(", ")} typing...` : error}
      </div>

      {replyTo && (
        <div className="reply-compose">
          <div><strong>↩ Replying to: {replyTo.sender}</strong><span>{replyTo.text}</span></div>
          <button type="button" onClick={() => setReplyTo(null)}>Cancel</button>
        </div>
      )}

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
        <input ref={fileRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,.pdf,.doc,.docx,.txt,application/pdf,text/plain" multiple onChange={addFiles} hidden />
        <button type="button" className="composer-icon" onClick={() => fileRef.current?.click()} title="Attach file">+</button>
        <input value={text} onChange={handleChange} placeholder="Message your devices" maxLength={1000} />
        <button className="send-btn" disabled={sending || !chatKey || (!text.trim() && !attachments.length)}>{sending ? "Sending" : "Send"}</button>
      </form>
    </div>
  );
}
