import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSocket } from "../../../context/SocketContext";
import { addDiscoverComment, followDiscoverCreator, getDiscoverComments } from "../../../services/discover/discoverApi";
import { discoverLog } from "../../../services/discover/discoverLogger";

const REEL_CATEGORIES = [
  "all",
  "music",
  "gaming",
  "technology",
  "programming",
  "ai",
  "education",
  "business",
  "finance",
  "food",
  "cooking",
  "travel",
  "fitness",
  "gym",
  "cricket",
  "football",
  "anime",
  "movies",
  "comedy",
  "motivation",
  "news",
  "science",
  "history",
  "space",
  "nature",
];

function labelFor(key) {
  if (key === "ai") return "AI";
  return key.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function ReelComments({ reel, open, onClose }) {
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState("");
  useEffect(() => {
    if (!open) return;
    getDiscoverComments("reel", reel.id).then((data) => setComments(data.comments || [])).catch(() => setComments([]));
  }, [open, reel.id]);
  if (!open) return null;
  return (
    <div className="reel-comments">
      <div className="discover-comments-head">
        <strong>Comments</strong>
        <button type="button" onClick={onClose}>Close</button>
      </div>
      <form className="discover-comment-form" onSubmit={(event) => {
        event.preventDefault();
        const text = body.trim();
        if (!text) return;
        addDiscoverComment("reel", reel.id, text).then((data) => {
          setComments((prev) => [{ ...data.comment, user: { displayName: "You" } }, ...prev]);
          setBody("");
        });
      }}>
        <input value={body} onChange={(event) => setBody(event.target.value)} placeholder="Add a comment" />
        <button type="submit">Post</button>
      </form>
      <div className="discover-comment-list">
        {comments.map((item) => <div key={item.id} className="discover-comment"><strong>{item.user?.displayName || "User"}</strong><span>{item.body}</span></div>)}
      </div>
    </div>
  );
}

function ReelSlide({ reel, active, onInteract }) {
  const videoRef = useRef(null);
  const [muted, setMuted] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [progress, setProgress] = useState(0);
  const [likedFlash, setLikedFlash] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const startedRef = useRef(0);
  const isYouTube = reel.provider === "youtube";

  useEffect(() => {
    const video = videoRef.current;
    if (!video || isYouTube) return;
    if (active) {
      startedRef.current = Date.now();
      video.playbackRate = speed;
      discoverLog("Reels", "video_loading", { id: reel.id, provider: reel.provider, title: reel.title });
      video.play().catch(() => null);
      onInteract("watch");
    } else {
      if (startedRef.current) {
        onInteract("watch", { seconds: Math.round((Date.now() - startedRef.current) / 1000), completionRate: video.duration ? video.currentTime / video.duration : 0 });
      }
      video.pause();
    }
  }, [active, isYouTube, onInteract, speed]);

  useEffect(() => {
    if (!active || !isYouTube) return undefined;
    startedRef.current = Date.now();
    discoverLog("Reels", "player_ready", { id: reel.id, provider: "youtube", title: reel.title });
    onInteract("watch");
    return () => {
      if (startedRef.current) onInteract("watch", { seconds: Math.round((Date.now() - startedRef.current) / 1000), completionRate: 0.6 });
    };
  }, [active, isYouTube, onInteract]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || isYouTube) return undefined;
    const timer = window.setInterval(() => {
      setProgress(video.duration ? Math.min(1, video.currentTime / video.duration) : 0);
    }, 220);
    return () => window.clearInterval(timer);
  }, [isYouTube]);

  function likeWithFlash() {
    setLikedFlash(true);
    window.setTimeout(() => setLikedFlash(false), 520);
    onInteract(reel.liked ? "unlike" : "like");
  }

  return (
    <section className="reel-slide">
      {isYouTube ? (
        <iframe
          title={reel.title}
          src={`${reel.embedUrl || reel.videoUrl}${active ? "&autoplay=1" : ""}&mute=${muted ? 1 : 0}`}
          loading={active ? "eager" : "lazy"}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          onDoubleClick={likeWithFlash}
          onLoad={() => discoverLog("Reels", "player_ready", { id: reel.id, provider: "youtube" })}
          onError={() => discoverLog("Reels", "player_error", { id: reel.id, provider: "youtube", error: "iframe_error" })}
        />
      ) : (
        <video
          ref={videoRef}
          src={reel.videoUrl}
          poster={reel.thumbnailUrl}
          muted={muted}
          loop
          playsInline
          preload={active ? "auto" : "metadata"}
          controls={false}
          onEnded={() => onInteract("complete", { completionRate: 1 })}
          onCanPlay={() => discoverLog("Reels", "player_ready", { id: reel.id, provider: reel.provider })}
          onError={() => discoverLog("Reels", "player_error", { id: reel.id, provider: reel.provider, error: "video_error" })}
          onDoubleClick={likeWithFlash}
          onPointerDown={(event) => {
            const video = videoRef.current;
            if (!video) return;
            const timer = window.setTimeout(() => video.pause(), 420);
            const clear = () => window.clearTimeout(timer);
            event.currentTarget.addEventListener("pointerup", clear, { once: true });
          }}
        />
      )}
      <div className="reel-progress"><span style={{ width: `${Math.round((isYouTube && active ? 0.38 : progress) * 100)}%` }} /></div>
      {likedFlash && <div className="reel-like-flash">Like</div>}
      <div className="reel-gradient" />
      <div className="reel-info">
        <div className="reel-creator">
          <span>{reel.creator?.displayName || "SyncWave Creator"}</span>
          {reel.creator?.verified && <b>Verified</b>}
        </div>
        <h2>{reel.title}</h2>
        <p>{reel.description}</p>
        <div className="reel-tags">{(reel.hashtags || []).map((tag) => <span key={tag}>{tag}</span>)}</div>
      </div>
      <div className="reel-actions">
        <button className={reel.liked ? "active" : ""} type="button" onClick={likeWithFlash}>Like</button>
        <button className={reel.saved ? "active" : ""} type="button" onClick={() => onInteract(reel.saved ? "unsave" : "save")}>Save</button>
        <button type="button" onClick={() => setCommentsOpen(true)}>Comment</button>
        <button type="button" onClick={() => navigator.share ? navigator.share({ title: reel.title, url: reel.videoUrl }).then(() => onInteract("share")) : onInteract("share")}>Share</button>
        <button type="button" onClick={() => setMuted((value) => !value)}>{muted ? "Unmute" : "Mute"}</button>
        <button type="button" onClick={() => setSpeed((value) => value >= 1.5 ? 0.75 : value + 0.25)}>{speed}x</button>
        <button type="button" onClick={() => videoRef.current?.requestFullscreen?.() || document.querySelector(".reel-scroller")?.requestFullscreen?.()}>Full</button>
        {document.pictureInPictureEnabled && !isYouTube && <button type="button" onClick={() => videoRef.current?.requestPictureInPicture?.()}>PiP</button>}
        {reel.creator?.id && <button type="button" onClick={() => followDiscoverCreator(reel.creator.id, reel.followed ? "unfollow" : "follow")}>{reel.followed ? "Following" : "Follow"}</button>}
      </div>
      <ReelComments reel={reel} open={commentsOpen} onClose={() => setCommentsOpen(false)} />
    </section>
  );
}

export default function ReelsTab({ discover }) {
  const socket = useSocket();
  const [activeIndex, setActiveIndex] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [miniPlayerOpen, setMiniPlayerOpen] = useState(false);
  const [liveSync, setLiveSync] = useState(() => localStorage.getItem("syncwave_live_discover_sync") === "true");
  const scrollerRef = useRef(null);
  const applyingRemoteRef = useRef(false);
  const lastSyncRef = useRef(0);
  const displayedReels = useMemo(() => discover.visibleReels || discover.reels, [discover.visibleReels, discover.reels]);
  const selectedCategory = discover.activeReelCategory || discover.filters.categories?.[0] || "all";

  function selectCategory(key) {
    const categories = key === "all" ? [] : [key];
    discoverLog("Reels", "drawer_selection", { category: key });
    console.log("[FILTER]", key);
    setDrawerOpen(false);
    discover.setFilters({ ...discover.filters, categories });
  }

  function toggleLiveSync() {
    const enabled = !liveSync;
    setLiveSync(enabled);
    localStorage.setItem("syncwave_live_discover_sync", String(enabled));
    discoverLog("Reels", "live_discover_sync_toggle", { enabled });
    socket?.emit?.("discover_sync_toggle", { enabled }, (res) => {
      if (!res?.ok) discoverLog("Reels", "live_discover_sync_error", { error: res?.error });
    });
  }

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return undefined;
    const onScroll = () => {
      const index = Math.round(node.scrollTop / Math.max(1, node.clientHeight));
      setActiveIndex(index);
      discoverLog("Reels", "scroll_changed", { index, total: displayedReels.length, nextPageToken: discover.reelNextPage });
      console.log("[CURRENT INDEX]", index);
      if (!discover.reelSearch?.active && index >= discover.reels.length - 3 && discover.reelNextPage !== null && !discover.loading.reels) discover.loadReels();
    };
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => node.removeEventListener("scroll", onScroll);
  }, [discover, displayedReels.length]);

  useEffect(() => {
    setActiveIndex(0);
    scrollerRef.current?.scrollTo({ top: 0, behavior: "auto" });
    discoverLog("Reels", "current_index_reset", { category: selectedCategory });
  }, [selectedCategory, discover.reelSearch?.query]);

  useEffect(() => {
    if (!socket?.on || !socket?.off) return undefined;
    const onDiscoverSync = (payload = {}) => {
      if (!payload.enabled || payload.updatedBy === socket.deviceId) return;
      applyingRemoteRef.current = true;
      discoverLog("Reels", "live_discover_sync_received", payload);
      if (payload.filter && payload.filter !== selectedCategory) {
        discover.setFilters({ ...discover.filters, categories: payload.filter === "all" ? [] : [payload.filter] });
      }
      const index = Math.max(0, Number(payload.index) || 0);
      setActiveIndex(index);
      requestAnimationFrame(() => {
        const node = scrollerRef.current;
        if (node) node.scrollTo({ top: index * node.clientHeight, behavior: "smooth" });
        window.setTimeout(() => { applyingRemoteRef.current = false; }, 240);
      });
    };
    socket.on("discover_sync_update", onDiscoverSync);
    return () => socket.off("discover_sync_update", onDiscoverSync);
  }, [discover, selectedCategory, socket]);

  useEffect(() => {
    if (!liveSync || applyingRemoteRef.current || !socket?.emit) return undefined;
    const now = Date.now();
    if (now - lastSyncRef.current < 180) return undefined;
    lastSyncRef.current = now;
    const activeReel = displayedReels[activeIndex];
    socket.emit("discover_sync_update", {
      enabled: true,
      reelId: activeReel?.id || "",
      index: activeIndex,
      position: 0,
      isPlaying: true,
      muted: true,
      volume: 80,
      speed: 1,
      filter: selectedCategory,
    });
    discoverLog("Reels", "live_discover_sync_sent", { index: activeIndex, reelId: activeReel?.id, filter: selectedCategory });
    return undefined;
  }, [activeIndex, displayedReels, liveSync, selectedCategory, socket]);

  useEffect(() => {
    const onKey = (event) => {
      const node = scrollerRef.current;
      if (!node) return;
      if (event.key === "ArrowDown") node.scrollBy({ top: node.clientHeight, behavior: "smooth" });
      if (event.key === "ArrowUp") node.scrollBy({ top: -node.clientHeight, behavior: "smooth" });
      if (event.key.toLowerCase() === "l") {
        const reel = displayedReels[activeIndex];
        if (reel) discover.interact("reel", reel.id, reel.liked ? "unlike" : "like", reel);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, discover, displayedReels]);

  useEffect(() => {
    displayedReels.slice(activeIndex + 1, activeIndex + 4).forEach((reel) => {
      if (reel.thumbnailUrl) {
        const img = new Image();
        img.src = reel.thumbnailUrl;
        discoverLog("Reels", "thumbnail_preload", { id: reel.id, thumbnailUrl: reel.thumbnailUrl });
      }
    });
  }, [activeIndex, displayedReels]);

  return (
    <div className="discover-reels-tab">
      <div className="reel-topbar">
        <button className="reel-drawer-button" type="button" aria-label="Open reel categories" onClick={() => { discoverLog("Reels", "drawer_open", {}); setDrawerOpen(true); }}>☰</button>
        <span>{labelFor(selectedCategory)}</span>
        <div className="reel-topbar-actions">
          <button type="button" className={liveSync ? "reel-sync-btn active" : "reel-sync-btn"} onClick={toggleLiveSync}>Live Sync</button>
          <button type="button" className="reel-refresh-btn" onClick={() => discover.loadReels({ reset: true })}>Refresh</button>
        </div>
      </div>
      {drawerOpen && <button className="reel-drawer-backdrop" type="button" aria-label="Close reel categories" onClick={() => { discoverLog("Reels", "drawer_closed", {}); setDrawerOpen(false); }} />}
      <aside className={`reel-drawer ${drawerOpen ? "open" : ""}`} aria-hidden={!drawerOpen}>
        <div className="reel-drawer-head">
          <strong>Discover Reels</strong>
          <button type="button" onClick={() => { discoverLog("Reels", "drawer_closed", {}); setDrawerOpen(false); }}>Close</button>
        </div>
        {REEL_CATEGORIES.map((key) => (
          <button key={key} className={selectedCategory === key || (key === "all" && !discover.filters.categories.length) ? "active" : ""} type="button" onClick={() => selectCategory(key)}>
            {labelFor(key)}
          </button>
        ))}
      </aside>
      <div className="reel-scroller" ref={scrollerRef}>
        {displayedReels.map((reel, index) => (
          <ReelSlide key={reel.id} reel={reel} active={index === activeIndex} onInteract={(action, extra) => discover.interact("reel", reel.id, action, reel, extra)} />
        ))}
        {discover.loading.reels && <div className="reel-slide reel-loading"><div className="discover-skeleton reel-skeleton" /></div>}
        {!discover.loading.reels && discover.hasFetched?.reels && !displayedReels.length && (
          <div className="reel-slide reel-loading">
            <div className="discover-empty-state">
              <strong>{discover.reelSearch?.emptyMessage || "No videos found"}</strong>
              <span>Try another search or category.</span>
              <button type="button" onClick={() => discover.loadReels({ reset: true })}>Retry</button>
            </div>
          </div>
        )}
      </div>
      <button className={`reel-mini-player ${miniPlayerOpen ? "open" : ""}`} type="button" onClick={() => { discoverLog("Reels", miniPlayerOpen ? "mini_player_closed" : "mini_player_open", {}); setMiniPlayerOpen((value) => !value); }}>
        <span className="reel-mini-art">{(displayedReels[activeIndex]?.title || "SW").slice(0, 2).toUpperCase()}</span>
        {miniPlayerOpen && <span className="reel-mini-copy"><strong>{displayedReels[activeIndex]?.title || "SyncWave"}</strong><small>Global music continues</small></span>}
      </button>
    </div>
  );
}
