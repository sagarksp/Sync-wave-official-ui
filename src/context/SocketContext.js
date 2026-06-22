import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from "react";
import { io } from "socket.io-client";
import { SOCKET_URL } from "../api";

const SocketContext = createContext(null);

function debug(deviceName, event, details) {
  console.log(`[${deviceName || "SyncWave Device"}] ${event}`, details || "");
}

export function SocketProvider({ children, auth, onSocketError }) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState(null);
  const [messages, setMessages] = useState([]);
  const [typingDevices, setTypingDevices] = useState([]);
  const connectAttemptsRef = useRef(0);

  useEffect(() => {
    console.log("[SyncWave Socket] SocketProvider mounted", {
      socketUrl: SOCKET_URL,
      hasToken: Boolean(auth?.token),
      userId: auth?.user?.id || "",
      deviceId: auth?.deviceId || "",
      deviceName: auth?.deviceName || "",
    });

    if (!auth?.token) {
      console.warn("[SyncWave Socket] SocketProvider waiting for auth token");
      return () => console.log("[SyncWave Socket] SocketProvider unmounted before connect");
    }

    const socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 700,
      auth: { token: auth.token },
    });
    socketRef.current = socket;
    console.log("[SyncWave Socket] Connecting", {
      socketUrl: SOCKET_URL,
      deviceId: auth.deviceId,
      deviceName: auth.deviceName,
      userId: auth.user?.id || "",
    });

    socket.on("connect", () => {
      setConnected(true);
      connectAttemptsRef.current = 0;
      onSocketError?.("");
      debug(auth.deviceName, "SOCKET_CONNECTED", { socketId: socket.id, transport: socket.io.engine.transport.name });
      socket.io.engine.on("upgrade", (transport) => {
        debug(auth.deviceName, "SOCKET_TRANSPORT_UPGRADED", { transport: transport.name, socketId: socket.id });
      });
      debug(auth.deviceName, "SOCKET_EMITTED:join", { deviceId: auth.deviceId });
      socket.emit("join", { deviceId: auth.deviceId, deviceName: auth.deviceName }, (res) => {
        debug(auth.deviceName, "SOCKET_ACK:join", res);
        if (!res?.ok) onSocketError?.(res?.error || "Device connection failed");
      });
    });
    socket.on("disconnect", (reason, details) => {
      debug(auth.deviceName, "SOCKET_DISCONNECTED", {
        reason,
        details: details?.message || details || "",
        socketId: socket.id,
      });
      setConnected(false);
    });
    socket.io.on("reconnect", (attempt) => {
      debug(auth.deviceName, "SOCKET_RECONNECT", { attempt, socketId: socket.id });
    });
    socket.io.on("reconnect_attempt", (attempt) => {
      debug(auth.deviceName, "SOCKET_RECONNECT_ATTEMPT", { attempt, socketUrl: SOCKET_URL });
    });
    socket.io.on("reconnect_failed", () => {
      debug(auth.deviceName, "SOCKET_RECONNECT_FAILED", { socketUrl: SOCKET_URL });
      onSocketError?.("Socket reconnect failed");
    });
    socket.on("state_update", (s) => {
      console.log("STATE UPDATE RECEIVED", s);
      debug(auth.deviceName, "STATE_UPDATE", {
        DEVICE_NAME: auth.deviceName,
        action: s.lastAction,
        version: s.version,
        SERVER_POSITION: s.position,
        currentSong: s.currentSong?.title,
        isPlaying: s.isPlaying,
        queueLength: s.queue?.length || 0,
      });
      setState((prev) => ({
        ...(prev || {}),
        ...(s || {}),
        currentSong: Object.prototype.hasOwnProperty.call(s || {}, "currentSong") ? s.currentSong : prev?.currentSong || null,
        queue: Array.isArray(s?.queue) ? s.queue : prev?.queue || [],
        volume: Number.isFinite(Number(s?.volume)) ? Number(s.volume) : prev?.volume ?? 80,
        isPlaying: typeof s?.isPlaying === "boolean" ? s.isPlaying : prev?.isPlaying ?? false,
        position: Number.isFinite(Number(s?.position)) ? Number(s.position) : prev?.position ?? 0,
        positionAtPlay: Number.isFinite(Number(s?.positionAtPlay)) ? Number(s.positionAtPlay) : prev?.positionAtPlay ?? 0,
        syncEnabled: typeof s?.syncEnabled === "boolean" ? s.syncEnabled : prev?.syncEnabled ?? true,
      }));
    });
    socket.on("messages_history", (items) => setMessages(items || []));
    socket.on("chat_message", (item) => setMessages((prev) => [...prev, item].slice(-120)));
    socket.on("message_reaction", ({ messageId, reaction }) => {
      setMessages((prev) => prev.map((message) => {
        if (String(message._id) !== String(messageId)) return message;
        const reactions = (message.reactions || []).filter((item) => !(item.deviceId === reaction.deviceId && item.emoji === reaction.emoji));
        return { ...message, reactions: [...reactions, reaction] };
      }));
    });
    socket.on("messages_seen", ({ messageIds, seen }) => {
      const ids = new Set(messageIds || []);
      setMessages((prev) => {
        let changed = false;
        const next = prev.map((message) => {
          if (!ids.has(message._id)) return message;
          const seenBy = message.seenBy || [];
          if (seenBy.some((item) => item.deviceId === seen.deviceId)) return message;
          changed = true;
          return { ...message, seenBy: [...seenBy, seen] };
        });
        return changed ? next : prev;
      });
    });
    socket.on("typing", ({ devices }) => setTypingDevices(devices || []));
    socket.on("force_logout", () => {
      localStorage.removeItem("syncwave_auth");
      sessionStorage.removeItem("syncwave_auth");
      window.location.reload();
    });
    socket.on("device_event", (event) => {
      setState((prev) => prev ? { ...prev, lastDeviceEvent: event } : prev);
    });
    socket.on("connect_error", (err) => {
      connectAttemptsRef.current += 1;
      debug(auth.deviceName, "SOCKET_CONNECT_ERROR", {
        message: err.message,
        description: err.description || "",
        context: err.context?.message || err.context || "",
        attempt: connectAttemptsRef.current,
        socketId: socket.id,
        socketUrl: SOCKET_URL,
      });
      if (connectAttemptsRef.current >= 3) {
        onSocketError?.(err.message || "Socket connection failed");
      }
    });

    return () => {
      console.log("[SyncWave Socket] SocketProvider unmounted", {
        socketId: socket.id,
        connected: socket.connected,
        socketUrl: SOCKET_URL,
      });
      socket.disconnect();
    };
  }, [auth?.token, auth?.deviceId, auth?.deviceName, onSocketError]);

  const emit = useCallback((event, data, ack) => {
    const socket = socketRef.current;
    const details = {
      event,
      socketId: socket?.id || "",
      connected: Boolean(socket?.connected),
      transport: socket?.io?.engine?.transport?.name || "",
      data,
    };
    console.log("SOCKET EMIT", details);
    debug(auth.deviceName, `SOCKET_EMITTED:${event}`, details);
    if (!socket?.connected) {
      const res = { ok: false, error: "Socket is not connected" };
      console.warn("[SyncWave Socket] Emit skipped", res);
      ack?.(res);
      return false;
    }
    socket.emit(event, data, (res) => {
      console.log("SOCKET ACK", { event, res });
      ack?.(res);
    });
    return true;
  }, [auth.deviceName]);

  const on = useCallback((event, handler) => {
    socketRef.current?.on(event, handler);
  }, []);

  const off = useCallback((event, handler) => {
    socketRef.current?.off(event, handler);
  }, []);

  const value = useMemo(() => ({
    connected,
    state,
    setState,
    emit,
    on,
    off,
    messages,
    typingDevices,
    socketId: socketRef.current?.id,
    deviceId: auth.deviceId,
    deviceName: auth.deviceName,
  }), [auth.deviceId, auth.deviceName, connected, emit, messages, off, on, state, typingDevices]);

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
