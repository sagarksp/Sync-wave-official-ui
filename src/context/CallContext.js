import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../api";
import { useSocket } from "./SocketContext";

const CallContext = createContext(null);

const FALLBACK_ICE = [{ urls: "stun:stun.l.google.com:19302" }];
const QUALITY = {
  "360p": { width: 640, height: 360, bitrate: 700000 },
  "720p": { width: 1280, height: 720, bitrate: 1800000 },
  "1080p": { width: 1920, height: 1080, bitrate: 3200000 },
};

function makeCallId(deviceId) {
  return `call_${deviceId}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function streamSummary(stream) {
  if (!stream) return { audio: 0, video: 0 };
  return {
    audio: stream.getAudioTracks().length,
    video: stream.getVideoTracks().length,
  };
}

function isLocalhost() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function isCapacitorAndroid() {
  const capacitor = window.Capacitor;
  return Boolean(capacitor?.isNativePlatform?.() && capacitor?.getPlatform?.() === "android");
}

function screenShareCapability() {
  const hasGetDisplayMedia = Boolean(navigator.mediaDevices?.getDisplayMedia);
  const capacitorAndroid = isCapacitorAndroid();
  const secure = Boolean(window.isSecureContext || isLocalhost() || capacitorAndroid);
  const supported = Boolean(hasGetDisplayMedia && secure);
  return {
    supported,
    hasGetDisplayMedia,
    secureContext: secure,
    capacitorAndroid,
    platform: window.Capacitor?.getPlatform?.() || navigator.userAgent,
  };
}

export function CallProvider({ children }) {
  const { emit, on, off, deviceId, deviceName, socketId, connected } = useSocket();
  const pcRef = useRef(null);
  const callRef = useRef({ status: "idle" });
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const pendingIceRef = useRef([]);
  const ringTimerRef = useRef(null);
  const facingModeRef = useRef("user");
  const activeMediaRef = useRef({ audio: true, video: true, mode: "video" });
  const [iceServers, setIceServers] = useState(FALLBACK_ICE);
  const [call, setCallState] = useState({ status: "idle" });
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [quality, setQuality] = useState("1080p");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [speakerOff, setSpeakerOff] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [cameraFacing, setCameraFacing] = useState("user");
  const [debug, setDebug] = useState({
    localStream: false,
    remoteStream: false,
    peerConnection: "none",
    iceState: "new",
    lastEvent: "",
    error: "",
  });

  const setCall = useCallback((next) => {
    setCallState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      callRef.current = value;
      return value;
    });
  }, []);

  const logCall = useCallback((event, details = {}) => {
    console.log(`[SyncWave Call] ${event}`, { socketId, deviceId, deviceName, ...details });
    setDebug((prev) => ({ ...prev, lastEvent: event, error: details.error || prev.error || "" }));
  }, [deviceId, deviceName, socketId]);

  const updateDebug = useCallback((patch) => {
    setDebug((prev) => ({ ...prev, ...patch }));
  }, []);

  useEffect(() => {
    apiFetch("/api/call/config")
      .then((cfg) => {
        const servers = Array.isArray(cfg.iceServers) && cfg.iceServers.length ? cfg.iceServers : FALLBACK_ICE;
        setIceServers(servers);
      })
      .catch(() => setIceServers(FALLBACK_ICE));
  }, []);

  const cleanup = useCallback(() => {
    if (ringTimerRef.current) window.clearTimeout(ringTimerRef.current);
    ringTimerRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    pendingIceRef.current = [];
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setMuted(false);
    setCameraOff(false);
    setSpeakerOff(false);
    setScreenSharing(false);
    updateDebug({
      localStream: false,
      remoteStream: false,
      peerConnection: "none",
      iceState: "new",
    });
  }, [updateDebug]);

  const getCameraStream = useCallback(async (facingMode = facingModeRef.current, includeAudio = true, includeVideo = true) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      const error = "Camera and microphone APIs are unavailable";
      logCall("MEDIA_FAILED", { error });
      throw new Error(error);
    }

    const q = QUALITY[quality] || QUALITY["1080p"];
    const constraints = {
      audio: includeAudio ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false,
      video: includeVideo ? {
        width: { ideal: q.width },
        height: { ideal: q.height },
        frameRate: { ideal: 30, max: 60 },
        facingMode: { ideal: facingMode },
      } : false,
    };

    try {
      logCall("MEDIA_STREAM_REQUESTED", { quality, facingMode, includeAudio, includeVideo });
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      logCall("CAMERA_RETRY_BASIC", { error: err.message, facingMode, includeAudio });
      return navigator.mediaDevices.getUserMedia({ video: includeVideo, audio: includeAudio });
    }
  }, [logCall, quality]);

  const setCameraStream = useCallback((stream) => {
    localStreamRef.current = stream;
    setLocalStream(stream);
    updateDebug({ localStream: true, error: "" });
    logCall("MEDIA_GRANTED", streamSummary(stream));
  }, [logCall, updateDebug]);

  const getMedia = useCallback(async (media = activeMediaRef.current) => {
    try {
      const wantsVideo = media?.video !== false;
      activeMediaRef.current = { audio: media?.audio !== false, video: wantsVideo, mode: wantsVideo ? "video" : "voice" };
      logCall("CALL_STARTED", { quality, facingMode: facingModeRef.current, media: activeMediaRef.current });
      const stream = await getCameraStream(facingModeRef.current, true, wantsVideo);
      setCameraStream(stream);
      setCameraOff(!wantsVideo);
      return stream;
    } catch (err) {
      logCall("MEDIA_FAILED", { error: err.message });
      throw err;
    }
  }, [getCameraStream, logCall, quality, setCameraStream]);

  const addPendingIce = useCallback(async (pc) => {
    if (!pc.remoteDescription) return;
    const pending = pendingIceRef.current.splice(0);
    for (const candidate of pending) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) => {
        logCall("ICE_ADD_FAILED", { error: err.message });
      });
    }
  }, [logCall]);

  const ensurePeer = useCallback(async (targetDeviceId, callId) => {
    if (pcRef.current?.__syncwaveCallId === callId) return pcRef.current;
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
      pendingIceRef.current = [];
    }

    const pc = new RTCPeerConnection({ iceServers });
    pc.__syncwaveCallId = callId;
    pcRef.current = pc;
    updateDebug({
      peerConnection: pc.connectionState,
      iceState: pc.iceConnectionState,
    });
    logCall("PEER_CREATED", { callId, targetDeviceId, iceServers });

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      emit("ice_candidate", { targetDeviceId, callId, candidate: event.candidate });
      logCall("ICE_SENT", { candidate: event.candidate.candidate });
    };

    pc.ontrack = (event) => {
      const incoming = event.streams?.[0] || new MediaStream([event.track]);
      remoteStreamRef.current = incoming;
      setRemoteStream(incoming);
      updateDebug({ remoteStream: incoming.getTracks().length > 0 });
      logCall("REMOTE_TRACK_RECEIVED", { kind: event.track?.kind, ...streamSummary(incoming) });
      logCall("REMOTE_STREAM_SET", { tracks: incoming.getTracks().length });
    };

    pc.onconnectionstatechange = () => {
      updateDebug({ peerConnection: pc.connectionState });
      logCall("PEER_STATE", { state: pc.connectionState });
      if (pc.connectionState === "connected") {
        const role = callRef.current.direction === "incoming" ? "RECEIVER" : "CALLER";
        console.log(`[${role}] PEER_CONNECTED`, { socketId, deviceId, deviceName, callId, targetDeviceId });
        setCall((prev) => ({ ...prev, status: "connected", connectedAt: prev.connectedAt || Date.now() }));
      } else if (["disconnected", "failed"].includes(pc.connectionState)) {
        setCall((prev) => ({ ...prev, status: prev.status === "idle" ? "idle" : "reconnecting" }));
        if (pc.connectionState === "failed") {
          pc.restartIce?.();
          logCall("ICE_RESTART_REQUESTED", { callId, targetDeviceId });
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      updateDebug({ iceState: pc.iceConnectionState });
      logCall("ICE_STATE", { state: pc.iceConnectionState });
    };

    const stream = localStreamRef.current || await getMedia(activeMediaRef.current);
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
      logCall("TRACK_ADDED", { kind: track.kind, enabled: track.enabled });
    });
    return pc;
  }, [deviceId, deviceName, emit, getMedia, iceServers, logCall, setCall, socketId, updateDebug]);

  const applySenderQuality = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    const bitrate = QUALITY[quality]?.bitrate || QUALITY["1080p"].bitrate;
    await Promise.all(pc.getSenders().map(async (sender) => {
      if (sender.track?.kind !== "video") return;
      const params = sender.getParameters();
      params.degradationPreference = "maintain-framerate";
      params.encodings = params.encodings?.length ? params.encodings : [{}];
      params.encodings[0].maxBitrate = bitrate;
      await sender.setParameters(params).catch(() => {});
    }));
  }, [quality]);

  useEffect(() => {
    applySenderQuality();
  }, [applySenderQuality]);

  const startCall = useCallback(async (target, mode = "video") => {
    if (!target?.deviceId) return;
    if (target.deviceId === deviceId) {
      const error = "Cannot call this device";
      logCall("SELF_CALL_BLOCKED", { error, targetDeviceId: target.deviceId });
      updateDebug({ error });
      return;
    }
    cleanup();
    const callId = makeCallId(deviceId);
    const media = { audio: true, video: mode !== "voice", mode };
    activeMediaRef.current = media;
    setCall({ status: "calling", callId, peer: target, direction: "outgoing", startedAt: Date.now(), media, mode });
    try {
      await getMedia(media);
      console.log("[CALLER] CALL_SENT", {
        socketId,
        deviceId,
        deviceName,
        callId,
        receiverDeviceId: target.deviceId,
        receiverDeviceName: target.deviceName,
      });
      emit("call_user", { targetDeviceId: target.deviceId, callId, media });
    } catch (err) {
      updateDebug({ error: err.message });
      setCall({ status: "failed", peer: target, callId, lastReason: err.message });
    }
  }, [cleanup, deviceId, deviceName, emit, getMedia, logCall, setCall, socketId, updateDebug]);

  const acceptCall = useCallback(async () => {
    const activeCall = callRef.current;
    if (!activeCall.peer?.deviceId || !activeCall.callId) return;
    if (ringTimerRef.current) window.clearTimeout(ringTimerRef.current);
    try {
      activeMediaRef.current = activeCall.media || { audio: true, video: true, mode: "video" };
      await ensurePeer(activeCall.peer.deviceId, activeCall.callId);
      setCall((prev) => ({ ...prev, status: "connecting", direction: "incoming", startedAt: Date.now(), mode: activeMediaRef.current.mode || (activeMediaRef.current.video ? "video" : "voice") }));
      console.log("[RECEIVER] CALL_ACCEPTED", {
        socketId,
        deviceId,
        deviceName,
        callId: activeCall.callId,
        callerDeviceId: activeCall.peer.deviceId,
        callerDeviceName: activeCall.peer.deviceName,
      });
      emit("accept_call", { targetDeviceId: activeCall.peer.deviceId, callId: activeCall.callId });
    } catch (err) {
      logCall("MEDIA_FAILED", { error: err.message });
      emit("reject_call", { targetDeviceId: activeCall.peer.deviceId, callId: activeCall.callId, reason: "media_failed" });
      updateDebug({ error: err.message });
      setCall({ status: "failed", peer: activeCall.peer, callId: activeCall.callId, lastReason: err.message });
    }
  }, [deviceId, deviceName, emit, ensurePeer, logCall, setCall, socketId, updateDebug]);

  const rejectCall = useCallback((reason = "rejected") => {
    const activeCall = callRef.current;
    if (activeCall.peer?.deviceId && activeCall.callId) {
      emit("reject_call", { targetDeviceId: activeCall.peer.deviceId, callId: activeCall.callId, reason });
    }
    cleanup();
    setCall({ status: reason === "missed" ? "missed" : "idle", lastReason: reason });
  }, [cleanup, emit, setCall]);

  const endCall = useCallback((reason = "ended") => {
    const activeCall = callRef.current;
    if (activeCall.peer?.deviceId && activeCall.callId) {
      emit("end_call", { targetDeviceId: activeCall.peer.deviceId, callId: activeCall.callId, reason });
    }
    cleanup();
    setCall({ status: "idle", lastReason: reason });
  }, [cleanup, emit, setCall]);

  useEffect(() => {
    if (!connected) return undefined;

    const isFromSelf = (from) => from?.deviceId === deviceId || (socketId && from?.socketId === socketId);
    const isCurrentCallSignal = (payload = {}) => {
      const activeCall = callRef.current;
      return Boolean(payload.callId && activeCall.callId && payload.callId === activeCall.callId);
    };

    const onIncoming = ({ callId, from, media }) => {
      const activeCall = callRef.current;
      if (isFromSelf(from)) {
        logCall("SELF_SIGNAL_IGNORED", { event: "incoming_call", callId, from });
        return;
      }
      console.log("[RECEIVER] CALL_RECEIVED", { socketId, deviceId, deviceName, callId, from });
      logCall("INCOMING_CALL", { callId, from });
      if (activeCall.status !== "idle" && activeCall.status !== "missed" && activeCall.status !== "failed") {
        emit("reject_call", { targetDeviceId: from.deviceId, callId, reason: "busy" });
        return;
      }
      cleanup();
      const nextMedia = media || { audio: true, video: true, mode: "video" };
      activeMediaRef.current = nextMedia;
      setCall({ status: "incoming", callId, peer: from, media: nextMedia, mode: nextMedia.mode || (nextMedia.video === false ? "voice" : "video"), direction: "incoming", startedAt: Date.now() });
      ringTimerRef.current = window.setTimeout(() => {
        emit("reject_call", { targetDeviceId: from.deviceId, callId, reason: "missed" });
        setCall({ status: "missed", peer: from, callId, lastReason: "missed" });
      }, 30000);
    };

    const onAccepted = async ({ callId, from }) => {
      try {
        if (isFromSelf(from) || !isCurrentCallSignal({ callId })) {
          logCall("STALE_SIGNAL_IGNORED", { event: "accept_call", callId, from });
          return;
        }
        logCall("ACCEPT_RECEIVED", { callId, from });
        setCall((prev) => ({ ...prev, status: "connecting", peer: from, callId }));
        const pc = await ensurePeer(from.deviceId, callId);
        await applySenderQuality();
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: activeMediaRef.current.video !== false });
        await pc.setLocalDescription(offer);
        emit("offer", { targetDeviceId: from.deviceId, callId, offer });
        logCall("OFFER_SENT", { type: offer.type });
      } catch (err) {
        logCall("OFFER_FAILED", { error: err.message });
        updateDebug({ error: err.message });
      }
    };

    const onOffer = async ({ callId, from, offer }) => {
      try {
        if (isFromSelf(from) || !isCurrentCallSignal({ callId })) {
          logCall("STALE_SIGNAL_IGNORED", { event: "offer", callId, from });
          return;
        }
        logCall("OFFER_RECEIVED", { callId, from });
        const pc = await ensurePeer(from.deviceId, callId);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await addPendingIce(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        emit("answer", { targetDeviceId: from.deviceId, callId, answer });
        logCall("ANSWER_SENT", { type: answer.type });
        setCall((prev) => ({ ...prev, status: "connecting", callId, peer: from }));
      } catch (err) {
        logCall("ANSWER_FAILED", { error: err.message });
        updateDebug({ error: err.message });
      }
    };

    const onAnswer = async ({ callId, from, answer }) => {
      try {
        if (isFromSelf(from) || !isCurrentCallSignal({ callId })) {
          logCall("STALE_SIGNAL_IGNORED", { event: "answer", callId, from });
          return;
        }
        console.log("[CALLER] ANSWER_RECEIVED", { socketId, deviceId, deviceName, callId, from, type: answer?.type });
        logCall("ANSWER_RECEIVED", { callId, from, type: answer?.type });
        if (!pcRef.current) return;
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        await addPendingIce(pcRef.current);
      } catch (err) {
        logCall("ANSWER_APPLY_FAILED", { error: err.message });
        updateDebug({ error: err.message });
      }
    };

    const onIce = async ({ callId, from, candidate }) => {
      try {
        if (isFromSelf(from) || !isCurrentCallSignal({ callId })) {
          logCall("STALE_SIGNAL_IGNORED", { event: "ice_candidate", callId, from });
          return;
        }
        logCall("ICE_RECEIVED", { candidate: candidate?.candidate });
        if (!pcRef.current?.remoteDescription) {
          pendingIceRef.current.push(candidate);
          return;
        }
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        logCall("ICE_ADD_FAILED", { error: err.message });
      }
    };

    const onEnd = ({ callId, from, reason }) => {
      if (isFromSelf(from) || !isCurrentCallSignal({ callId })) {
        logCall("STALE_SIGNAL_IGNORED", { event: "call_end", callId, from, reason });
        return;
      }
      logCall("CALL_ENDED_REMOTE", { callId, from, reason });
      cleanup();
      setCall({ status: "idle", lastReason: reason || "ended" });
    };

    const onUnavailable = ({ callId, targetDeviceId, reason }) => {
      if (!isCurrentCallSignal({ callId })) {
        logCall("STALE_SIGNAL_IGNORED", { event: "call_unavailable", callId, targetDeviceId, reason });
        return;
      }
      logCall("CALL_UNAVAILABLE", { callId, targetDeviceId, reason });
      cleanup();
      setCall({ status: "idle", lastReason: reason || "unavailable" });
    };

    on("incoming_call", onIncoming);
    on("accept_call", onAccepted);
    on("offer", onOffer);
    on("answer", onAnswer);
    on("ice_candidate", onIce);
    on("reject_call", onEnd);
    on("end_call", onEnd);
    on("call_unavailable", onUnavailable);
    return () => {
      off("incoming_call", onIncoming);
      off("accept_call", onAccepted);
      off("offer", onOffer);
      off("answer", onAnswer);
      off("ice_candidate", onIce);
      off("reject_call", onEnd);
      off("end_call", onEnd);
      off("call_unavailable", onUnavailable);
    };
  }, [addPendingIce, applySenderQuality, cleanup, connected, deviceId, deviceName, emit, ensurePeer, logCall, off, on, setCall, socketId, updateDebug]);

  const toggleMute = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = muted; });
    setMuted((v) => !v);
  }, [muted]);

  const toggleCamera = useCallback(() => {
    if (activeMediaRef.current.video === false) return;
    localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = cameraOff; });
    setCameraOff((v) => !v);
  }, [cameraOff]);

  const switchCamera = useCallback(async () => {
    if (activeMediaRef.current.video === false) return;
    const nextFacing = facingModeRef.current === "user" ? "environment" : "user";
    try {
      logCall("CAMERA_SWITCH_START", { from: facingModeRef.current, to: nextFacing, screenSharing });
      const videoOnlyStream = await getCameraStream(nextFacing, false);
      const nextVideoTrack = videoOnlyStream.getVideoTracks()[0];
      if (!nextVideoTrack) {
        const error = "No camera video track returned";
        logCall("CAMERA_SWITCH_FAILED", { error, facingMode: nextFacing });
        updateDebug({ error });
        return;
      }

      const previousStream = localStreamRef.current;
      const audioTracks = previousStream?.getAudioTracks?.() || [];
      const sender = !screenSharing ? pcRef.current?.getSenders().find((s) => s.track?.kind === "video") : null;
      if (!screenSharing && !sender) {
        videoOnlyStream.getTracks().forEach((track) => track.stop());
        const error = "Camera video sender unavailable";
        logCall("CAMERA_SWITCH_FAILED", { error });
        updateDebug({ error });
        return;
      }

      nextVideoTrack.enabled = !cameraOff;
      const nextCameraStream = new MediaStream([...audioTracks, nextVideoTrack]);
      localStreamRef.current = nextCameraStream;
      facingModeRef.current = nextFacing;
      setCameraFacing(nextFacing);
      previousStream?.getVideoTracks?.().forEach((track) => track.stop());

      if (!screenSharing) {
        await sender.replaceTrack(nextVideoTrack);
        setLocalStream(nextCameraStream);
        logCall("TRACK_REPLACED", { from: "camera", to: "camera", facingMode: nextFacing, trackId: nextVideoTrack.id });
      } else {
        logCall("CAMERA_SWITCH_READY", { facingMode: nextFacing, screenShareActive: true, trackId: nextVideoTrack.id });
      }

      updateDebug({ localStream: true, error: "" });
      logCall("CAMERA_SWITCHED", { facingMode: nextFacing });
    } catch (err) {
      const error = err.name === "NotAllowedError" ? "Camera switch permission was dismissed" : err.message;
      logCall("CAMERA_SWITCH_FAILED", { error, name: err.name });
      updateDebug({ error });
    }
  }, [cameraOff, getCameraStream, logCall, screenSharing, updateDebug]);

  const restoreCamera = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return false;

    const stream = localStreamRef.current || await getMedia();
    const cameraTrack = stream.getVideoTracks()[0];
    const sender = pc.getSenders().find((s) => s.track?.kind === "video");
    if (!sender || !cameraTrack) {
      const error = "Camera video sender unavailable";
      logCall("CAMERA_RESTORE_FAILED", { error, hasSender: Boolean(sender), hasCameraTrack: Boolean(cameraTrack) });
      updateDebug({ error });
      return false;
    }

    cameraTrack.enabled = !cameraOff;
    await sender.replaceTrack(cameraTrack);
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    setLocalStream(stream);
    setScreenSharing(false);
    updateDebug({ localStream: true, error: "" });
    logCall("CAMERA_RESTORED", { trackId: cameraTrack.id, enabled: cameraTrack.enabled });
    return true;
  }, [cameraOff, getMedia, logCall, updateDebug]);

  const toggleScreenShare = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || callRef.current.status === "idle") return;
    if (activeMediaRef.current.video === false) {
      updateDebug({ error: "Screen sharing is available during video calls" });
      return;
    }

    if (screenSharing) {
      logCall("SCREEN_SHARE_STOPPED", { reason: "button" });
      await restoreCamera();
      return;
    }

    const capability = screenShareCapability();
    logCall("SCREEN_SHARE_CAPABILITY", capability);
    if (!capability.supported) {
      const error = !capability.hasGetDisplayMedia
        ? "This browser does not expose screen sharing"
        : "Screen sharing requires HTTPS or localhost";
      logCall("SCREEN_SHARE_UNSUPPORTED", { error, ...capability });
      updateDebug({ error });
      return;
    }

    try {
      logCall("SCREEN_SHARE_START");
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: QUALITY["1080p"].width },
          height: { ideal: QUALITY["1080p"].height },
          frameRate: { ideal: 30, max: 60 },
        },
        audio: false,
      });
      const screenTrack = display.getVideoTracks()[0];
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");

      logCall("SCREEN_STREAM_CREATED", { ...streamSummary(display), trackId: screenTrack?.id });
      if (!sender || !screenTrack) {
        display.getTracks().forEach((track) => track.stop());
        const error = "Screen video sender unavailable";
        logCall("SCREEN_SHARE_FAILED", { error, hasSender: Boolean(sender), hasScreenTrack: Boolean(screenTrack) });
        updateDebug({ error });
        return;
      }

      await sender.replaceTrack(screenTrack);
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = display;
      setLocalStream(display);
      setScreenSharing(true);
      updateDebug({ localStream: true, error: "" });
      logCall("TRACK_REPLACED", { from: "camera", to: "screen", trackId: screenTrack.id });

      screenTrack.onended = async () => {
        logCall("SCREEN_SHARE_STOPPED", { reason: "browser" });
        await restoreCamera();
      };
    } catch (err) {
      const error = err.name === "NotAllowedError" ? "Screen sharing permission was dismissed" : err.message;
      logCall("SCREEN_SHARE_FAILED", { error, name: err.name });
      updateDebug({ error });
      setScreenSharing(false);
    }
  }, [logCall, restoreCamera, screenSharing, updateDebug]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && callRef.current.status === "connected") {
        localStreamRef.current?.getTracks().forEach((track) => {
          track.enabled = track.kind === "audio" ? !muted : !cameraOff;
        });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [cameraOff, muted]);

  const value = useMemo(() => ({
    call,
    localStream,
    remoteStream,
    quality,
    setQuality,
    muted,
    cameraOff,
    cameraFacing,
    speakerOff,
    screenSharing,
    screenShareSupported: screenShareCapability().supported,
    debug: {
      ...debug,
      localStream: Boolean(localStream?.getTracks?.().length),
      remoteStream: Boolean(remoteStream?.getTracks?.().length),
    },
    startCall,
    startVoiceCall: (target) => startCall(target, "voice"),
    startVideoCall: (target) => startCall(target, "video"),
    acceptCall,
    rejectCall,
    endCall,
    dismissCall: () => {
      cleanup();
      setCall({ status: "idle" });
    },
    toggleMute,
    toggleCamera,
    switchCamera,
    toggleSpeaker: () => setSpeakerOff((v) => !v),
    toggleScreenShare,
  }), [acceptCall, call, cameraFacing, cameraOff, cleanup, debug, endCall, localStream, muted, quality, rejectCall, remoteStream, screenSharing, speakerOff, setCall, startCall, switchCamera, toggleCamera, toggleMute, toggleScreenShare]);

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
  return useContext(CallContext);
}
