import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gameById } from "../data/catalog";
import { clearGameProgress, loadGameProgress, saveGameProgress } from "../offline/storage";
import { useGames } from "../state/GamesContext";
import { PremiumCarrom, PremiumChess, PremiumSnake, PremiumSnakeLadder, PremiumTicTacToe } from "./PremiumGameSurfaces";

const ticWins = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const sudokuPuzzle = "530070000600195000098000060800060003400803001700020006060000280000419005000080079";
const sudokuSolution = "534678912672195348198342567859761423426853791713924856961537284287419635345286179";

function complete(recordOfflineMatch, gameId, result, score, finalState = {}) {
  recordOfflineMatch({ gameId, result, score, finalState, durationSeconds: 0 });
  clearGameProgress(gameId);
}

function TicTacToe({ gameId }) {
  const { recordOfflineMatch } = useGames();
  const [board, setBoard] = useState(() => loadGameProgress(gameId, { state: Array(9).fill("") })?.state || Array(9).fill(""));
  const winner = ticWins.find((line) => board[line[0]] && line.every((i) => board[i] === board[line[0]]));
  const full = board.every(Boolean);

  useEffect(() => saveGameProgress(gameId, board), [board, gameId]);
  const move = (index) => {
    if (board[index] || winner || full) return;
    const next = [...board];
    next[index] = "X";
    const aiWin = ticWins.flatMap((line) => {
      const values = line.map((i) => next[i]);
      return values.filter((v) => v === "O").length === 2 && values.includes("") ? line.filter((i) => !next[i]) : [];
    })[0];
    const block = ticWins.flatMap((line) => {
      const values = line.map((i) => next[i]);
      return values.filter((v) => v === "X").length === 2 && values.includes("") ? line.filter((i) => !next[i]) : [];
    })[0];
    const ai = aiWin ?? block ?? [4, 0, 2, 6, 8, 1, 3, 5, 7].find((i) => !next[i]);
    if (ai !== undefined && !ticWins.find((line) => next[line[0]] && line.every((i) => next[i] === next[line[0]]))) next[ai] = "O";
    setBoard(next);
  };
  useEffect(() => {
    if (winner) complete(recordOfflineMatch, gameId, board[winner[0]] === "X" ? "win" : "loss", board[winner[0]] === "X" ? 100 : 20, { board });
    else if (full) complete(recordOfflineMatch, gameId, "draw", 50, { board });
  }, [winner, full]);
  return <div className="ttt-board">{board.map((cell, i) => <button key={i} onClick={() => move(i)}>{cell}</button>)}</div>;
}

function Snake({ gameId }) {
  const { recordOfflineMatch } = useGames();
  const [snake, setSnake] = useState([[6, 6], [5, 6]]);
  const [food, setFood] = useState([12, 8]);
  const [dir, setDir] = useState([1, 0]);
  const [score, setScore] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const key = (event) => {
      if (event.key === "ArrowUp") setDir([0, -1]);
      if (event.key === "ArrowDown") setDir([0, 1]);
      if (event.key === "ArrowLeft") setDir([-1, 0]);
      if (event.key === "ArrowRight") setDir([1, 0]);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => {
      setSnake((prev) => {
        const head = [(prev[0][0] + dir[0] + 16) % 16, (prev[0][1] + dir[1] + 16) % 16];
        if (prev.some(([x, y]) => x === head[0] && y === head[1])) {
          complete(recordOfflineMatch, gameId, score >= 10 ? "win" : "loss", score, { score });
          setRunning(false);
          return [[6, 6], [5, 6]];
        }
        const ate = head[0] === food[0] && head[1] === food[1];
        if (ate) {
          setScore((s) => s + 1);
          setFood([Math.floor(Math.random() * 16), Math.floor(Math.random() * 16)]);
        }
        return [head, ...prev].slice(0, ate ? prev.length + 1 : prev.length);
      });
    }, 150);
    return () => clearInterval(timer);
  }, [dir, food, gameId, recordOfflineMatch, running, score]);
  return (
    <div className="arcade-wrap">
      <div className="game-score">Score {score}</div>
      <div className="snake-grid">{Array.from({ length: 256 }).map((_, i) => {
        const x = i % 16;
        const y = Math.floor(i / 16);
        const active = snake.some(([sx, sy]) => sx === x && sy === y);
        const isFood = food[0] === x && food[1] === y;
        return <button key={i} className={`${active ? "snake-cell" : ""} ${isFood ? "food-cell" : ""}`} onClick={() => setRunning(true)} />;
      })}</div>
      <div className="direction-pad">
        <button onClick={() => setDir([0, -1])}>Up</button><button onClick={() => setDir([-1, 0])}>Left</button><button onClick={() => setRunning((v) => !v)}>{running ? "Pause" : "Start"}</button><button onClick={() => setDir([1, 0])}>Right</button><button onClick={() => setDir([0, 1])}>Down</button>
      </div>
    </div>
  );
}

function Game2048({ gameId }) {
  const { recordOfflineMatch } = useGames();
  const empty = () => Array(16).fill(0);
  const addTile = (cells) => {
    const open = cells.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    if (!open.length) return cells;
    const next = [...cells];
    next[open[Math.floor(Math.random() * open.length)]] = Math.random() > 0.85 ? 4 : 2;
    return next;
  };
  const [cells, setCells] = useState(() => loadGameProgress(gameId, { state: addTile(addTile(empty())) })?.state || addTile(addTile(empty())));
  const score = cells.reduce((sum, value) => sum + value, 0);
  useEffect(() => saveGameProgress(gameId, cells), [cells, gameId]);
  const slide = (line) => {
    const nums = line.filter(Boolean);
    for (let i = 0; i < nums.length - 1; i += 1) if (nums[i] === nums[i + 1]) { nums[i] *= 2; nums.splice(i + 1, 1); }
    return [...nums, ...Array(4 - nums.length).fill(0)];
  };
  const move = (direction) => {
    let rows = [0, 1, 2, 3].map((r) => cells.slice(r * 4, r * 4 + 4));
    if (direction === "up" || direction === "down") rows = [0, 1, 2, 3].map((c) => [cells[c], cells[c + 4], cells[c + 8], cells[c + 12]]);
    const nextRows = rows.map((row) => (direction === "right" || direction === "down" ? slide([...row].reverse()).reverse() : slide(row)));
    let next = empty();
    if (direction === "left" || direction === "right") next = nextRows.flat();
    else nextRows.forEach((row, c) => row.forEach((v, r) => { next[r * 4 + c] = v; }));
    if (JSON.stringify(next) !== JSON.stringify(cells)) setCells(addTile(next));
    if (next.includes(2048)) complete(recordOfflineMatch, gameId, "win", score, { cells: next });
  };
  return <div className="game-2048"><div className="game-score">Score {score}</div><div className="tile-grid">{cells.map((v, i) => <button key={i} className={`tile-v${v}`}>{v || ""}</button>)}</div><div className="direction-pad"><button onClick={() => move("up")}>Up</button><button onClick={() => move("left")}>Left</button><button onClick={() => move("right")}>Right</button><button onClick={() => move("down")}>Down</button></div></div>;
}

function MemoryMatch({ gameId }) {
  const { recordOfflineMatch } = useGames();
  const deck = useMemo(() => [..."AABBCCDDEEFFGGHH"].sort(() => Math.random() - 0.5), []);
  const [open, setOpen] = useState([]);
  const [matched, setMatched] = useState([]);
  const [moves, setMoves] = useState(0);
  const flip = (i) => {
    if (open.includes(i) || matched.includes(i) || open.length === 2) return;
    const next = [...open, i];
    setOpen(next);
    if (next.length === 2) {
      setMoves((m) => m + 1);
      window.setTimeout(() => {
        if (deck[next[0]] === deck[next[1]]) setMatched((prev) => [...prev, ...next]);
        setOpen([]);
      }, 620);
    }
  };
  useEffect(() => {
    if (matched.length === deck.length) complete(recordOfflineMatch, gameId, "win", Math.max(10, 200 - moves * 5), { moves });
  }, [matched.length]);
  return <div><div className="game-score">Moves {moves}</div><div className="memory-grid">{deck.map((card, i) => <button key={i} onClick={() => flip(i)}>{open.includes(i) || matched.includes(i) ? card : ""}</button>)}</div></div>;
}

function Sudoku({ gameId }) {
  const { recordOfflineMatch } = useGames();
  const fixed = sudokuPuzzle.split("").map((v) => v !== "0");
  const [cells, setCells] = useState(() => loadGameProgress(gameId, { state: sudokuPuzzle.split("").map((v) => (v === "0" ? "" : v)) })?.state);
  const setValue = (i, value) => {
    if (fixed[i]) return;
    const next = [...cells];
    next[i] = value.replace(/[^1-9]/g, "").slice(0, 1);
    setCells(next);
    if (next.join("") === sudokuSolution) complete(recordOfflineMatch, gameId, "win", 300, { cells: next });
  };
  useEffect(() => saveGameProgress(gameId, cells), [cells, gameId]);
  return <div className="sudoku-grid">{cells.map((cell, i) => <input key={i} className={fixed[i] ? "fixed" : cell && cell !== sudokuSolution[i] ? "bad" : ""} value={cell} onChange={(e) => setValue(i, e.target.value)} />)}</div>;
}

function SnakeLadder({ gameId }) {
  const { recordOfflineMatch } = useGames();
  const [pos, setPos] = useState(1);
  const [roll, setRoll] = useState(0);
  const jumps = { 4: 25, 13: 46, 33: 49, 42: 63, 50: 69, 27: 5, 40: 3, 54: 31, 76: 58, 89: 53, 99: 41 };
  const play = () => {
    const dice = Math.floor(Math.random() * 6) + 1;
    setRoll(dice);
    const next = Math.min(100, jumps[Math.min(100, pos + dice)] || Math.min(100, pos + dice));
    setPos(next);
    if (next >= 100) complete(recordOfflineMatch, gameId, "win", 100, { pos: next });
  };
  return <div><div className="game-score">Tile {pos} / Last roll {roll}</div><div className="ladder-board">{Array.from({ length: 100 }).map((_, i) => <span key={i} className={i + 1 === pos ? "active" : jumps[i + 1] ? "jump" : ""}>{i + 1}</span>)}</div><button className="game-primary-action" onClick={play}>Roll Dice</button></div>;
}

function ChessLite({ gameId }) {
  const { recordOfflineMatch } = useGames();
  const start = ["r", "n", "b", "q", "k", "b", "n", "r", "p", "p", "p", "p", "p", "p", "p", "p", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "P", "P", "P", "P", "P", "P", "P", "P", "R", "N", "B", "Q", "K", "B", "N", "R"];
  const [board, setBoard] = useState(start);
  const [sel, setSel] = useState(null);
  const move = (i) => {
    if (sel === null) {
      if (/[A-Z]/.test(board[i])) setSel(i);
      return;
    }
    const next = [...board];
    if (i !== sel && !/[A-Z]/.test(next[i])) {
      next[i] = next[sel];
      next[sel] = "";
      const aiFrom = next.findIndex((p) => /[a-z]/.test(p));
      const aiTo = aiFrom >= 0 ? Math.min(63, aiFrom + 8) : -1;
      if (aiFrom >= 0 && aiTo >= 0 && !/[a-z]/.test(next[aiTo])) { next[aiTo] = next[aiFrom]; next[aiFrom] = ""; }
      if (!next.includes("k")) complete(recordOfflineMatch, gameId, "win", 500, { board: next });
      if (!next.includes("K")) complete(recordOfflineMatch, gameId, "loss", 80, { board: next });
      setBoard(next);
    }
    setSel(null);
  };
  return <div className="chess-board">{board.map((piece, i) => <button key={i} className={sel === i ? "selected" : ""} onClick={() => move(i)}>{piece}</button>)}</div>;
}

function Carrom({ gameId }) {
  const { recordOfflineMatch } = useGames();
  const [coins, setCoins] = useState(9);
  const [power, setPower] = useState(50);
  const strike = () => {
    const pocketed = Math.random() * 100 < power ? 1 : 0;
    const next = Math.max(0, coins - pocketed);
    setCoins(next);
    if (!next) complete(recordOfflineMatch, gameId, "win", 180, { coins: 0 });
  };
  return <div className="carrom-board"><div className="carrom-pocket p1" /><div className="carrom-pocket p2" /><div className="carrom-pocket p3" /><div className="carrom-pocket p4" /><div className="carrom-coins">{Array.from({ length: coins }).map((_, i) => <span key={i} />)}</div><input type="range" min="10" max="95" value={power} onChange={(e) => setPower(Number(e.target.value))} /><button className="game-primary-action" onClick={strike}>Strike {power}%</button></div>;
}

function Flappy({ gameId }) {
  const { recordOfflineMatch } = useGames();
  const canvasRef = useRef(null);
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const bird = useRef({ y: 120, vy: 0, pipes: [330, 520] });
  const flap = useCallback(() => { bird.current.vy = -5.2; setRunning(true); }, []);
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const b = bird.current;
      b.vy += 0.42;
      b.y += b.vy;
      b.pipes = b.pipes.map((x) => (x < -48 ? 360 : x - 3));
      setScore((s) => s + 1);
      ctx.clearRect(0, 0, 360, 240);
      ctx.fillStyle = "#07111f"; ctx.fillRect(0, 0, 360, 240);
      ctx.fillStyle = "#60a5fa"; ctx.fillRect(74, b.y, 22, 22);
      ctx.fillStyle = "#31d07f";
      b.pipes.forEach((x, idx) => { const gap = idx % 2 ? 92 : 128; ctx.fillRect(x, 0, 36, gap - 42); ctx.fillRect(x, gap + 42, 36, 240); });
      if (b.y < 0 || b.y > 218 || b.pipes.some((x, idx) => x < 96 && x + 36 > 74 && (b.y < (idx % 2 ? 50 : 86) || b.y > (idx % 2 ? 134 : 170)))) {
        complete(recordOfflineMatch, gameId, score > 120 ? "win" : "loss", score, { score });
        b.y = 120; b.vy = 0; b.pipes = [330, 520]; setRunning(false); setScore(0);
      }
    }, 32);
    return () => clearInterval(timer);
  }, [gameId, recordOfflineMatch, running, score]);
  return <div className="flappy-wrap"><canvas ref={canvasRef} width="360" height="240" onClick={flap} /><button className="game-primary-action" onClick={flap}>Flap / Start</button><span>Score {score}</span></div>;
}

export default function OfflineGameRunner({ gameId, onBack }) {
  const game = gameById(gameId);
  if (!game) return <div className="games-empty">Game not found.</div>;
  const Runner = {
    snake: PremiumSnake,
    "snake-ladder": PremiumSnakeLadder,
    "tic-tac-toe": PremiumTicTacToe,
    "chess-ai": PremiumChess,
    carrom: PremiumCarrom,
    sudoku: Sudoku,
    "memory-match": MemoryMatch,
    "2048": Game2048,
    "flappy-wave": Flappy,
  }[gameId] || TicTacToe;
  return (
    <section className="offline-game-shell">
      <div className="panel-header soft">
        <div>
          <span className="panel-title">Offline Game</span>
          <h2>{game.title}</h2>
        </div>
        <button className="game-mini-action" type="button" onClick={onBack}>Hub</button>
      </div>
      <Runner gameId={gameId} />
    </section>
  );
}
