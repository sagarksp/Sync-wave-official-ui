import React, { useEffect, useState } from "react";
import { useGames } from "../state/GamesContext";

export default function LeaderboardPanel({ gameId = "all" }) {
  const { leaderboard, loadLeaderboard } = useGames();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    loadLeaderboard(gameId).finally(() => setLoading(false));
  }, [gameId, loadLeaderboard]);

  return (
    <section className="games-panel">
      <div className="section-head">
        <div>
          <h2>Leaderboard</h2>
          <p>Ranked by rating, XP, and match volume.</p>
        </div>
      </div>
      {loading && <div className="games-empty">Loading rankings...</div>}
      {!loading && !leaderboard.length && <div className="games-empty">No ranked matches yet. Online wins will appear here.</div>}
      <div className="leaderboard-list">
        {leaderboard.map((row) => (
          <div className="leaderboard-row" key={`${row.gameId}-${row.userId}`}>
            <span className="rank">#{row.rank}</span>
            <div>
              <strong>{row.displayName || row.username}</strong>
              <small>{row.gameId} / {row.winRate}% win rate</small>
            </div>
            <b>{row.rating}</b>
          </div>
        ))}
      </div>
    </section>
  );
}
