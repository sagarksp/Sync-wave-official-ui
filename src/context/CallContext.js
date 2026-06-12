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

export function CallProvider({ children }) {
  const { emit, on, off, deviceId, connected } = useSocket();
  const pcRef = useRef(null);
  const callRef = useRef({ status: "idle" });
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const pendingIceRef = useRef([]);
  const ringTimerRef = useRef(null);
  const [iceServers, setIceServers] = useState(FALLBACK_ICE);
  const [call, setCallState] = useState({ status: "idle" });
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [quality, setQuality] = useState("1080p");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [speakerOff, setSpeakerOff] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
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
    console.log(`[SyncWave Call] ${event}`, details);
    setDebug((prev) => ({ ...prev, lastEvent: event, error: details.error || prev.error || "" }));
  }, []);

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

  const getMedia = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      const error = "Camera and microphone APIs are unavailable";
      logCall("MEDIA_FAILED", { error });
      throw new Error(error);
    }

    const q = QUALITY[quality] || QUALITY["1080p"];
    const constraints = {
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: {
        width: { ideal: q.width },
        height: { ideal: q.height },
        frameRate: { ideal: 30, max: 60 },
        facingMode: "user",
      },
    };

    try {
      logCall("CALL_STARTED", { quality });
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      setLocalStream(stream);
      updateDebug({ localStream: true, error: "" });
      logCall("MEDIA_GRANTED", streamSummary(stream));
      return stream;
    } catch (err) {
      logCall("MEDIA_RETRY_BASIC", { error: err.message });
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      setLocalStream(stream);
      updateDebug({ localStream: true, error: "" });
      logCall("MEDIA_GRANTED", streamSummary(stream));
      return stream;
    }
  }, [logCall, quality, updateDebug]);

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
    if (pcRef.current) return pcRef.current;

    const pc = new RTCPeerConnection({ iceServers });
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
      logCall("TRACK_RECEIVED", streamSummary(incoming));
      logCall("REMOTE_STREAM_SET", { tracks: incoming.getTracks().length });
    };

    pc.onconnectionstatechange = () => {
      updateDebug({ peerConnection: pc.connectionState });
      logCall("PEER_STATE", { state: pc.connectionState });
      if (pc.connectionState === "connected") {
        setCall((prev) => ({ ...prev, status: "connected", connectedAt: prev.connectedAt || Date.now() }));
      } else if (["disconnected", "failed"].includes(pc.connectionState)) {
        setCall((prev) => ({ ...prev, status: prev.status === "idle" ? "idle" : "reconnecting" }));
      }
    };

    pc.oniceconnectionstatechange = () => {
      updateDebug({ iceState: pc.iceConnectionState });
      logCall("ICE_STATE", { state: pc.iceConnectionState });
    };

    const stream = localStreamRef.current || await getMedia();
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
      logCall("TRACK_ADDED", { kind: track.kind, enabled: track.enabled });
    });
    return pc;
  }, [emit, getMedia, iceServers, logCall, setCall, updateDebug]);

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

  const startCall = useCallback(async (target) => {
    if (!target?.deviceId) return;
    cleanup();
    const callId = makeCallId(deviceId);
    setCall({ status: "calling", callId, peer: target, direction: "outgoing", startedAt: Date.now() });
    try {
      await getMedia();
      emit("call_user", { targetDeviceId: target.deviceId, callId, media: { audio: true, video: true } });
    } catch (err) {
      updateDebug({ error: err.message });
      setCall({ status: "failed", peer: target, callId, lastReason: err.message });
    }
  }, [cleanup, deviceId, emit, getMedia, setCall, updateDebug]);

  const acceptCall = useCallback(async () => {
    const activeCall = callRef.current;
    if (!activeCall.peer?.deviceId || !activeCall.callId) return;
    if (ringTimerRef.current) window.clearTimeout(ringTimerRef.current);
    try {
      await ensurePeer(activeCall.peer.deviceId, activeCall.callId);
      setCall((prev) => ({ ...prev, status: "connecting", direction: "incoming", startedAt: Date.now() }));
      emit("accept_call", { targetDeviceId: activeCall.peer.deviceId, callId: activeCall.callId });
    } catch (err) {
      logCall("MEDIA_FAILED", { error: err.message });
      emit("reject_call", { targetDeviceId: activeCall.peer.deviceId, callId: activeCall.callId, reason: "media_failed" });
      updateDebug({ error: err.message });
      setCall({ status: "failed", peer: activeCall.peer, callId: activeCall.callId, lastReason: err.message });
    }
  }, [emit, ensurePeer, logCall, setCall, updateDebug]);

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

    const onIncoming = ({ callId, from, media }) => {
      const activeCall = callRef.current;
      logCall("INCOMING_CALL", { callId, from });
      if (activeCall.status !== "idle" && activeCall.status !== "missed" && activeCall.status !== "failed") {
        emit("reject_call", { targetDeviceId: from.deviceId, callId, reason: "busy" });
        return;
      }
      cleanup();
      setCall({ status: "incoming", callId, peer: from, media, direction: "incoming", startedAt: Date.now() });
      ringTimerRef.current = window.setTimeout(() => {
        emit("reject_call", { targetDeviceId: from.deviceId, callId, reason: "missed" });
        setCall({ status: "missed", peer: from, callId, lastReason: "missed" });
      }, 30000);
    };

    const onAccepted = async ({ callId, from }) => {
      try {
        logCall("ACCEPT_RECEIVED", { callId, from });
        setCall((prev) => ({ ...prev, status: "connecting", peer: from, callId }));
        const pc = await ensurePeer(from.deviceId, callId);
        await applySenderQuality();
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
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

    const onAnswer = async ({ answer }) => {
      try {
        logCall("ANSWER_RECEIVED", { type: answer?.type });
        if (!pcRef.current) return;
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        await addPendingIce(pcRef.current);
      } catch (err) {
        logCall("ANSWER_APPLY_FAILED", { error: err.message });
        updateDebug({ error: err.message });
      }
    };

    const onIce = async ({ candidate }) => {
      try {
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

    const onEnd = ({ reason }) => {
      logCall("CALL_ENDED_REMOTE", { reason });
      cleanup();
      setCall({ status: "idle", lastReason: reason || "ended" });
    };

    on("incoming_call", onIncoming);
    on("accept_call", onAccepted);
    on("offer", onOffer);
    on("answer", onAnswer);
    on("ice_candidate", onIce);
    on("reject_call", onEnd);
    on("end_call", onEnd);
    on("call_unavailable", onEnd);
    return () => {
      off("incoming_call", onIncoming);
      off("accept_call", onAccepted);
      off("offer", onOffer);
      off("answer", onAnswer);
      off("ice_candidate", onIce);
      off("reject_call", onEnd);
      off("end_call", onEnd);
      off("call_unavailable", onEnd);
    };
  }, [addPendingIce, applySenderQuality, cleanup, connected, emit, ensurePeer, logCall, off, on, setCall, updateDebug]);

  const toggleMute = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = muted; });
    setMuted((v) => !v);
  }, [muted]);

  const toggleCamera = useCallback(() => {
    localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = cameraOff; });
    setCameraOff((v) => !v);
  }, [cameraOff]);

  const toggleScreenShare = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;

    if (screenSharing) {
      const stream = await getMedia();
      const cameraTrack = stream.getVideoTracks()[0];
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender && cameraTrack) await sender.replaceTrack(cameraTrack);
      setScreenSharing(false);
      return;
    }

    const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const screenTrack = display.getVideoTracks()[0];
    const sender = pc.getSenders().find((s) => s.track?.kind === "video");
    if (sender && screenTrack) await sender.replaceTrack(screenTrack);
    screenTrack.onended = () => setScreenSharing(false);
    setScreenSharing(true);
  }, [getMedia, screenSharing]);

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
    speakerOff,
    screenSharing,
    debug: {
      ...debug,
      localStream: Boolean(localStream?.getTracks?.().length),
      remoteStream: Boolean(remoteStream?.getTracks?.().length),
    },
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    dismissCall: () => {
      cleanup();
      setCall({ status: "idle" });
    },
    toggleMute,
    toggleCamera,
    toggleSpeaker: () => setSpeakerOff((v) => !v),
    toggleScreenShare,
  }), [acceptCall, call, cameraOff, cleanup, debug, endCall, localStream, muted, quality, rejectCall, remoteStream, screenSharing, speakerOff, setCall, startCall, toggleCamera, toggleMute, toggleScreenShare]);

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
  return useContext(CallContext);
}
