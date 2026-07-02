import React, { useEffect, useRef, useState } from "react";
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
  "movies",
  "anime",
  "cars",
  "bikes",
  "pets",
  "nature",
  "fashion",
  "comedy",
  "motivation",
  "podcasts",
  "jobs",
  "news",
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
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollerRef = useRef(null);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return undefined;
    const onScroll = () => {
      const index = Math.round(node.scrollTop / Math.max(1, node.clientHeight));
      setActiveIndex(index);
      discoverLog("Reels", "pagination_scroll", { index, total: discover.reels.length, nextPageToken: discover.reelNextPage });
      if (index >= discover.reels.length - 3 && discover.reelNextPage !== null && !discover.loading.reels) discover.loadReels();
    };
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => node.removeEventListener("scroll", onScroll);
  }, [discover]);

  useEffect(() => {
    const onKey = (event) => {
      const node = scrollerRef.current;
      if (!node) return;
      if (event.key === "ArrowDown") node.scrollBy({ top: node.clientHeight, behavior: "smooth" });
      if (event.key === "ArrowUp") node.scrollBy({ top: -node.clientHeight, behavior: "smooth" });
      if (event.key.toLowerCase() === "l") {
        const reel = discover.reels[activeIndex];
        if (reel) discover.interact("reel", reel.id, reel.liked ? "unlike" : "like", reel);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, discover]);

  useEffect(() => {
    discover.reels.slice(activeIndex + 1, activeIndex + 4).forEach((reel) => {
      if (reel.thumbnailUrl) {
        const img = new Image();
        img.src = reel.thumbnailUrl;
        discoverLog("Reels", "thumbnail_preload", { id: reel.id, thumbnailUrl: reel.thumbnailUrl });
      }
    });
  }, [activeIndex, discover.reels]);

  return (
    <div className="discover-reels-tab">
      <div className="reel-category-rail">
        <button className={!discover.filters.categories.length ? "active" : ""} type="button" onClick={() => discover.setFilters({ ...discover.filters, categories: [] })}>All</button>
        {REEL_CATEGORIES.filter((key) => key !== "all").map((key) => (
          <button key={key} className={discover.filters.categories.includes(key) ? "active" : ""} type="button" onClick={() => discover.setFilters({ ...discover.filters, categories: [key] })}>{labelFor(key)}</button>
        ))}
        <button type="button" className="reel-refresh-btn" onClick={() => discover.loadReels({ reset: true })}>Refresh</button>
      </div>
      <div className="reel-scroller" ref={scrollerRef}>
        {discover.reels.map((reel, index) => (
          <ReelSlide key={reel.id} reel={reel} active={index === activeIndex} onInteract={(action, extra) => discover.interact("reel", reel.id, action, reel, extra)} />
        ))}
        {discover.loading.reels && <div className="reel-slide reel-loading"><div className="discover-skeleton reel-skeleton" /></div>}
        {!discover.loading.reels && discover.hasFetched?.reels && !discover.reels.length && (
          <div className="reel-slide reel-loading">
            <div className="discover-empty-state">
              <strong>{discover.reelSearch?.emptyMessage || "No videos found"}</strong>
              <span>Try another search or category.</span>
              <button type="button" onClick={() => discover.loadReels({ reset: true })}>Retry</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
