import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { clearGameProgress, loadGameProgress, saveGameProgress } from "../offline/storage";
import { useGames } from "../state/GamesContext";

const pieceMap = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

function playTone(freq = 440, duration = 0.08, type = "sine", gainValue = 0.04) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = gainValue;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.stop(ctx.currentTime + duration);
  } catch (err) {
    // Audio is optional and may be blocked until user interaction.
  }
}

function complete(recordOfflineMatch, gameId, result, score, finalState = {}) {
  recordOfflineMatch({ gameId, result, score, finalState, durationSeconds: 0 });
  clearGameProgress(gameId);
}

function Chess3DStage({ board }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.set(5.5, 6.4, 7.4);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0xf8fbff, 0x3a2112, 1.35));
    const key = new THREE.DirectionalLight(0xfff0c2, 2.2);
    key.position.set(4, 8, 4);
    key.castShadow = true;
    scene.add(key);

    const group = new THREE.Group();
    scene.add(group);
    const boardMatA = new THREE.MeshStandardMaterial({ color: 0xc28b50, roughness: 0.52, metalness: 0.02 });
    const boardMatB = new THREE.MeshStandardMaterial({ color: 0x4d2715, roughness: 0.6, metalness: 0.01 });
    for (let r = 0; r < 8; r += 1) {
      for (let c = 0; c < 8; c += 1) {
        const tile = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.16, 0.92), (r + c) % 2 ? boardMatB : boardMatA);
        tile.position.set(c - 3.5, 0, r - 3.5);
        tile.receiveShadow = true;
        group.add(tile);
      }
    }
    const base = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.28, 8.8), new THREE.MeshStandardMaterial({ color: 0x2a1309, roughness: 0.42 }));
    base.position.y = -0.22;
    base.receiveShadow = true;
    group.add(base);

    const makePiece = (piece) => {
      const white = piece === piece.toUpperCase();
      const mat = new THREE.MeshStandardMaterial({ color: white ? 0xf8ead2 : 0x17110e, roughness: 0.32, metalness: white ? 0.08 : 0.18 });
      const g = new THREE.Group();
      const baseMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 0.18, 30), mat);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, piece.toLowerCase() === "p" ? 0.42 : 0.62, 30), mat);
      const head = new THREE.Mesh(new THREE.SphereGeometry(piece.toLowerCase() === "n" ? 0.2 : 0.17, 30, 18), mat);
      baseMesh.castShadow = body.castShadow = head.castShadow = true;
      baseMesh.position.y = 0.16;
      body.position.y = 0.44;
      head.position.y = piece.toLowerCase() === "p" ? 0.72 : 0.86;
      g.add(baseMesh, body, head);
      if (piece.toLowerCase() === "k" || piece.toLowerCase() === "q") {
        const crown = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.24, 5), mat);
        crown.position.y = 1.08;
        crown.castShadow = true;
        g.add(crown);
      }
      if (piece.toLowerCase() === "r") {
        const top = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.38), mat);
        top.position.y = 0.98;
        top.castShadow = true;
        g.add(top);
      }
      if (piece.toLowerCase() === "b") {
        const finial = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.22, 24), mat);
        finial.position.y = 1.06;
        finial.castShadow = true;
        g.add(finial);
      }
      if (piece.toLowerCase() === "n") {
        head.scale.set(0.78, 1.24, 1.45);
        head.rotation.z = 0.35;
      }
      return g;
    };

    board.forEach((piece, index) => {
      if (!piece) return;
      const obj = makePiece(piece);
      obj.position.set((index % 8) - 3.5, 0.1, Math.floor(index / 8) - 3.5);
      group.add(obj);
    });

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      group.rotation.y += 0.0022;
      renderer.render(scene, camera);
    };
    animate();

    const resize = () => {
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [board]);

  return <div className="premium-3d-stage" ref={mountRef} />;
}

export function PremiumChess({ gameId = "chess-ai", online = false, onState }) {
  const { recordOfflineMatch, syncRoomState } = useGames();
  const start = useMemo(() => ["r", "n", "b", "q", "k", "b", "n", "r", "p", "p", "p", "p", "p", "p", "p", "p", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "P", "P", "P", "P", "P", "P", "P", "P", "R", "N", "B", "Q", "K", "B", "N", "R"], []);
  const saved = loadGameProgress(gameId, { state: { board: start, selected: null, moves: [], captured: [], check: false } })?.state;
  const [board, setBoard] = useState(saved?.board || start);
  const [selected, setSelected] = useState(null);
  const [moves, setMoves] = useState(saved?.moves || []);
  const [captured, setCaptured] = useState(saved?.captured || []);
  const [check, setCheck] = useState(false);
  const [mate, setMate] = useState(false);

  useEffect(() => saveGameProgress(gameId, { board, moves, captured, check }), [board, moves, captured, check, gameId]);

  const movePiece = (target) => {
    if (selected === null) {
      if (/[A-Z]/.test(board[target]) || online) setSelected(target);
      return;
    }
    if (target === selected) {
      setSelected(null);
      return;
    }
    const next = [...board];
    const piece = next[selected];
    if (!piece || (/[A-Z]/.test(next[target]) && !online)) {
      setSelected(null);
      return;
    }
    const capturedPiece = next[target];
    next[target] = piece;
    next[selected] = "";
    const moveText = `${pieceMap[piece]} ${String.fromCharCode(97 + (selected % 8))}${8 - Math.floor(selected / 8)}-${String.fromCharCode(97 + (target % 8))}${8 - Math.floor(target / 8)}`;
    const nextCaptured = capturedPiece ? [...captured, capturedPiece] : captured;
    const nextMoves = [moveText, ...moves].slice(0, 24);
    const kingInCheck = next.includes("k") && next.some((p, i) => p === "Q" && Math.abs((i % 8) - (next.indexOf("k") % 8)) <= 1);
    const isMate = !next.includes("k");
    setBoard(next);
    setCaptured(nextCaptured);
    setMoves(nextMoves);
    setCheck(kingInCheck);
    setMate(isMate);
    setSelected(null);
    playTone(capturedPiece ? 220 : 540, 0.09, capturedPiece ? "triangle" : "sine");
    const patch = { board: next, moves: nextMoves, captured: nextCaptured, check: kingInCheck };
    onState?.(patch);
    if (online) syncRoomState(patch);
    if (isMate) complete(recordOfflineMatch, gameId, "win", 600, patch);
  };

  return (
    <div className="premium-game-layout chess-premium">
      <div className="premium-chess-board-wrap">
        <div className={`premium-chess-board ${check ? "is-check" : ""} ${mate ? "is-mate" : ""}`}>
          {board.map((piece, index) => (
            <button
              key={index}
              className={`${(Math.floor(index / 8) + index) % 2 ? "dark" : "light"} ${selected === index ? "selected" : ""} ${piece ? "occupied" : ""}`}
              onClick={() => movePiece(index)}
              type="button"
            >
              {piece && <span className={`piece piece-${piece === piece.toUpperCase() ? "white" : "black"}`}>{pieceMap[piece]}</span>}
            </button>
          ))}
        </div>
        {check && <div className="game-alert check">Check</div>}
        {mate && <div className="victory-screen">Checkmate</div>}
      </div>
      <aside className="game-side-panel">
        <Chess3DStage board={board} />
        <div className="captured-strip"><strong>Captured</strong><span>{captured.map((p, i) => <b key={`${p}-${i}`}>{pieceMap[p]}</b>)}</span></div>
        <div className="move-history"><strong>Move History</strong>{moves.map((move, i) => <span key={`${move}-${i}`}>{moves.length - i}. {move}</span>)}</div>
      </aside>
    </div>
  );
}

const ludoColors = ["red", "blue", "green", "yellow"];
const ludoPath = [
  [45, 250], [95, 250], [145, 250], [195, 250], [245, 250], [245, 205], [245, 155], [245, 105], [245, 55],
  [300, 55], [355, 55], [355, 105], [355, 155], [355, 205], [355, 250], [405, 250], [455, 250], [505, 250],
  [505, 300], [505, 355], [455, 355], [405, 355], [355, 355], [355, 405], [355, 455], [355, 505],
  [300, 505], [245, 505], [245, 455], [245, 405], [245, 355], [195, 355], [145, 355], [95, 355], [45, 355], [45, 300],
];

export function PremiumLudo({ gameId = "ludo-online", online = true }) {
  const { recordOfflineMatch, syncRoomState } = useGames();
  const [dice, setDice] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [turn, setTurn] = useState(0);
  const [tokens, setTokens] = useState(() => ludoColors.flatMap((color, colorIndex) => [0, 1, 2, 3].map((token) => ({ color, colorIndex, token, step: token === 0 ? 0 : -1 }))));
  const [winner, setWinner] = useState("");

  const roll = () => {
    setRolling(true);
    playTone(180, 0.05, "square", 0.03);
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      setDice(Math.floor(Math.random() * 6) + 1);
      if (count > 10) {
        clearInterval(timer);
        const final = Math.floor(Math.random() * 6) + 1;
        setDice(final);
        setRolling(false);
      }
    }, 70);
  };

  const moveToken = (index) => {
    if (rolling || tokens[index].colorIndex !== turn) return;
    const next = tokens.map((item, i) => i === index ? { ...item, step: Math.min(ludoPath.length - 1, Math.max(0, item.step) + dice) } : item);
    setTokens(next);
    playTone(420 + dice * 30, 0.08);
    const won = next.filter((item) => item.colorIndex === turn).every((item) => item.step >= ludoPath.length - 1);
    const patch = { dice, turn, tokens: next };
    if (online) syncRoomState(patch);
    if (won) {
      setWinner(ludoColors[turn]);
      complete(recordOfflineMatch, gameId, "win", 420, patch);
    } else {
      setTurn((turn + 1) % ludoColors.length);
    }
  };

  return (
    <div className="premium-game-layout">
      <div className="ludo-premium-board">
        <svg viewBox="0 0 600 600" role="img" aria-label="Premium Ludo board">
          <defs>
            <linearGradient id="ludoGold" x1="0" x2="1"><stop offset="0" stopColor="#ffd166" /><stop offset="1" stopColor="#f97316" /></linearGradient>
            <filter id="softShadow"><feDropShadow dx="0" dy="5" stdDeviation="5" floodOpacity="0.35" /></filter>
          </defs>
          <rect x="18" y="18" width="564" height="564" rx="34" fill="#f8ead2" stroke="#3b1d0d" strokeWidth="12" />
          <rect x="38" y="38" width="180" height="180" rx="24" fill="#ef4444" opacity="0.9" />
          <rect x="382" y="38" width="180" height="180" rx="24" fill="#3b82f6" opacity="0.9" />
          <rect x="382" y="382" width="180" height="180" rx="24" fill="#22c55e" opacity="0.9" />
          <rect x="38" y="382" width="180" height="180" rx="24" fill="#facc15" opacity="0.9" />
          {ludoPath.map(([x, y], i) => <rect key={i} x={x - 22} y={y - 22} width="44" height="44" rx="8" fill={i % 2 ? "#fdf4dc" : "#e9d7b6"} stroke="#6b3f1d" strokeWidth="2" />)}
          <polygon points="230,230 370,230 300,300" fill="#ef4444" />
          <polygon points="370,230 370,370 300,300" fill="#3b82f6" />
          <polygon points="370,370 230,370 300,300" fill="#22c55e" />
          <polygon points="230,370 230,230 300,300" fill="#facc15" />
          {tokens.map((item, i) => {
            const homeX = item.color === "red" || item.color === "yellow" ? 88 + (item.token % 2) * 78 : 432 + (item.token % 2) * 78;
            const homeY = item.color === "red" || item.color === "blue" ? 88 + Math.floor(item.token / 2) * 78 : 432 + Math.floor(item.token / 2) * 78;
            const [x, y] = item.step >= 0 ? ludoPath[(item.step + item.colorIndex * 9) % ludoPath.length] : [homeX, homeY];
            return <circle key={i} cx={x} cy={y} r="17" fill={`var(--ludo-${item.color})`} stroke="#111827" strokeWidth="4" filter="url(#softShadow)" onClick={() => moveToken(i)} />;
          })}
        </svg>
        {winner && <div className="victory-screen">{winner} wins</div>}
      </div>
      <aside className="game-side-panel dice-panel">
        <div className={`dice-3d ${rolling ? "rolling" : ""}`} onClick={roll}><span>{dice}</span></div>
        <button className="game-primary-action" type="button" onClick={roll}>Roll Dice</button>
        <span className={`turn-pill ${ludoColors[turn]}`}>{ludoColors[turn]} turn</span>
        <p>Tap one of the active player's tokens after rolling. Online rooms broadcast token state through Socket.IO.</p>
      </aside>
    </div>
  );
}

export function PremiumSnakeLadder({ gameId = "snake-ladder", online = false }) {
  const { recordOfflineMatch, syncRoomState } = useGames();
  const [position, setPosition] = useState(1);
  const [dice, setDice] = useState(1);
  const [rolling, setRolling] = useState(false);
  const jumps = { 4: 25, 13: 46, 33: 49, 42: 63, 50: 69, 27: 5, 40: 3, 54: 31, 76: 58, 89: 53, 99: 41 };
  const coords = (tile) => {
    const row = Math.floor((tile - 1) / 10);
    const col = row % 2 ? 9 - ((tile - 1) % 10) : (tile - 1) % 10;
    return [42 + col * 54, 558 - row * 54];
  };
  const roll = () => {
    setRolling(true);
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      setDice(Math.floor(Math.random() * 6) + 1);
      if (count > 8) {
        clearInterval(timer);
        const final = Math.floor(Math.random() * 6) + 1;
        setDice(final);
        const raw = Math.min(100, position + final);
        const next = jumps[raw] || raw;
        setPosition(next);
        setRolling(false);
        playTone(jumps[raw] && jumps[raw] > raw ? 660 : 260, 0.12);
        const patch = { position: next, dice: final };
        if (online) syncRoomState(patch);
        if (next >= 100) complete(recordOfflineMatch, gameId, "win", 300, patch);
      }
    }, 80);
  };
  const snakes = [[99, 41], [89, 53], [76, 58], [54, 31], [40, 3], [27, 5]];
  const ladders = [[4, 25], [13, 46], [33, 49], [42, 63], [50, 69]];
  return (
    <div className="premium-game-layout">
      <div className="snake-ladder-premium">
        <svg viewBox="0 0 600 620">
          <defs><linearGradient id="slWood" x1="0" x2="1"><stop offset="0" stopColor="#f4c77b" /><stop offset="1" stopColor="#b76e2b" /></linearGradient></defs>
          <rect x="14" y="14" width="572" height="592" rx="28" fill="url(#slWood)" stroke="#4a2512" strokeWidth="10" />
          {Array.from({ length: 100 }).map((_, i) => {
            const tile = i + 1;
            const [x, y] = coords(tile);
            return <g key={tile}><rect x={x - 26} y={y - 26} width="52" height="52" rx="8" fill={tile % 2 ? "#fde8b9" : "#dba45b"} stroke="#7c4a20" /><text x={x} y={y + 5} textAnchor="middle" fill="#45200d" fontSize="14" fontWeight="800">{tile}</text></g>;
          })}
          {ladders.map(([a, b]) => {
            const [x1, y1] = coords(a); const [x2, y2] = coords(b);
            return <g key={`${a}-${b}`} className="ladder-art"><line x1={x1 - 10} y1={y1} x2={x2 - 10} y2={y2} /><line x1={x1 + 10} y1={y1} x2={x2 + 10} y2={y2} />{[0.2, 0.4, 0.6, 0.8].map((t) => <line key={t} x1={x1 + (x2 - x1) * t - 18} y1={y1 + (y2 - y1) * t} x2={x1 + (x2 - x1) * t + 18} y2={y1 + (y2 - y1) * t} />)}</g>;
          })}
          {snakes.map(([a, b], i) => {
            const [x1, y1] = coords(a); const [x2, y2] = coords(b);
            const midX = (x1 + x2) / 2 + (i % 2 ? 42 : -42);
            return <g key={`${a}-${b}`} className="snake-art"><path d={`M ${x1} ${y1} Q ${midX} ${(y1 + y2) / 2} ${x2} ${y2}`} /><circle cx={x1} cy={y1} r="15" /><circle cx={x1 - 5} cy={y1 - 4} r="2" fill="#111" /><circle cx={x1 + 5} cy={y1 - 4} r="2" fill="#111" /></g>;
          })}
          <circle className="player-token-animated" cx={coords(position)[0]} cy={coords(position)[1]} r="19" fill="#08c7d9" stroke="#06111d" strokeWidth="5" />
        </svg>
      </div>
      <aside className="game-side-panel dice-panel">
        <div className={`dice-3d ${rolling ? "rolling" : ""}`} onClick={roll}><span>{dice}</span></div>
        <button className="game-primary-action" type="button" onClick={roll}>Roll Dice</button>
        <strong>Tile {position}</strong>
      </aside>
    </div>
  );
}

export function PremiumCarrom({ gameId = "carrom", online = false }) {
  const { recordOfflineMatch, syncRoomState } = useGames();
  const canvasRef = useRef(null);
  const [score, setScore] = useState(0);
  const coinsRef = useRef([]);
  const strikerRef = useRef({ x: 270, y: 500, vx: 0, vy: 0, r: 17, striker: true });
  const dragRef = useRef(null);

  const reset = useCallback(() => {
    const coins = [];
    for (let i = 0; i < 11; i += 1) {
      const angle = (Math.PI * 2 * i) / 11;
      coins.push({ x: 270 + Math.cos(angle) * (i ? 38 : 0), y: 270 + Math.sin(angle) * (i ? 38 : 0), vx: 0, vy: 0, r: 12, pocketed: false, queen: i === 0 });
    }
    coinsRef.current = coins;
    strikerRef.current = { x: 270, y: 500, vx: 0, vy: 0, r: 17, striker: true };
  }, []);

  useEffect(() => { reset(); }, [reset]);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, 540, 540);
      const board = ctx.createLinearGradient(0, 0, 540, 540);
      board.addColorStop(0, "#f5d49c"); board.addColorStop(1, "#b97832");
      ctx.fillStyle = "#321608"; ctx.fillRect(0, 0, 540, 540);
      ctx.fillStyle = board; ctx.fillRect(28, 28, 484, 484);
      ctx.strokeStyle = "#7c2d12"; ctx.lineWidth = 10; ctx.strokeRect(52, 52, 436, 436);
      [[54, 54], [486, 54], [54, 486], [486, 486]].forEach(([x, y]) => { ctx.fillStyle = "#090b12"; ctx.beginPath(); ctx.arc(x, y, 28, 0, Math.PI * 2); ctx.fill(); });
      ctx.strokeStyle = "rgba(60,24,8,.45)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(270, 270, 68, 0, Math.PI * 2); ctx.stroke();

      const objects = [...coinsRef.current.filter((c) => !c.pocketed), strikerRef.current];
      objects.forEach((obj) => {
        obj.x += obj.vx; obj.y += obj.vy; obj.vx *= 0.985; obj.vy *= 0.985;
        if (obj.x < 52 + obj.r || obj.x > 488 - obj.r) obj.vx *= -0.82;
        if (obj.y < 52 + obj.r || obj.y > 488 - obj.r) obj.vy *= -0.82;
        obj.x = Math.max(52 + obj.r, Math.min(488 - obj.r, obj.x));
        obj.y = Math.max(52 + obj.r, Math.min(488 - obj.r, obj.y));
      });
      for (let i = 0; i < objects.length; i += 1) {
        for (let j = i + 1; j < objects.length; j += 1) {
          const a = objects[i]; const b = objects[j];
          const dx = b.x - a.x; const dy = b.y - a.y; const dist = Math.hypot(dx, dy) || 1;
          if (dist < a.r + b.r) {
            const nx = dx / dist; const ny = dy / dist; const impulse = ((a.vx - b.vx) * nx + (a.vy - b.vy) * ny) * 0.9;
            a.vx -= impulse * nx; a.vy -= impulse * ny; b.vx += impulse * nx; b.vy += impulse * ny;
          }
        }
      }
      coinsRef.current.forEach((coin) => {
        if (coin.pocketed) return;
        const pocketed = [[54, 54], [486, 54], [54, 486], [486, 486]].some(([x, y]) => Math.hypot(coin.x - x, coin.y - y) < 30);
        if (pocketed) {
          coin.pocketed = true;
          setScore((s) => s + (coin.queen ? 3 : 1));
          playTone(720, 0.1, "triangle");
        }
      });
      coinsRef.current.forEach((coin) => {
        if (coin.pocketed) return;
        ctx.fillStyle = coin.queen ? "#b91c1c" : "#111827";
        ctx.beginPath(); ctx.arc(coin.x, coin.y, coin.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#fef3c7"; ctx.lineWidth = 2; ctx.stroke();
      });
      const striker = strikerRef.current;
      ctx.fillStyle = "#f8fafc"; ctx.beginPath(); ctx.arc(striker.x, striker.y, striker.r, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 4; ctx.stroke();
      if (dragRef.current) {
        ctx.strokeStyle = "#31d07f"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(striker.x, striker.y); ctx.lineTo(dragRef.current.x, dragRef.current.y); ctx.stroke();
      }
      if (coinsRef.current.every((coin) => coin.pocketed)) complete(recordOfflineMatch, gameId, "win", score + 20, { score });
      if (online) syncRoomState({ score });
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [gameId, online, recordOfflineMatch, score, syncRoomState]);

  const pointer = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * 540, y: ((event.clientY - rect.top) / rect.height) * 540 };
  };
  const startDrag = (event) => {
    const p = pointer(event);
    const striker = strikerRef.current;
    if (Math.hypot(p.x - striker.x, p.y - striker.y) < 34) dragRef.current = p;
  };
  const moveDrag = (event) => {
    if (!dragRef.current) return;
    dragRef.current = pointer(event);
  };
  const endDrag = () => {
    if (!dragRef.current) return;
    const striker = strikerRef.current;
    striker.vx = (striker.x - dragRef.current.x) * 0.12;
    striker.vy = (striker.y - dragRef.current.y) * 0.12;
    dragRef.current = null;
    playTone(180, 0.06, "square");
  };

  return (
    <div className="premium-game-layout">
      <div className="carrom-premium-shell">
        <canvas ref={canvasRef} width="540" height="540" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} />
      </div>
      <aside className="game-side-panel">
        <strong>Score {score}</strong>
        <p>Drag the striker backward and release. Coins use collision physics, rebound from rails, and pocket detection.</p>
        <button className="game-mini-action" type="button" onClick={reset}>Reset Board</button>
      </aside>
    </div>
  );
}

export function PremiumTicTacToe({ gameId = "tic-tac-toe" }) {
  const { recordOfflineMatch } = useGames();
  const wins = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  const [board, setBoard] = useState(Array(9).fill(""));
  const winner = wins.find((line) => board[line[0]] && line.every((i) => board[i] === board[line[0]]));
  const move = (i) => {
    if (board[i] || winner) return;
    const next = [...board];
    next[i] = "X";
    const ai = [4, 0, 2, 6, 8, 1, 3, 5, 7].find((slot) => !next[slot]);
    if (ai !== undefined && !wins.find((line) => next[line[0]] && line.every((idx) => next[idx] === next[line[0]]))) next[ai] = "O";
    setBoard(next);
  };
  useEffect(() => {
    if (winner) complete(recordOfflineMatch, gameId, board[winner[0]] === "X" ? "win" : "loss", board[winner[0]] === "X" ? 100 : 20, { board });
    else if (board.every(Boolean)) complete(recordOfflineMatch, gameId, "draw", 50, { board });
  }, [winner, board, gameId, recordOfflineMatch]);
  return <div className="premium-tictactoe">{board.map((cell, i) => <button key={i} onClick={() => move(i)}>{cell}</button>)}</div>;
}

export function PremiumSnake({ gameId = "snake" }) {
  const { recordOfflineMatch } = useGames();
  const canvasRef = useRef(null);
  const snakeRef = useRef([{ x: 9, y: 9 }, { x: 8, y: 9 }, { x: 7, y: 9 }]);
  const dirRef = useRef({ x: 1, y: 0 });
  const foodRef = useRef({ x: 15, y: 10 });
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);

  const setDir = (x, y) => {
    if (dirRef.current.x === -x && dirRef.current.y === -y) return;
    dirRef.current = { x, y };
    setRunning(true);
  };

  useEffect(() => {
    const key = (event) => {
      if (event.key === "ArrowUp") setDir(0, -1);
      if (event.key === "ArrowDown") setDir(0, 1);
      if (event.key === "ArrowLeft") setDir(-1, 0);
      if (event.key === "ArrowRight") setDir(1, 0);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  useEffect(() => {
    let frame = 0;
    let last = 0;
    const draw = (time) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx) return;
      if (running && time - last > 118) {
        last = time;
        const snake = snakeRef.current;
        const head = { x: (snake[0].x + dirRef.current.x + 22) % 22, y: (snake[0].y + dirRef.current.y + 22) % 22 };
        if (snake.some((part) => part.x === head.x && part.y === head.y)) {
          complete(recordOfflineMatch, gameId, score >= 18 ? "win" : "loss", score, { score });
          snakeRef.current = [{ x: 9, y: 9 }, { x: 8, y: 9 }, { x: 7, y: 9 }];
          dirRef.current = { x: 1, y: 0 };
          setScore(0);
          setRunning(false);
        } else {
          const ate = head.x === foodRef.current.x && head.y === foodRef.current.y;
          snakeRef.current = [head, ...snake].slice(0, ate ? snake.length + 1 : snake.length);
          if (ate) {
            foodRef.current = { x: Math.floor(Math.random() * 22), y: Math.floor(Math.random() * 22) };
            setScore((s) => s + 1);
            playTone(660, 0.08, "triangle");
          }
        }
      }
      ctx.clearRect(0, 0, 540, 540);
      const bg = ctx.createLinearGradient(0, 0, 540, 540);
      bg.addColorStop(0, "#08111f"); bg.addColorStop(1, "#150b22");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, 540, 540);
      ctx.strokeStyle = "rgba(255,255,255,.055)";
      for (let i = 0; i <= 22; i += 1) {
        ctx.beginPath(); ctx.moveTo(i * 24.5, 0); ctx.lineTo(i * 24.5, 540); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * 24.5); ctx.lineTo(540, i * 24.5); ctx.stroke();
      }
      const food = foodRef.current;
      ctx.shadowBlur = 22; ctx.shadowColor = "#f43f5e"; ctx.fillStyle = "#fb7185";
      ctx.beginPath(); ctx.arc(food.x * 24.5 + 12, food.y * 24.5 + 12, 10, 0, Math.PI * 2); ctx.fill();
      snakeRef.current.forEach((part, index) => {
        const radius = index === 0 ? 12 : 10;
        ctx.shadowBlur = index === 0 ? 22 : 13;
        ctx.shadowColor = "#31d07f";
        ctx.fillStyle = index === 0 ? "#d9fff1" : "#31d07f";
        ctx.beginPath();
        ctx.roundRect(part.x * 24.5 + 2, part.y * 24.5 + 2, radius * 1.8, radius * 1.8, 8);
        ctx.fill();
      });
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [gameId, recordOfflineMatch, running, score]);

  return (
    <div className="premium-game-layout">
      <div className="premium-snake-shell">
        <canvas ref={canvasRef} width="540" height="540" onClick={() => setRunning(true)} />
      </div>
      <aside className="game-side-panel dice-panel">
        <strong>Score {score}</strong>
        <button className="game-primary-action" type="button" onClick={() => setRunning((v) => !v)}>{running ? "Pause" : "Start"}</button>
        <div className="direction-pad">
          <button onClick={() => setDir(0, -1)}>Up</button>
          <button onClick={() => setDir(-1, 0)}>Left</button>
          <button onClick={() => setDir(1, 0)}>Right</button>
          <button onClick={() => setDir(0, 1)}>Down</button>
        </div>
        <p>Keyboard arrows and touch controls are both supported. Progress records locally and syncs when online.</p>
      </aside>
    </div>
  );
}
