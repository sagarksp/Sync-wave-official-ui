const PROFILE_KEY = "syncwave_games_profile";
const MATCH_QUEUE_KEY = "syncwave_games_offline_matches";
const SAVE_PREFIX = "syncwave_game_save_";

export function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}

export function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function createLocalProfile(auth) {
  return {
    userId: auth?.user?.id || "local",
    username: auth?.user?.username || "player",
    displayName: auth?.user?.displayName || auth?.user?.username || "Player",
    avatarUrl: auth?.user?.avatarUrl || "",
    coins: 250,
    xp: 0,
    level: 1,
    statsByGame: {},
    achievements: [],
    dailyReward: {},
  };
}

export function loadLocalProfile(auth) {
  return { ...createLocalProfile(auth), ...readJson(PROFILE_KEY, {}) };
}

export function saveLocalProfile(profile) {
  writeJson(PROFILE_KEY, profile);
}

export function queueOfflineMatch(match) {
  const items = readJson(MATCH_QUEUE_KEY, []);
  const next = [...items, { ...match, localId: match.localId || `${Date.now()}_${Math.random().toString(16).slice(2)}` }].slice(-80);
  writeJson(MATCH_QUEUE_KEY, next);
  return next;
}

export function getQueuedOfflineMatches() {
  return readJson(MATCH_QUEUE_KEY, []);
}

export function clearQueuedOfflineMatches(ids = []) {
  if (!ids.length) {
    writeJson(MATCH_QUEUE_KEY, []);
    return;
  }
  const remove = new Set(ids);
  writeJson(MATCH_QUEUE_KEY, getQueuedOfflineMatches().filter((match) => !remove.has(match.localId)));
}

export function saveGameProgress(gameId, state) {
  writeJson(`${SAVE_PREFIX}${gameId}`, { state, savedAt: Date.now() });
}

export function loadGameProgress(gameId, fallback = null) {
  return readJson(`${SAVE_PREFIX}${gameId}`, fallback);
}

export function clearGameProgress(gameId) {
  localStorage.removeItem(`${SAVE_PREFIX}${gameId}`);
}

export function applyLocalMatch(profile, match, catalogGame) {
  const result = ["win", "loss", "draw"].includes(match.result) ? match.result : "win";
  const stats = profile.statsByGame?.[match.gameId] || {};
  const totalGamesPlayed = (stats.totalGamesPlayed || 0) + 1;
  const wins = (stats.wins || 0) + (result === "win" ? 1 : 0);
  const losses = (stats.losses || 0) + (result === "loss" ? 1 : 0);
  const draws = (stats.draws || 0) + (result === "draw" ? 1 : 0);
  const baseCoins = catalogGame?.category === "online" ? 22 : 14;
  const baseXp = catalogGame?.category === "online" ? 34 : 22;
  const coins = result === "win" ? baseCoins : Math.ceil(baseCoins * 0.45);
  const xp = result === "win" ? baseXp : Math.ceil(baseXp * 0.6);
  const nextXp = (profile.xp || 0) + xp;
  return {
    ...profile,
    coins: (profile.coins || 0) + coins,
    xp: nextXp,
    level: Math.max(1, Math.floor(Math.sqrt(nextXp / 125)) + 1),
    statsByGame: {
      ...(profile.statsByGame || {}),
      [match.gameId]: {
        ...stats,
        wins,
        losses,
        draws,
        totalGamesPlayed,
        winRate: Math.round((wins / totalGamesPlayed) * 100),
        winStreak: result === "win" ? (stats.winStreak || 0) + 1 : 0,
        bestScore: Math.max(stats.bestScore || 0, Number(match.score) || 0),
        lastPlayedAt: match.endedAt || new Date().toISOString(),
      },
    },
  };
}
