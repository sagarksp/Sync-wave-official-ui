import React, { useEffect, useMemo, useRef, useState } from "react";
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

  useEffect(() => {
    const t = window.setInterval(() => setTick((v) => v + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  const visible = call && call.call.status !== "idle";
  const timer = useMemo(() => formatTimer(call?.call.connectedAt), [call?.call.connectedAt, tick]);
  if (!visible) return null;

  const incoming = call.call.status === "incoming";
  const missed = call.call.status === "missed";
  const peerName = call.call.peer?.deviceName || "SyncWave Device";

  return (
    <div className="call-layer">
      <div className="call-shell">
        <div className="call-remote">
          {call.remoteStream?.getTracks?.().length ? (
            <StreamVideo stream={call.remoteStream} muted={call.speakerOff} className="call-video remote" />
          ) : (
            <div className="call-placeholder">
              <div className="call-avatar">{peerName.slice(0, 2).toUpperCase()}</div>
              <div>{incoming ? "Incoming video call" : call.call.status === "calling" ? "Calling..." : "Connecting..."}</div>
            </div>
          )}
        </div>

        <div className="call-topbar">
          <div>
            <div className="call-peer">{peerName}</div>
            <div className="call-status">{call.call.status === "connected" ? timer : call.call.status}</div>
          </div>
          <select className="call-quality" value={call.quality} onChange={(e) => call.setQuality(e.target.value)}>
            <option value="360p">360p</option>
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
          </select>
        </div>

        <div className="call-debug">
          <div><span>Local Stream</span><strong>{call.debug.localStream ? "Yes" : "No"}</strong></div>
          <div><span>Remote Stream</span><strong>{call.debug.remoteStream ? "Yes" : "No"}</strong></div>
          <div><span>Peer Connection</span><strong>{call.debug.peerConnection}</strong></div>
          <div><span>ICE State</span><strong>{call.debug.iceState}</strong></div>
          <div><span>Last Event</span><strong>{call.debug.lastEvent || "none"}</strong></div>
          {call.debug.error && <div className="call-debug-error"><span>Error</span><strong>{call.debug.error}</strong></div>}
        </div>

        <div className="call-local">
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
              {call.muted ? "Mic Off" : "Mic"}
            </button>
            <button className={`call-control ${call.cameraOff ? "off" : ""}`} onClick={call.toggleCamera} title="Camera">
              {call.cameraOff ? "Cam Off" : "Camera"}
            </button>
            <button className={`call-control ${call.speakerOff ? "off" : ""}`} onClick={call.toggleSpeaker} title="Speaker">
              {call.speakerOff ? "Speaker Off" : "Speaker"}
            </button>
            {call.screenShareSupported && (
              <button className={`call-control ${call.screenSharing ? "on" : ""}`} onClick={call.toggleScreenShare} title="Share screen">
                {call.screenSharing ? "Stop Share" : "Share"}
              </button>
            )}
            <button className="call-control end" onClick={() => call.endCall("ended")} title="End call">End</button>
          </div>
        )}
      </div>
    </div>
  );
}
