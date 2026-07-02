import React, { useEffect, useRef } from "react";
import DiscoverFilters from "./DiscoverFilters";
import FeedArticleCard from "./FeedArticleCard";

export default function FeedTab({ discover }) {
  const sentinel = useRef(null);
  const refreshing = discover.loading.feed;

  useEffect(() => {
    const node = sentinel.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !discover.loading.feed && discover.feedNextPage !== null) {
        discover.loadFeed();
      }
    }, { rootMargin: "500px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [discover]);

  return (
    <div className="discover-feed-tab">
      <DiscoverFilters filters={discover.filters} meta={discover.meta} onChange={discover.setFilters} onRefresh={discover.refreshNews} refreshing={refreshing} />
      <div className="discover-feed-grid">
        <aside className="discover-side-panel">
          <div className="discover-panel-title">Trending</div>
          <div className="discover-tag-cloud">
            {(discover.trending.hashtags || []).slice(0, 14).map((tag) => <span key={tag}>{tag}</span>)}
          </div>
          <div className="discover-panel-title">Saved</div>
          <div className="discover-mini-list">
            {(discover.bookmarks.articles || []).slice(0, 5).map((item) => <a key={item.id} href={item.url} target="_blank" rel="noreferrer">{item.title}</a>)}
            {!discover.bookmarks.articles?.length && <span>No saved articles</span>}
          </div>
        </aside>
        <section className="discover-explore-masonry">
          {discover.feed.map((article) => (
            <FeedArticleCard
              key={article.id}
              article={article}
              onInteract={(action, extra) => discover.interact("article", article.id, action, article, extra)}
            />
          ))}
          {discover.loading.feed && Array.from({ length: 3 }).map((_, index) => <div key={index} className="discover-skeleton" />)}
          {!discover.loading.feed && discover.hasFetched?.feed && !discover.feed.length && (
            <div className="discover-empty">
              <span>No articles found for these filters.</span>
              <button type="button" onClick={() => discover.loadFeed({ reset: true })}>Retry</button>
            </div>
          )}
          <div ref={sentinel} className="discover-sentinel" />
        </section>
      </div>
    </div>
  );
}
