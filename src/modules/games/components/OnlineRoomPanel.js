import React, { useState } from "react";
import { useGames } from "../state/GamesContext";
import { PremiumCarrom, PremiumChess, PremiumLudo, PremiumTicTacToe } from "./PremiumGameSurfaces";

export default function OnlineRoomPanel({ selectedGame }) {
  const { activeRoom, createRoom, findMatch, joinRoom, syncRoomState } = useGames();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");

  const run = async (action) => {
    setMessage("");
    try {
      if (action === "create") await createRoom(selectedGame.id);
      if (action === "match") await findMatch(selectedGame.id);
      if (action === "join") await joinRoom(code);
      if (action === "spectate") await joinRoom(code, true);
    } catch (err) {
      setMessage(err.message || "Room action failed");
    }
  };

  const sendDemoMove = () => {
    syncRoomState({ lastMove: { by: "local", at: Date.now(), note: "Ready signal" } });
  };

  const Surface = {
    "ludo-online": PremiumLudo,
    "chess-online": PremiumChess,
    "carrom-online": PremiumCarrom,
    "tic-tac-toe-online": PremiumTicTacToe,
  }[selectedGame.id];

  return (
    <section className="games-panel online-room-panel">
      <div className="section-head">
        <div>
          <h2>{selectedGame.title}</h2>
          <p>Socket.IO matchmaking, rooms, invites, reconnects, state sync, and spectators.</p>
        </div>
      </div>
      <div className="room-actions">
        <button className="game-primary-action" type="button" onClick={() => run("match")}>Find Match</button>
        <button className="game-mini-action" type="button" onClick={() => run("create")}>Create Room</button>
        <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="ROOM CODE" />
        <button className="game-mini-action" type="button" onClick={() => run("join")}>Join</button>
        <button className="game-mini-action" type="button" onClick={() => run("spectate")}>Spectate</button>
      </div>
      {message && <div className="games-notice warn">{message}</div>}
      {activeRoom && (
        <div className="room-card">
          <div>
            <span className="panel-title">Room {activeRoom.code}</span>
            <strong>{activeRoom.status}</strong>
            <small>{activeRoom.players?.length || 0}/{activeRoom.maxPlayers} players / {activeRoom.spectators?.length || 0} spectators / v{activeRoom.version}</small>
          </div>
          <button className="game-mini-action" type="button" onClick={sendDemoMove}>Sync Ready</button>
          <div className="room-players">
            {(activeRoom.players || []).map((player) => (
              <span key={player.userId}>{player.displayName || player.username} / {player.status}</span>
            ))}
          </div>
        </div>
      )}
      {Surface && (
        <div className="online-surface-shell">
          <Surface gameId={selectedGame.id} online />
        </div>
      )}
    </section>
  );
}
