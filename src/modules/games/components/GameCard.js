import React from "react";

export default function GameCard({ game, compact = false, onPlay, onOnline }) {
  return (
    <button className={`game-card ${compact ? "compact" : ""}`} style={{ "--game-accent": game.accent || "#31d07f" }} onClick={() => onPlay?.(game)} type="button">
      <span className="game-card-art" aria-hidden="true">
        <span>{game.title.split(" ").map((word) => word[0]).join("").slice(0, 3)}</span>
      </span>
      <span className="game-card-body">
        <strong>{game.title}</strong>
        <small>{game.difficulty} / {game.players} players</small>
        {!compact && <em>{game.description}</em>}
      </span>
      {game.category === "online" && (
        <span className="game-card-actions" onClick={(event) => event.stopPropagation()}>
          <button type="button" onClick={() => onOnline?.(game, "match")}>Match</button>
          <button type="button" onClick={() => onOnline?.(game, "room")}>Room</button>
        </span>
      )}
    </button>
  );
}
