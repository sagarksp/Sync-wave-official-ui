import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCall } from "../context/CallContext";

function formatTimer(start) {
  if (!start) return "00:00";
  const s = Math.max(0, Math.floor((Date.now() - start) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function StreamVideo({ stream, muted, className, videoRef }) {
  const ref = useRef(null);
  useEffect(() => {
    const video = ref.current;
    if (videoRef) videoRef.current = video;
    if (!video || !stream) return;
    video.srcObject = stream;
    const playPromise = video.play();
    if (playPromise?.catch) playPromise.catch((err) => console.log("[SyncWave Call] VIDEO_PLAY_BLOCKED", err.message));
  }, [stream, videoRef]);
  return <video ref={ref} className={className} autoPlay playsInline muted={muted} />;
}

export default function CallModal() {
  const call = useCall();
  const [tick, setTick] = useState(0);
  const [previewPos, setPreviewPos] = useState(null);
  const [minimized, setMinimized] = useState(false);
  const dragRef = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    const t = window.setInterval(() => setTick((v) => v + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  const callState = call?.call || { status: "idle" };
  const visible = call && callState.status !== "idle";
  const timer = useMemo(() => formatTimer(callState.connectedAt), [callState.connectedAt, tick]);
  const incoming = callState.status === "incoming";
  const missed = callState.status === "missed";
  const isVoice = callState.mode === "voice" || callState.media?.video === false;
  const peerName = callState.peer?.deviceName || "SyncWave Device";
  const callStatus = useMemo(() => {
    if (callState.status === "calling") return isVoice ? "Voice calling..." : "Video calling...";
    if (callState.status === "incoming") return isVoice ? "Incoming voice call" : "Incoming video call";
    if (callState.status === "connected") return isVoice ? "Voice connected" : "Connected";
    if (callState.status === "reconnecting") return "Reconnecting...";
    return "Connecting...";
  }, [callState.status, isVoice]);

  const requestPiP = useCallback(async () => {
    const video = remoteVideoRef.current;
    if (!video || !document.pictureInPictureEnabled || document.pictureInPictureElement) return;
    if (!video.videoWidth) return;
    try {
      await video.requestPictureInPicture();
    } catch (err) {
      console.log("[SyncWave Call] PIP_UNAVAILABLE", err.message);
    }
  }, []);

  const minimizeCall = useCallback(() => {
    setMinimized(true);
    requestPiP();
  }, [requestPiP]);

  const expandCall = useCallback(async () => {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture().catch(() => {});
    }
    setMinimized(false);
  }, []);

  useEffect(() => {
    if (!visible) {
      setMinimized(false);
      return undefined;
    }
    window.history.pushState({ syncwaveCall: true }, "");
    const onPop = () => minimizeCall();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [minimizeCall, visible]);

  useEffect(() => {
    const onVisibility = () => {
      if (visible && document.visibilityState === "hidden") requestPiP();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [requestPiP, visible]);

  const startDrag = useCallback((event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    };
  }, []);

  const dragPreview = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const margin = 12;
    const x = Math.max(margin, Math.min(window.innerWidth - drag.width - margin, event.clientX - drag.offsetX));
    const y = Math.max(margin, Math.min(window.innerHeight - drag.height - margin, event.clientY - drag.offsetY));
    setPreviewPos({ x, y });
  }, []);

  const endDrag = useCallback((event) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
  }, []);

  const previewStyle = previewPos ? { left: previewPos.x, top: previewPos.y, right: "auto" } : undefined;
  if (!visible) return null;

  if (minimized && !incoming && !missed) {
    return (
      <div className="call-mini-window whatsapp" role="dialog" aria-label="Active call">
        <button className="call-mini-video" onClick={expandCall} type="button">
          {!isVoice && call.remoteStream?.getTracks?.().length ? (
            <StreamVideo stream={call.remoteStream} muted={call.speakerOff} className="call-video mini" videoRef={remoteVideoRef} />
          ) : (
            <div className="call-avatar mini">{peerName.slice(0, 2).toUpperCase()}</div>
          )}
          {!isVoice && call.localStream?.getTracks?.().length && (
            <div className="call-mini-local">
              <StreamVideo stream={call.localStream} muted className="call-video local" />
            </div>
          )}
        </button>
        <div className="call-mini-meta">
          <strong>{peerName}</strong>
          <span>{callState.status === "connected" ? `${isVoice ? "Voice" : "Video"} ${timer}` : callStatus}</span>
        </div>
        <div className="call-mini-actions">
          <button className={`mini-round ${call.muted ? "off" : ""}`} onClick={call.toggleMute} title={call.muted ? "Unmute" : "Mute"}>{call.muted ? "Unmute" : "Mute"}</button>
          <button className="mini-round" onClick={expandCall}>Return</button>
          <button className="mini-end" onClick={() => call.endCall("ended")}>End</button>
        </div>
      </div>
    );
  }

  return (
    <div className="call-layer">
      <div className="call-shell">
        <div className="call-remote">
          {!isVoice && call.remoteStream?.getTracks?.().length ? (
            <StreamVideo stream={call.remoteStream} muted={call.speakerOff} className="call-video remote" videoRef={remoteVideoRef} />
          ) : (
            <div className="call-placeholder">
              <div className="call-avatar">{peerName.slice(0, 2).toUpperCase()}</div>
              <div>{callStatus}{callState.status === "connected" ? ` ${timer}` : ""}</div>
            </div>
          )}
          {isVoice && call.remoteStream?.getAudioTracks?.().length ? (
            <StreamVideo stream={call.remoteStream} muted={call.speakerOff} className="call-audio-only" videoRef={remoteVideoRef} />
          ) : null}
        </div>

        <div className="call-topbar">
          <div>
            <div className="call-peer">{peerName}</div>
            <div className="call-status">{callStatus}{callState.status === "connected" ? ` ${timer}` : ""}</div>
          </div>
          {!incoming && !missed && <button className="call-minimize" onClick={minimizeCall}>Minimize</button>}
        </div>

        {!isVoice && (
          <div
            className="call-local"
            style={previewStyle}
            onPointerDown={startDrag}
            onPointerMove={dragPreview}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {call.localStream ? <StreamVideo stream={call.localStream} muted className="call-video local" /> : <div className="call-local-empty">Camera</div>}
          </div>
        )}

        {missed ? (
          <div className="incoming-actions">
            <button className="call-control" onClick={call.dismissCall}>Close</button>
          </div>
        ) : incoming ? (
          <div className="incoming-actions">
            <button className="call-control reject" onClick={() => call.rejectCall("rejected")}>Reject</button>
            <button className="call-control accept" onClick={call.acceptCall}>Accept</button>
          </div>
        ) : (
          <div className="call-controls">
            <button className={`call-control ${call.muted ? "off" : ""}`} onClick={call.toggleMute} title="Microphone">
              <span>Mic</span><small>{call.muted ? "Muted" : "On"}</small>
            </button>
            {!isVoice && (
              <>
                <button className={`call-control ${call.cameraOff ? "off" : ""}`} onClick={call.toggleCamera} title="Camera">
                  <span>Cam</span><small>{call.cameraOff ? "Off" : "On"}</small>
                </button>
                <button className="call-control" onClick={call.switchCamera} title="Switch camera">
                  <span>{call.cameraFacing === "user" ? "Front" : "Back"}</span><small>Switch</small>
                </button>
              </>
            )}
            <button className={`call-control ${call.speakerOff ? "off" : ""}`} onClick={call.toggleSpeaker} title="Speaker">
              <span>Audio</span><small>{call.speakerOff ? "Off" : "On"}</small>
            </button>
            {!isVoice && call.screenShareSupported && (
              <button className={`call-control ${call.screenSharing ? "on" : ""}`} onClick={call.toggleScreenShare} title="Share screen">
                <span>Share</span><small>{call.screenSharing ? "Stop" : "Screen"}</small>
              </button>
            )}
            <button className="call-control" onClick={minimizeCall} title="Picture in picture">
              <span>Mini</span><small>PiP</small>
            </button>
            <button className="call-control end" onClick={() => call.endCall("ended")} title="End call">
              <span>End</span><small>Call</small>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
