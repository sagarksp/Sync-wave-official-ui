import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCall } from "../context/CallContext";

function formatTimer(start) {
  if (!start) return "00:00";
  const s = Math.max(0, Math.floor((Date.now() - start) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function StreamVideo({ stream, muted, className }) {
  const ref = useRef(null);
  useEffect(() => {
    const video = ref.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    const playPromise = video.play();
    if (playPromise?.catch) playPromise.catch((err) => console.log("[SyncWave Call] VIDEO_PLAY_BLOCKED", err.message));
  }, [stream]);
  return <video ref={ref} className={className} autoPlay playsInline muted={muted} />;
}

export default function CallModal() {
  const call = useCall();
  const [tick, setTick] = useState(0);
  const [previewPos, setPreviewPos] = useState(null);
  const dragRef = useRef(null);

  useEffect(() => {
    const t = window.setInterval(() => setTick((v) => v + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  const callState = call?.call || { status: "idle" };
  const visible = call && callState.status !== "idle";
  const timer = useMemo(() => formatTimer(callState.connectedAt), [callState.connectedAt, tick]);
  const incoming = callState.status === "incoming";
  const missed = callState.status === "missed";
  const peerName = callState.peer?.deviceName || "SyncWave Device";
  const callStatus = useMemo(() => {
    if (callState.status === "calling") return "Calling...";
    if (callState.status === "incoming") return "Ringing...";
    if (callState.status === "connected") return "Connected";
    return "Connecting...";
  }, [callState.status]);

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

  return (
    <div className="call-layer">
      <div className="call-shell">
        <div className="call-remote">
          {call.remoteStream?.getTracks?.().length ? (
            <StreamVideo stream={call.remoteStream} muted={call.speakerOff} className="call-video remote" />
          ) : (
            <div className="call-placeholder">
              <div className="call-avatar">{peerName.slice(0, 2).toUpperCase()}</div>
              <div>{callStatus}</div>
            </div>
          )}
        </div>

        <div className="call-topbar">
          <div>
            <div className="call-peer">{peerName}</div>
            <div className="call-status">{callStatus}{callState.status === "connected" ? ` ${timer}` : ""}</div>
          </div>
        </div>

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
              <span>🎤</span><small>{call.muted ? "Muted" : "Mic"}</small>
            </button>
            <button className={`call-control ${call.cameraOff ? "off" : ""}`} onClick={call.toggleCamera} title="Camera">
              <span>📹</span><small>{call.cameraOff ? "Off" : "Cam"}</small>
            </button>
            <button className="call-control" onClick={call.switchCamera} title="Switch camera">
              <span>🔄</span><small>Switch</small>
            </button>
            <button className={`call-control ${call.speakerOff ? "off" : ""}`} onClick={call.toggleSpeaker} title="Speaker">
              <span>🔊</span><small>{call.speakerOff ? "Off" : "Sound"}</small>
            </button>
            {call.screenShareSupported && (
              <button className={`call-control ${call.screenSharing ? "on" : ""}`} onClick={call.toggleScreenShare} title="Share screen">
                <span>🖥</span><small>{call.screenSharing ? "Stop" : "Share"}</small>
              </button>
            )}
            <button className="call-control end" onClick={() => call.endCall("ended")} title="End call">
              <span>📞</span><small>End</small>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
