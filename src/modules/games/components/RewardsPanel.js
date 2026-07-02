import React, { useState } from "react";
import { useGames } from "../state/GamesContext";

export default function RewardsPanel() {
  const { achievements, claimDailyReward, profile } = useGames();
  const [message, setMessage] = useState("");

  const claim = async () => {
    setMessage("");
    try {
      const reward = await claimDailyReward();
      setMessage(`Claimed ${reward.coins} coins and ${reward.xp} XP. Streak ${reward.streak}.`);
    } catch (err) {
      setMessage(err.message || "Reward unavailable.");
    }
  };

  const unlocked = new Set((profile.achievements || []).filter((item) => item.unlocked).map((item) => item.key));
  return (
    <section className="games-panel">
      <div className="section-head">
        <div>
          <h2>Rewards</h2>
          <p>Daily coins, XP, levels, and achievements.</p>
        </div>
        <button className="game-primary-action" type="button" onClick={claim}>Claim Daily</button>
      </div>
      {message && <div className="games-notice">{message}</div>}
      <div className="achievement-grid">
        {achievements.map((item) => (
          <div className={`achievement-card ${unlocked.has(item.key) ? "unlocked" : ""}`} key={item.key}>
            <span>{item.icon || "Badge"}</span>
            <strong>{item.title}</strong>
            <small>{item.description}</small>
            <em>{item.reward?.coins || 0} coins / {item.reward?.xp || 0} XP</em>
          </div>
        ))}
      </div>
    </section>
  );
}
