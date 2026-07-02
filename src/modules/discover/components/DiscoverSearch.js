import React, { useEffect, useState } from "react";
import { searchDiscover } from "../../../services/discover/discoverApi";
import { discoverLog } from "../../../services/discover/discoverLogger";

export default function DiscoverSearch({ discover, onShowReels }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [results, setResults] = useState({ articles: [], reels: [], creators: [], topics: [] });
  const [quota, setQuota] = useState(null);
  const [pendingQuery, setPendingQuery] = useState("");
  const [limitPopup, setLimitPopup] = useState(false);
  const [dismissedWarning, setDismissedWarning] = useState(false);

  function runSearch(text, allowWarning = false) {
    discoverLog("Search", "keyword", { keyword: text, scope, quota });
    if (quota?.warning && !dismissedWarning && !allowWarning) {
      setPendingQuery(text);
      return;
    }
    const useReelSearch = scope === "all" || scope === "reels";
    const request = useReelSearch && discover?.searchReels ? discover.searchReels(text) : searchDiscover(text, scope);
    if (useReelSearch) onShowReels?.();
    request.then((data) => {
      setResults(data);
      setQuota(data.quota || null);
      discoverLog("Search", "results", { keyword: text, scope, reels: data.reels?.length || 0, articles: data.articles?.length || 0, source: data.recommendationSource, fromCache: data.fromCache });
      if (data.quota?.exhausted) setLimitPopup(true);
    }).catch((err) => {
      discoverLog("Search", "error", { keyword: text, scope, status: err.status, error: err.message });
      if (err.status === 429) {
        setQuota({ exhausted: true, remaining: 0, ...(err.payload || {}) });
        setLimitPopup(true);
      }
      setResults((prev) => ({ ...prev, articles: prev.articles || [], reels: prev.reels || [], creators: prev.creators || [], topics: prev.topics || [] }));
    });
  }

  useEffect(() => {
    const text = query.trim();
    if (!text) {
      setResults({ articles: [], reels: [], creators: [], topics: [] });
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      runSearch(text);
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [query, scope]); // runSearch intentionally reads current quota state.

  return (
    <div className="discover-search-box">
      <div className="discover-search-line">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search videos, articles, creators, topics, hashtags" />
        <select value={scope} onChange={(event) => setScope(event.target.value)}>
          <option value="all">All</option>
          <option value="articles">Articles</option>
          <option value="reels">Reels</option>
          <option value="creators">Creators</option>
          <option value="topics">Topics</option>
        </select>
        <button type="button" className="discover-voice-btn" title="Voice search architecture ready" onClick={() => window.SpeechRecognition || window.webkitSpeechRecognition ? setQuery(query) : null}>Voice</button>
      </div>
      {quota?.warning && <div className="discover-quota-line">Free searches: {quota.used}/{quota.max}. Cached results stay available.</div>}
      {!!query.trim() && (
        <div className="discover-search-results">
          {results.articles.map((item) => <a key={`a-${item.id}`} href={item.url} target="_blank" rel="noreferrer">{item.title}<span>{item.source}</span></a>)}
          {results.reels.map((item) => <span key={`r-${item.id}`}>{item.title}<small>Reel</small></span>)}
          {results.creators.map((item) => <span key={`c-${item.id}`}>{item.displayName}<small>@{item.handle}</small></span>)}
          {results.topics.map((item) => <span key={`t-${item}`}>{item}<small>Topic</small></span>)}
        </div>
      )}
      {pendingQuery && (
        <div className="discover-quota-modal">
          <div className="discover-quota-card">
            <h2>Free Search Limit</h2>
            <p>You're approaching today's free search quota. Continue searching may consume today's remaining API quota.</p>
            <div>
              <button type="button" onClick={() => setPendingQuery("")}>Cancel</button>
              <button type="button" onClick={() => { const text = pendingQuery; setDismissedWarning(true); setPendingQuery(""); runSearch(text, true); }}>Continue</button>
            </div>
          </div>
        </div>
      )}
      {limitPopup && (
        <div className="discover-quota-modal">
          <div className="discover-quota-card">
            <h2>Free Search Limit</h2>
            <p>You&apos;ve reached today&apos;s free search limit. Please try again tomorrow.</p>
            <div>
              <button type="button" onClick={() => setLimitPopup(false)}>OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
