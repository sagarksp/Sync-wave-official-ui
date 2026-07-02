import React, { useEffect, useRef, useState } from "react";
import { addDiscoverComment, getDiscoverComments } from "../../../services/discover/discoverApi";

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
  } catch (err) {
    return "";
  }
}

function CommentPanel({ article, open, onClose }) {
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState("");
  useEffect(() => {
    if (!open) return;
    getDiscoverComments("article", article.id).then((data) => setComments(data.comments || [])).catch(() => setComments([]));
  }, [article.id, open]);
  if (!open) return null;
  return (
    <div className="discover-comments">
      <div className="discover-comments-head">
        <strong>Comments</strong>
        <button type="button" onClick={onClose}>Close</button>
      </div>
      <form
        className="discover-comment-form"
        onSubmit={(event) => {
          event.preventDefault();
          const text = body.trim();
          if (!text) return;
          addDiscoverComment("article", article.id, text).then((data) => {
            setComments((prev) => [{ ...data.comment, user: { displayName: "You" } }, ...prev]);
            setBody("");
          });
        }}
      >
        <input value={body} onChange={(event) => setBody(event.target.value)} placeholder="Add a comment" />
        <button type="submit">Post</button>
      </form>
      <div className="discover-comment-list">
        {comments.map((item) => (
          <div key={item.id} className="discover-comment">
            <strong>{item.user?.displayName || "SyncWave User"}</strong>
            <span>{item.body}</span>
          </div>
        ))}
        {!comments.length && <div className="discover-empty-small">No comments yet</div>}
      </div>
    </div>
  );
}

export default function FeedArticleCard({ article, onInteract }) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const seenRef = useRef(false);

  useEffect(() => {
    if (seenRef.current) return undefined;
    const element = document.getElementById(`article-${article.id}`);
    if (!element || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        seenRef.current = true;
        onInteract("view", { seconds: 1 });
        observer.disconnect();
      }
    }, { threshold: 0.55 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [article.id, onInteract]);

  return (
    <article className="discover-article-card" id={`article-${article.id}`}>
      <div className="discover-article-image">
        {article.imageUrl ? <img src={article.imageUrl} alt="" loading="lazy" /> : <div className="discover-image-fallback">{article.source}</div>}
      </div>
      <div className="discover-article-body">
        <div className="discover-meta-line">
          <span>Source: {article.source}</span>
          <span>Author: {article.author || "Staff"}</span>
        </div>
        <h2>{article.title}</h2>
        <p>{article.description}</p>
        <div className="discover-meta-line">
          <span>{formatDate(article.publishedAt)}</span>
          <span>Language: {article.language}</span>
          <span>Category: {article.category}</span>
          <span>{article.readingTimeMinutes || 1} min read</span>
        </div>
        <div className="discover-card-actions">
          <button className={article.liked ? "active" : ""} type="button" onClick={() => onInteract(article.liked ? "unlike" : "like")}>Like</button>
          <button className={article.saved ? "active" : ""} type="button" onClick={() => onInteract(article.saved ? "unsave" : "save")}>Save</button>
          <button type="button" onClick={() => navigator.share ? navigator.share({ title: article.title, url: article.url }).then(() => onInteract("share")) : onInteract("share")}>Share</button>
          <button type="button" onClick={() => setCommentsOpen(true)}>Comment</button>
          <a href={article.url} target="_blank" rel="noreferrer" onClick={() => onInteract("read", { seconds: Math.max(20, (article.readingTimeMinutes || 1) * 60) })}>Read More</a>
        </div>
      </div>
      <CommentPanel article={article} open={commentsOpen} onClose={() => setCommentsOpen(false)} />
    </article>
  );
}
