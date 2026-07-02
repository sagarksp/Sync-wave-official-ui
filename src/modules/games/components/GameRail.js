import React from "react";
import GameCard from "./GameCard";

export default function GameRail({ title, subtitle, games, compact, onPlay, onOnline }) {
  if (!games?.length) return null;
  return (
    <section className="games-section">
      <div className="section-head compact-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      <div className="games-rail">
        {games.map((game) => (
          <GameCard key={game.id} game={game} compact={compact} onPlay={onPlay} onOnline={onOnline} />
        ))}
      </div>
    </section>
  );
}
