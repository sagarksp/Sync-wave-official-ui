import React from "react";

export default function ProfileStrip({ profile, status, onRewards, onLeaderboard }) {
  const nextLevelXp = Math.max(125, (profile.level || 1) * (profile.level || 1) * 125);
  const pct = Math.min(100, Math.round(((profile.xp || 0) / nextLevelXp) * 100));
  return (
    <section className="games-profile-strip">
      <div className="games-avatar">
        {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : <span>{(profile.displayName || profile.username || "P").slice(0, 2).toUpperCase()}</span>}
      </div>
      <div className="games-profile-main">
        <span className="panel-title">Player Profile</span>
        <strong>{profile.displayName || profile.username || "Player"}</strong>
        <div className="games-xp-track"><span style={{ width: `${pct}%` }} /></div>
        <small>Level {profile.level || 1} / {profile.xp || 0} XP {status?.syncing ? "/ syncing progress" : ""}</small>
      </div>
      <div className="games-wallet">
        <strong>{profile.coins || 0}</strong>
        <span>Coins</span>
      </div>
      <button className="game-mini-action" type="button" onClick={onRewards}>Rewards</button>
      <button className="game-mini-action" type="button" onClick={onLeaderboard}>Ranks</button>
    </section>
  );
}
