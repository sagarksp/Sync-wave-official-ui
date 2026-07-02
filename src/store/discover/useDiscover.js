import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getDiscoverBookmarks,
  getDiscoverFeed,
  getDiscoverMeta,
  getDiscoverReels,
  getDiscoverTrending,
  refreshDiscoverNews,
  searchDiscoverReels,
  sendDiscoverInteraction,
} from "../../services/discover/discoverApi";
import { discoverLog } from "../../services/discover/discoverLogger";

const DEFAULT_FILTERS = {
  languages: [],
  categories: [],
  date: "last-week",
  sort: "latest",
};

function storedFilters() {
  try {
    return { ...DEFAULT_FILTERS, ...JSON.parse(localStorage.getItem("syncwave_discover_filters") || "{}") };
  } catch (err) {
    return DEFAULT_FILTERS;
  }
}

function readInterests() {
  try {
    return JSON.parse(localStorage.getItem("syncwave_discover_interests") || "{}");
  } catch (err) {
    return {};
  }
}

function writeInterest(category, action) {
  if (!category) return;
  const weights = { watch: 1, like: 4, save: 4, share: 3, comment: 3, read: 2, skip: -2, ignore: -4 };
  const interests = readInterests();
  interests[category] = Math.max(-20, Math.min(100, (interests[category] || 0) + (weights[action] || 1)));
  localStorage.setItem("syncwave_discover_interests", JSON.stringify(interests));
}

function topInterestCategory() {
  const entries = Object.entries(readInterests()).sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] || "all";
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export default function useDiscover() {
  const [meta, setMeta] = useState({ categories: [], languages: [] });
  const [filters, setFiltersState] = useState(storedFilters);
  const [feed, setFeed] = useState([]);
  const [feedPage, setFeedPage] = useState(0);
  const [feedNextPage, setFeedNextPage] = useState(0);
  const [reels, setReels] = useState([]);
  const [reelPageToken, setReelPageToken] = useState("");
  const [reelNextPageToken, setReelNextPageToken] = useState("");
  const [trending, setTrending] = useState({ hashtags: [], topics: [], articles: [], reels: [], searches: [] });
  const [bookmarks, setBookmarks] = useState({ articles: [], reels: [] });
  const [loading, setLoading] = useState({ feed: false, reels: false, meta: false });
  const [hasFetched, setHasFetched] = useState({ feed: false, reels: false });
  const [error, setError] = useState("");
  const [reelSearch, setReelSearch] = useState({ query: "", active: false, emptyMessage: "" });
  const sessionId = useRef(`discover_${Date.now()}_${Math.random().toString(16).slice(2)}`);
  const reelSearchSeq = useRef(0);

  const setFilters = useCallback((next) => {
    discoverLog("Filter", "selected", { categories: next.categories, languages: next.languages, date: next.date, sort: next.sort });
    setLoading((prev) => ({ ...prev, feed: true, reels: true }));
    setFiltersState(next);
    try {
      localStorage.setItem("syncwave_discover_filters", JSON.stringify(next));
    } catch (err) {
      // Preferences are best-effort only.
    }
  }, []);

  const feedQuery = useMemo(() => ({
    categories: filters.categories,
    languages: filters.languages,
    date: filters.date,
    sort: filters.sort,
  }), [filters]);

  const loadMeta = useCallback(async () => {
    discoverLog("Discover", "meta_request", {});
    setLoading((prev) => ({ ...prev, meta: true }));
    try {
      const data = await getDiscoverMeta();
      discoverLog("Discover", "meta_response", { categories: data.categories?.length || 0, languages: data.languages?.length || 0, searchLimit: data.quota?.max });
      setMeta(data);
    } catch (err) {
      discoverLog("Discover", "meta_error", { error: err.message });
      setError("Discover options are temporarily unavailable.");
    } finally {
      setLoading((prev) => ({ ...prev, meta: false }));
    }
  }, []);

  const loadFeed = useCallback(async ({ reset = false } = {}) => {
    const page = reset ? 0 : feedNextPage;
    if (page === null) return;
    console.log("[FEED REQUEST]", { reset, page, query: feedQuery });
    discoverLog("Feed", "request", { reset, page, query: feedQuery });
    setLoading((prev) => ({ ...prev, feed: true }));
    try {
      const data = await getDiscoverFeed({ ...feedQuery, page, limit: 10 });
      console.log("[RESPONSE]", data);
      console.log("[ARTICLE COUNT]", data.articles?.length || 0);
      discoverLog("Feed", "response", { reset, page, items: data.articles?.length || 0, nextPage: data.nextPage, fromLocalCache: data.fromLocalCache });
      setFeed((prev) => uniqueById(reset ? data.articles || [] : [...prev, ...(data.articles || [])]));
      setFeedPage(page);
      setFeedNextPage(data.nextPage);
      setHasFetched((prev) => ({ ...prev, feed: true }));
    } catch (err) {
      console.log("[ERROR]", err);
      discoverLog("Feed", "error", { page, error: err.message });
      setError("Feed is temporarily unavailable. Retry in a moment.");
    } finally {
      setLoading((prev) => ({ ...prev, feed: false }));
    }
  }, [feedNextPage, feedQuery]);

  const activeReelCategory = useMemo(() => {
    const selected = filters.categories?.[0] || "all";
    return selected === "for-you" ? topInterestCategory() : selected;
  }, [filters.categories]);

  const loadReels = useCallback(async ({ reset = false } = {}) => {
    const pageToken = reset ? "" : reelNextPageToken;
    if (!reset && pageToken === null) return;
    if (reset) reelSearchSeq.current += 1;
    console.log("[FILTER]", activeReelCategory);
    discoverLog("Reels", "request", { reset, category: activeReelCategory, pageToken });
    setLoading((prev) => ({ ...prev, reels: true }));
    try {
      const data = await getDiscoverReels({ category: activeReelCategory, pageToken, limit: 10 });
      console.log("[RESPONSE]", data);
      console.log("[REEL COUNT]", data.reels?.length || 0);
      discoverLog("Reels", "response", { reset, category: activeReelCategory, items: data.reels?.length || 0, nextPageToken: data.nextPageToken, source: data.recommendationSource, fromCache: data.fromCache, fromLocalCache: data.fromLocalCache });
      setReels((prev) => uniqueById(reset ? data.reels || [] : [...prev, ...(data.reels || [])]));
      setReelPageToken(pageToken);
      setReelNextPageToken(data.nextPageToken || null);
      setReelSearch({ query: "", active: false, emptyMessage: data.reels?.length ? "" : `No videos found for '${activeReelCategory}'` });
      setHasFetched((prev) => ({ ...prev, reels: true }));
    } catch (err) {
      console.log("[ERROR]", err);
      discoverLog("Reels", "error", { category: activeReelCategory, error: err.message });
      setError(err.message === "Network unavailable" ? "Network unavailable. Showing cached content when available." : "Reels are temporarily unavailable. Try again in a moment.");
    } finally {
      setLoading((prev) => ({ ...prev, reels: false }));
    }
  }, [activeReelCategory, reelNextPageToken]);

  const searchReels = useCallback(async (query) => {
    const clean = String(query || "").trim();
    const seq = reelSearchSeq.current + 1;
    reelSearchSeq.current = seq;
    discoverLog("Search", "reels_state_request", { query: clean });
    console.log("[SEARCH]", clean);
    if (!clean) {
      setReelSearch({ query: "", active: false, emptyMessage: "" });
      await loadReels({ reset: true });
      return { reels: [] };
    }
    setLoading((prev) => ({ ...prev, reels: true }));
    setError("");
    try {
      const data = await searchDiscoverReels(clean);
      const nextReels = uniqueById(data.reels || []);
      console.log("[RESPONSE]", data);
      console.log("[REEL COUNT]", nextReels.length);
      if (seq !== reelSearchSeq.current) {
        discoverLog("Search", "stale_response_ignored", { query: clean, seq, current: reelSearchSeq.current });
        return { ...data, reels: nextReels, stale: true };
      }
      discoverLog("Search", "reels_state_response", {
        query: clean,
        count: nextReels.length,
        source: data.recommendationSource,
        fromCache: data.fromCache,
        remaining: data.quota?.remaining,
      });
      setReels(nextReels);
      setReelPageToken("");
      setReelNextPageToken(data.nextPageToken || null);
      setReelSearch({
        query: clean,
        active: true,
        emptyMessage: nextReels.length ? "" : `No videos found for '${clean}'`,
      });
      if (!nextReels.length) console.log("[EMPTY]", `No videos found for '${clean}'`);
      setHasFetched((prev) => ({ ...prev, reels: true }));
      writeInterest(clean.toLowerCase(), "search");
      return { ...data, reels: nextReels };
    } catch (err) {
      console.log("[ERROR]", err);
      discoverLog("Search", "reels_state_error", { query: clean, status: err.status, error: err.message });
      if (err.status === 429) {
        setError("Search limit reached. Please try again tomorrow.");
      } else if (err.message === "Network unavailable") {
        setError("Network unavailable. Showing cached reels when available.");
      } else if (err.message === "Request timed out") {
        setError("API timeout. Retry when your connection is stable.");
      } else {
        setError("Network error. Retry search in a moment.");
      }
      throw err;
    } finally {
      setLoading((prev) => ({ ...prev, reels: false }));
    }
  }, [loadReels]);

  const reload = useCallback(() => {
    discoverLog("Discover", "reload", { category: activeReelCategory, feedQuery });
    setFeedNextPage(0);
    setReelNextPageToken("");
    setReelSearch({ query: "", active: false, emptyMessage: "" });
    loadFeed({ reset: true });
    loadReels({ reset: true });
    getDiscoverTrending().then(setTrending).catch(() => null);
    getDiscoverBookmarks().then(setBookmarks).catch(() => null);
  }, [loadFeed, loadReels]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { discoverLog("Discover", "mounted", {}); }, []);
  useEffect(() => { reload(); }, [feedQuery, activeReelCategory]);

  const refreshNews = useCallback(async () => {
    await refreshDiscoverNews({ categories: filters.categories, languages: filters.languages });
    await loadFeed({ reset: true });
  }, [filters.categories, filters.languages, loadFeed]);

  const interact = useCallback(async (type, id, action, item = {}, extra = {}) => {
    const optimistic = (row) => {
      if (row.id !== id) return row;
      const next = { ...row };
      if (action === "like") next.liked = true;
      if (action === "unlike") next.liked = false;
      if (action === "save") next.saved = true;
      if (action === "unsave") next.saved = false;
      return next;
    };
    if (type === "article") setFeed((prev) => prev.map(optimistic));
    if (type === "reel") setReels((prev) => prev.map(optimistic));
    writeInterest(item.category, action);
    discoverLog("Recommendation", "interaction", { type, id, action, category: item.category, seconds: extra.seconds, completionRate: extra.completionRate });
    await sendDiscoverInteraction(type, id, {
      action,
      category: item.category,
      language: item.language,
      sessionId: sessionId.current,
      ...extra,
    }).catch((err) => setError(err.message || "Action failed"));
  }, []);

  return {
    bookmarks,
    error,
    feed,
    feedPage,
    feedNextPage,
    filters,
    interact,
    loading,
    hasFetched,
    meta,
    reels,
    reelPage: reelPageToken,
    reelNextPage: reelNextPageToken,
    reelSearch,
    refreshNews,
    reload,
    searchReels,
    setError,
    setFilters,
    loadFeed,
    loadReels,
    trending,
  };
}

export { useDiscover };
