export const GAME_CATALOG = [
  { id: "snake", title: "Snake", category: "offline", players: "1", difficulty: "Casual", featured: true, trendingScore: 93, accent: "#31d07f", description: "Grow the longest wave without crashing into yourself." },
  { id: "snake-ladder", title: "Snake & Ladder", category: "offline", players: "1-4", difficulty: "Classic", featured: true, trendingScore: 88, accent: "#f7b955", description: "Race to tile 100 while ladders lift and snakes punish bad rolls." },
  { id: "tic-tac-toe", title: "Tic Tac Toe", category: "offline", players: "1-2", difficulty: "Quick", featured: false, trendingScore: 81, accent: "#8b5cf6", description: "Beat the local AI or pass-and-play with a friend." },
  { id: "chess-ai", title: "Chess vs AI", category: "offline", players: "1", difficulty: "Strategic", featured: true, trendingScore: 90, accent: "#08c7d9", description: "A compact chess duel with legal piece movement and instant AI replies." },
  { id: "carrom", title: "Carrom", category: "offline", players: "1-2", difficulty: "Skill", featured: false, trendingScore: 76, accent: "#ef6f6c", description: "Aim, pocket coins, and manage your striker power." },
  { id: "sudoku", title: "Sudoku", category: "offline", players: "1", difficulty: "Logic", featured: false, trendingScore: 84, accent: "#67e8f9", description: "Solve a clean mobile-friendly number grid with conflict checks." },
  { id: "memory-match", title: "Memory Match", category: "offline", players: "1", difficulty: "Focus", featured: false, trendingScore: 79, accent: "#a3e635", description: "Flip tiles, remember positions, and clear the board fast." },
  { id: "2048", title: "2048", category: "offline", players: "1", difficulty: "Puzzle", featured: true, trendingScore: 92, accent: "#f59e0b", description: "Merge tiles toward 2048 with swipe and keyboard controls." },
  { id: "flappy-wave", title: "Flappy Bird Clone", category: "offline", players: "1", difficulty: "Arcade", featured: false, trendingScore: 86, accent: "#60a5fa", description: "Tap through gates in a neon side-scroller." },
  { id: "ludo-online", title: "Ludo Online", category: "online", players: "2-4", difficulty: "Classic", featured: true, trendingScore: 96, accent: "#f43f5e", description: "Create, join, invite, spectate, and sync a four-player room." },
  { id: "chess-online", title: "Chess Online", category: "online", players: "2", difficulty: "Competitive", featured: true, trendingScore: 97, accent: "#22d3ee", description: "A real-time chess table with reconnect and spectator support." },
  { id: "carrom-online", title: "Carrom Online", category: "online", players: "2", difficulty: "Skill", featured: false, trendingScore: 89, accent: "#fb7185", description: "Online carrom table with room-based state sync." },
  { id: "tic-tac-toe-online", title: "Tic Tac Toe Online", category: "online", players: "2", difficulty: "Quick", featured: false, trendingScore: 82, accent: "#c084fc", description: "Fast online noughts and crosses with spectators." },
];

export const DEFAULT_ACHIEVEMENTS = [
  { key: "first_win", title: "First Victory", description: "Win your first SyncWave game.", icon: "Crown", trigger: { metric: "wins", target: 1 }, reward: { coins: 75, xp: 100 } },
  { key: "ten_matches", title: "Table Regular", description: "Play ten games across the hub.", icon: "Spark", trigger: { metric: "totalGamesPlayed", target: 10 }, reward: { coins: 120, xp: 180 } },
  { key: "five_streak", title: "Hot Streak", description: "Win five games in a row.", icon: "Fire", trigger: { metric: "winStreak", target: 5 }, reward: { coins: 220, xp: 350 } },
  { key: "puzzle_climber", title: "Puzzle Climber", description: "Score 1024 or higher in 2048.", icon: "Tile", trigger: { metric: "bestScore", target: 1024 }, reward: { coins: 160, xp: 240 } },
  { key: "snake_charmer", title: "Snake Charmer", description: "Score 25 points in Snake.", icon: "Route", trigger: { metric: "bestScore", target: 25 }, reward: { coins: 140, xp: 220 } },
];

export const gameById = (id) => GAME_CATALOG.find((game) => game.id === id);
export const featuredGames = GAME_CATALOG.filter((game) => game.featured);
export const offlineGames = GAME_CATALOG.filter((game) => game.category === "offline");
export const onlineGames = GAME_CATALOG.filter((game) => game.category === "online");
export const trendingGames = [...GAME_CATALOG].sort((a, b) => b.trendingScore - a.trendingScore).slice(0, 8);
