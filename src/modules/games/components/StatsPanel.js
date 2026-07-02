import React, { useEffect } from "react";
import { useGames } from "../state/GamesContext";
import { gameById } from "../data/catalog";

export default function StatsPanel() {
  const { history, loadHistory, profile } = useGames();

  useEffect(() => {
    loadHistory().catch(() => {});
  }, [loadHistory]);

  const allStats = Object.entries(profile.statsByGame || {});
  return (
    <section className="games-panel">
      <div className="section-head">
        <div>
          <h2>Game Statistics</h2>
          <p>Wins, losses, draws, win rate, and recent match history.</p>
        </div>
      </div>
      <div className="stats-grid">
        {allStats.length ? allStats.map(([gameId, stats]) => (
          <div className="stat-card" key={gameId}>
            <span>{gameById(gameId)?.title || gameId}</span>
            <strong>{stats.winRate || 0}%</strong>
            <small>{stats.wins || 0}W / {stats.losses || 0}L / {stats.draws || 0}D / {stats.totalGamesPlayed || 0} played</small>
          </div>
        )) : <div className="games-empty">Play any game to start building your profile.</div>}
      </div>
      <div className="match-history-list">
        {history.slice(0, 12).map((match) => (
          <div className="match-row" key={match._id || `${match.gameId}-${match.endedAt}`}>
            <strong>{gameById(match.gameId)?.title || match.gameId}</strong>
            <span>{match.mode} / {match.status}</span>
            <small>{new Date(match.endedAt).toLocaleString()}</small>
          </div>
        ))}
      </div>
    </section>
  );
}
