import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../api";
import { useSocket } from "./SocketContext";

const CallContext = createContext(null);

const QUALITY = {
  "360p": { width: 640, height: 360, bitrate: 700000 },
  "720p": { width: 1280, height: 720, bitrate: 1800000 },
  "1080p": { width: 1920, height: 1080, bitrate: 3200000 },
};

function makeCallId(deviceId) {
  return `call_${deviceId}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function CallProvider({ children }) {
  const { emit, on, off, deviceId, connected } = useSocket();
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(new MediaStream());
  const pendingIceRef = useRef([]);
  const ringTimerRef = useRef(null);
  const [iceServers, setIceServers] = useState(null);
  const [call, setCall] = useState({ status: "idle" });
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(remoteStreamRef.current);
  const [quality, setQuality] = useState("1080p");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [speakerOff, setSpeakerOff] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);

  useEffect(() => {
    apiFetch("/api/call/config").then((cfg) => setIceServers(cfg.iceServers)).catch(() => {
      setIceServers([{ urls: ["stun:stun.l.google.com:19302"] }]);
    });
  }, []);

  const cleanup = useCallback(() => {
    ringTimerRef.current && window.clearTimeout(ringTimerRef.current);
    ringTimerRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    pendingIceRef.current = [];
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = new MediaStream();
    setLocalStream(null);
    setRemoteStream(remoteStreamRef.current);
    setMuted(false);
    setCameraOff(false);
    setSpeakerOff(false);
    setScreenSharing(false);
  }, []);

  const getMedia = useCallback(async () => {
    const q = QUALITY[quality] || QUALITY["1080p"];
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: {
        width: { ideal: q.width },
        height: { ideal: q.height },
        frameRate: { ideal: 30, max: 60 },
        facingMode: "user",
      },
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, [quality]);

  const ensurePeer = useCallback(async (targetDeviceId, callId) => {
    if (pcRef.current) return pcRef.current;
    const pc = new RTCPeerConnection({ iceServers: iceServers || [{ urls: ["stun:stun.l.google.com:19302"] }] });
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) emit("ice_candidate", { targetDeviceId, callId, candidate: event.candidate });
    };
    pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => {
        if (!remoteStreamRef.current.getTrackById(track.id)) remoteStreamRef.current.addTrack(track);
      });
      setRemoteStream(remoteStreamRef.current);
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "disconnected"].includes(pc.connectionState)) {
        setCall((prev) => prev.status === "connected" ? { ...prev, status: "reconnecting" } : prev);
      }
      if (pc.connectionState === "connected") {
        setCall((prev) => ({ ...prev, status: "connected", connectedAt: prev.connectedAt || Date.now() }));
      }
    };

    const stream = localStreamRef.current || await getMedia();
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    return pc;
  }, [emit, getMedia, iceServers]);

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
    if (!target?.deviceId || !navigator.mediaDevices) return;
    cleanup();
    const callId = makeCallId(deviceId);
    setCall({ status: "calling", callId, peer: target, direction: "outgoing", startedAt: Date.now() });
    await getMedia();
    emit("call_user", { targetDeviceId: target.deviceId, callId, media: { audio: true, video: true } });
  }, [cleanup, deviceId, emit, getMedia]);

  const acceptCall = useCallback(async () => {
    if (!call.peer?.deviceId || !call.callId) return;
    ringTimerRef.current && window.clearTimeout(ringTimerRef.current);
    await ensurePeer(call.peer.deviceId, call.callId);
    setCall((prev) => ({ ...prev, status: "connecting", direction: "incoming", startedAt: Date.now() }));
    emit("accept_call", { targetDeviceId: call.peer.deviceId, callId: call.callId });
  }, [call.callId, call.peer?.deviceId, emit, ensurePeer]);

  const rejectCall = useCallback((reason = "rejected") => {
    if (call.peer?.deviceId && call.callId) emit("reject_call", { targetDeviceId: call.peer.deviceId, callId: call.callId, reason });
    cleanup();
    setCall({ status: reason === "missed" ? "missed" : "idle", lastReason: reason });
  }, [call.callId, call.peer?.deviceId, cleanup, emit]);

  const endCall = useCallback((reason = "ended") => {
    if (call.peer?.deviceId && call.callId) emit("end_call", { targetDeviceId: call.peer.deviceId, callId: call.callId, reason });
    cleanup();
    setCall({ status: "idle", lastReason: reason });
  }, [call.callId, call.peer?.deviceId, cleanup, emit]);

  useEffect(() => {
    if (!connected) return undefined;
    const onIncoming = ({ callId, from, media }) => {
      if (call.status !== "idle" && call.status !== "missed") {
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
      setCall((prev) => ({ ...prev, status: "connecting", peer: from, callId }));
      const pc = await ensurePeer(from.deviceId, callId);
      await applySenderQuality();
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      emit("offer", { targetDeviceId: from.deviceId, callId, offer });
    };

    const onOffer = async ({ callId, from, offer }) => {
      const pc = await ensurePeer(from.deviceId, callId);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      for (const candidate of pendingIceRef.current.splice(0)) await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      emit("answer", { targetDeviceId: from.deviceId, callId, answer });
      setCall((prev) => ({ ...prev, status: "connected", callId, peer: from, connectedAt: Date.now() }));
    };

    const onAnswer = async ({ answer }) => {
      if (!pcRef.current) return;
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      for (const candidate of pendingIceRef.current.splice(0)) await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      setCall((prev) => ({ ...prev, status: "connected", connectedAt: Date.now() }));
    };

    const onIce = async ({ candidate }) => {
      if (!pcRef.current?.remoteDescription) {
        pendingIceRef.current.push(candidate);
        return;
      }
      await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    };

    const onEnd = ({ reason }) => {
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
  }, [applySenderQuality, call.status, cleanup, connected, emit, ensurePeer, off, on]);

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
    if (!pc || screenSharing) {
      const stream = await getMedia();
      const cameraTrack = stream.getVideoTracks()[0];
      const sender = pc?.getSenders().find((s) => s.track?.kind === "video");
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
      if (document.visibilityState === "visible" && call.status === "connected") {
        localStreamRef.current?.getTracks().forEach((track) => { track.enabled = track.kind === "audio" ? !muted : !cameraOff; });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [call.status, cameraOff, muted]);

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
  }), [acceptCall, call, cameraOff, cleanup, endCall, localStream, muted, quality, rejectCall, remoteStream, screenSharing, speakerOff, startCall, toggleCamera, toggleMute, toggleScreenShare]);

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
  return useContext(CallContext);
}
