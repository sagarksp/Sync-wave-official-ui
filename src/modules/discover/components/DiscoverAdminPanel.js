import React, { useEffect, useState } from "react";
import { getDiscoverAdminDashboard, refreshDiscoverCache } from "../../../services/discover/discoverApi";

export default function DiscoverAdminPanel() {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    getDiscoverAdminDashboard().then((data) => setStats(data.stats)).catch(() => null);
  }, [open]);

  return (
    <div className="discover-admin">
      <button type="button" className="discover-admin-toggle" onClick={() => setOpen((value) => !value)}>Admin</button>
      {open && (
        <div className="discover-admin-panel">
          <div className="discover-comments-head">
            <strong>Discover Ops</strong>
            <button type="button" onClick={() => setOpen(false)}>Close</button>
          </div>
          <div className="discover-admin-grid">
            <div><strong>{stats?.usageToday ?? "-"}</strong><span>API usage today</span></div>
            <div><strong>{stats?.cacheSize ?? "-"}</strong><span>Cached videos</span></div>
            <div><strong>{stats?.apiHealth || "-"}</strong><span>API health</span></div>
            <div><strong>{stats?.activeUsers ?? "-"}</strong><span>Active users</span></div>
          </div>
          <button
            type="button"
            className="discover-refresh"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              refreshDiscoverCache().then((data) => setStats(data.stats)).finally(() => setLoading(false));
            }}
          >
            {loading ? "Refreshing cache" : "Refresh Cache"}
          </button>
          <div className="discover-mini-list">
            {(stats?.mostSearchedKeywords || []).slice(0, 6).map((item) => <span key={item.query}>{item.query} · {item.count}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}
