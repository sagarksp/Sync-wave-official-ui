import React, { useState } from "react";
import useDiscover from "../../../store/discover/useDiscover";
import DiscoverSearch from "../components/DiscoverSearch";
import DiscoverAdminPanel from "../components/DiscoverAdminPanel";
import FeedTab from "../components/FeedTab";
import ReelsTab from "../components/ReelsTab";

export default function DiscoverHome() {
  const discover = useDiscover();
  const [tab, setTab] = useState("feed");

  return (
    <div className={`discover-page discover-page-${tab}`}>
      <header className="discover-head">
        <div>
          <div className="panel-title">Discover</div>
          <h1>Stories, reels, and trends tuned to you</h1>
        </div>
        <div className="discover-tabs" role="tablist">
          <button className={tab === "feed" ? "active" : ""} type="button" onClick={() => setTab("feed")}>Feed</button>
          <button className={tab === "reels" ? "active" : ""} type="button" onClick={() => setTab("reels")}>Reels</button>
        </div>
        <DiscoverAdminPanel />
      </header>
      <DiscoverSearch discover={discover} onShowReels={() => setTab("reels")} />
      {discover.error && <button className="discover-error" type="button" onClick={() => discover.setError("")}>{discover.error}</button>}
      {tab === "feed" ? <FeedTab discover={discover} /> : <ReelsTab discover={discover} />}
    </div>
  );
}
