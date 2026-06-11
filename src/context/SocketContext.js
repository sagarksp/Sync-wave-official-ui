import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";
import { SOCKET_URL } from "../api";

const SocketContext = createContext(null);

export function SocketProvider({ children, auth, onSocketError }) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState(null);
  const [messages, setMessages] = useState([]);
  const [typingDevices, setTypingDevices] = useState([]);

  useEffect(() => {
    if (!auth?.token) return;
    const socket = io(SOCKET_URL, {
      transports: ["websocket"],
      auth: { token: auth.token },
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join", { deviceId: auth.deviceId, deviceName: auth.deviceName }, (res) => {
        if (!res?.ok) onSocketError?.(res?.error || "Device connection failed");
      });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("state_update", (s) => setState(s));
    socket.on("messages_history", (items) => setMessages(items || []));
    socket.on("chat_message", (item) => setMessages((prev) => [...prev, item].slice(-120)));
    socket.on("typing", ({ devices }) => setTypingDevices(devices || []));
    socket.on("device_event", (event) => {
      setState((prev) => prev ? { ...prev, lastDeviceEvent: event } : prev);
    });
    socket.on("connect_error", (err) => onSocketError?.(err.message || "Socket connection failed"));

    return () => socket.disconnect();
  }, [auth?.token, auth?.deviceId, auth?.deviceName, onSocketError]);

  const emit = useCallback((event, data) => {
    socketRef.current?.emit(event, data);
  }, []);

  return (
    <SocketContext.Provider value={{ connected, state, setState, emit, messages, typingDevices, socketId: socketRef.current?.id }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
