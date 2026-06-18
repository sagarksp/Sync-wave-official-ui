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
    if (!auth?.token) return;
    const socket = io(SOCKET_URL, {
      transports: ["websocket"],
      auth: { token: auth.token },
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      connectAttemptsRef.current = 0;
      onSocketError?.("");
      debug(auth.deviceName, "SOCKET_CONNECTED");
      debug(auth.deviceName, "SOCKET_EMITTED:join", { deviceId: auth.deviceId });
      socket.emit("join", { deviceId: auth.deviceId, deviceName: auth.deviceName }, (res) => {
        if (!res?.ok) onSocketError?.(res?.error || "Device connection failed");
      });
    });
    socket.on("disconnect", () => {
      debug(auth.deviceName, "SOCKET_DISCONNECTED");
      setConnected(false);
    });
    socket.on("state_update", (s) => {
      debug(auth.deviceName, "STATE_UPDATE", {
        DEVICE_NAME: auth.deviceName,
        action: s.lastAction,
        version: s.version,
        SERVER_POSITION: s.position,
      });
      setState(s);
    });
    socket.on("messages_history", (items) => setMessages(items || []));
    socket.on("chat_message", (item) => setMessages((prev) => [...prev, item].slice(-120)));
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
      if (connectAttemptsRef.current >= 3) {
        onSocketError?.(err.message || "Socket connection failed");
      }
    });

    return () => socket.disconnect();
  }, [auth?.token, auth?.deviceId, auth?.deviceName, onSocketError]);

  const emit = useCallback((event, data) => {
    debug(auth.deviceName, `SOCKET_EMITTED:${event}`, data);
    socketRef.current?.emit(event, data);
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
