import React, { useMemo, useState } from "react";
import GameRail from "../components/GameRail";
import LeaderboardPanel from "../components/LeaderboardPanel";
import OfflineGameRunner from "../components/OfflineGameRunner";
import OnlineRoomPanel from "../components/OnlineRoomPanel";
import ProfileStrip from "../components/ProfileStrip";
import RewardsPanel from "../components/RewardsPanel";
import StatsPanel from "../components/StatsPanel";
import { featuredGames, offlineGames, onlineGames, trendingGames, gameById } from "../data/catalog";
import { useGames } from "../state/GamesContext";

export default function GamesHome() {
  const { catalog, profile, recentlyPlayed, status } = useGames();
  const [activeView, setActiveView] = useState("home");
  const [selectedGameId, setSelectedGameId] = useState("");

  const groups = useMemo(() => {
    const source = catalog?.length ? catalog : [];
    return {
      featured: source.filter((game) => game.featured).length ? source.filter((game) => game.featured) : featuredGames,
      offline: source.filter((game) => game.category === "offline").length ? source.filter((game) => game.category === "offline") : offlineGames,
      online: source.filter((game) => game.category === "online").length ? source.filter((game) => game.category === "online") : onlineGames,
      trending: [...(source.length ? source : trendingGames)].sort((a, b) => b.trendingScore - a.trendingScore).slice(0, 8),
    };
  }, [catalog]);

  const recentGames = recentlyPlayed
    .map((item) => gameById(item.gameId) || groups.featured.find((game) => game.id === item.gameId))
    .filter(Boolean)
    .filter((game, index, arr) => arr.findIndex((candidate) => candidate.id === game.id) === index);

  const openGame = (game) => {
    setSelectedGameId(game.id);
    setActiveView(game.category === "online" ? "online" : "offline");
  };

  const openOnline = (game) => {
    setSelectedGameId(game.id);
    setActiveView("online");
  };

  const selectedGame = gameById(selectedGameId) || groups.online[0];

  return (
    <div className="games-page">
      <section className="games-hero">
        <div>
          <span className="panel-title">Games Hub</span>
          <h1>Play, compete, and keep progress synced.</h1>
          <p>Offline games run locally on Android, iOS, and web. Online tables use Socket.IO rooms with matchmaking, reconnects, spectators, and live state sync.</p>
          <div className="games-hero-actions">
            <button className={`game-tab ${activeView === "home" ? "active" : ""}`} onClick={() => setActiveView("home")}>Hub</button>
            <button className={`game-tab ${activeView === "stats" ? "active" : ""}`} onClick={() => setActiveView("stats")}>Stats</button>
            <button className={`game-tab ${activeView === "leaderboard" ? "active" : ""}`} onClick={() => setActiveView("leaderboard")}>Ranks</button>
            <button className={`game-tab ${activeView === "rewards" ? "active" : ""}`} onClick={() => setActiveView("rewards")}>Rewards</button>
          </div>
        </div>
        <div className="games-hero-board" aria-hidden="true">
          <span>2048</span><span>XO</span><span>CH</span><span>SK</span>
        </div>
      </section>

      <ProfileStrip
        profile={profile}
        status={status}
        onRewards={() => setActiveView("rewards")}
        onLeaderboard={() => setActiveView("leaderboard")}
      />

      {status?.error && <div className="games-notice">{status.error}</div>}

      {activeView === "home" && (
        <>
          <GameRail title="Featured Games" subtitle="Fast picks across puzzle, arcade, and competitive tables." games={groups.featured} onPlay={openGame} onOnline={openOnline} />
          <GameRail title="Online Multiplayer Games" subtitle="Matchmaking, rooms, invites, reconnects, spectators, and live state sync." games={groups.online} onPlay={openGame} onOnline={openOnline} />
          <GameRail title="Offline Games" subtitle="Playable without internet with local saves and online sync later." games={groups.offline} onPlay={openGame} />
          <GameRail title="Recently Played" subtitle="Your latest synced or local sessions." games={recentGames} compact onPlay={openGame} onOnline={openOnline} />
          <GameRail title="Trending Games" subtitle="Sorted by current SyncWave gaming momentum." games={groups.trending} compact onPlay={openGame} onOnline={openOnline} />
        </>
      )}

      {activeView === "offline" && <OfflineGameRunner gameId={selectedGameId} onBack={() => setActiveView("home")} />}
      {activeView === "online" && selectedGame && <OnlineRoomPanel selectedGame={selectedGame} />}
      {activeView === "leaderboard" && <LeaderboardPanel />}
      {activeView === "rewards" && <RewardsPanel />}
      {activeView === "stats" && <StatsPanel />}
    </div>
  );
}
