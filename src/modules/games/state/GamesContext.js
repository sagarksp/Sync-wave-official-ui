import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSocket } from "../../../context/SocketContext";
import { gamesApi } from "../api";
import { DEFAULT_ACHIEVEMENTS, GAME_CATALOG, gameById } from "../data/catalog";
import {
  applyLocalMatch,
  clearQueuedOfflineMatches,
  createLocalProfile,
  getQueuedOfflineMatches,
  loadLocalProfile,
  queueOfflineMatch,
  saveLocalProfile,
} from "../offline/storage";

const GamesContext = createContext(null);

export function GamesProvider({ auth, children }) {
  const socket = useSocket();
  const [catalog, setCatalog] = useState(GAME_CATALOG);
  const [profile, setProfile] = useState(() => loadLocalProfile(auth));
  const [achievements, setAchievements] = useState(DEFAULT_ACHIEVEMENTS);
  const [recentlyPlayed, setRecentlyPlayed] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [history, setHistory] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [status, setStatus] = useState({ loading: true, syncing: false, error: "" });

  const refreshHome = useCallback(async () => {
    setStatus((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const data = await gamesApi.home();
      setCatalog(data.catalog?.length ? data.catalog : GAME_CATALOG);
      setProfile(data.profile || createLocalProfile(auth));
      saveLocalProfile(data.profile || createLocalProfile(auth));
      setAchievements(data.achievements?.length ? data.achievements : DEFAULT_ACHIEVEMENTS);
      setRecentlyPlayed(data.recentlyPlayed || []);
      setStatus((prev) => ({ ...prev, loading: false }));
    } catch (err) {
      setProfile(loadLocalProfile(auth));
      setStatus({ loading: false, syncing: false, error: "Games are running in offline mode." });
    }
  }, [auth]);

  const syncOfflineMatches = useCallback(async () => {
    const matches = getQueuedOfflineMatches();
    if (!matches.length || !navigator.onLine) return;
    setStatus((prev) => ({ ...prev, syncing: true }));
    try {
      const data = await gamesApi.syncOffline(matches);
      clearQueuedOfflineMatches();
      if (data.profile) {
        setProfile(data.profile);
        saveLocalProfile(data.profile);
      }
      setStatus((prev) => ({ ...prev, syncing: false }));
    } catch (err) {
      setStatus((prev) => ({ ...prev, syncing: false }));
    }
  }, []);

  useEffect(() => {
    refreshHome().then(syncOfflineMatches);
    window.addEventListener("online", syncOfflineMatches);
    return () => window.removeEventListener("online", syncOfflineMatches);
  }, [refreshHome, syncOfflineMatches]);

  useEffect(() => {
    if (!socket?.on) return undefined;
    const onRoom = (room) => setActiveRoom(room?.room || room);
    const onInvite = (invite) => setStatus((prev) => ({ ...prev, error: `${invite?.from?.displayName || "A friend"} invited you to ${invite?.room?.code || "a room"}` }));
    socket.on("games_room_update", onRoom);
    socket.on("games_state_sync", onRoom);
    socket.on("games_match_started", onRoom);
    socket.on("games_match_ended", onRoom);
    socket.on("games_room_invite", onInvite);
    return () => {
      socket.off?.("games_room_update", onRoom);
      socket.off?.("games_state_sync", onRoom);
      socket.off?.("games_match_started", onRoom);
      socket.off?.("games_match_ended", onRoom);
      socket.off?.("games_room_invite", onInvite);
    };
  }, [socket]);

  const recordOfflineMatch = useCallback((match) => {
    const finalMatch = {
      ...match,
      mode: "offline",
      endedAt: match.endedAt || new Date().toISOString(),
      localId: match.localId || `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    };
    queueOfflineMatch(finalMatch);
    setRecentlyPlayed((prev) => [{ gameId: finalMatch.gameId, endedAt: finalMatch.endedAt, status: finalMatch.result }, ...prev].slice(0, 10));
    setProfile((prev) => {
      const next = applyLocalMatch(prev, finalMatch, gameById(finalMatch.gameId));
      saveLocalProfile(next);
      return next;
    });
    window.setTimeout(syncOfflineMatches, 200);
  }, [syncOfflineMatches]);

  const createRoom = useCallback(async (gameId) => {
    const data = await gamesApi.createRoom({ gameId });
    setActiveRoom(data.room);
    socket?.emit?.("games_join_room", { code: data.room.code }, () => {});
    return data.room;
  }, [socket]);

  const joinRoom = useCallback(async (code, spectator = false) => {
    const data = await gamesApi.joinRoom({ code, spectator });
    setActiveRoom(data.room);
    socket?.emit?.("games_join_room", { code, spectator }, () => {});
    return data.room;
  }, [socket]);

  const findMatch = useCallback((gameId) => new Promise((resolve, reject) => {
    socket?.emit?.("games_matchmaking", { gameId }, (res) => {
      if (!res?.ok) {
        reject(new Error(res?.error || "Matchmaking failed"));
        return;
      }
      setActiveRoom(res.room);
      resolve(res.room);
    });
  }), [socket]);

  const syncRoomState = useCallback((patch, turnUserId) => {
    if (!activeRoom?.code) return;
    socket?.emit?.("games_state_patch", { code: activeRoom.code, patch, turnUserId }, (res) => {
      if (res?.room) setActiveRoom(res.room);
    });
  }, [activeRoom?.code, socket]);

  const loadLeaderboard = useCallback(async (gameId = "all") => {
    const data = await gamesApi.leaderboard(gameId);
    setLeaderboard(data.leaderboard || []);
    return data.leaderboard || [];
  }, []);

  const loadHistory = useCallback(async (gameId = "") => {
    const data = await gamesApi.history(gameId);
    setHistory(data.history || []);
    return data.history || [];
  }, []);

  const claimDailyReward = useCallback(async () => {
    const data = await gamesApi.claimDaily();
    if (data.profile) {
      setProfile(data.profile);
      saveLocalProfile(data.profile);
    }
    return data.reward;
  }, []);

  const value = useMemo(() => ({
    achievements,
    activeRoom,
    catalog,
    claimDailyReward,
    createRoom,
    findMatch,
    history,
    joinRoom,
    leaderboard,
    loadHistory,
    loadLeaderboard,
    profile,
    recentlyPlayed,
    recordOfflineMatch,
    refreshHome,
    setActiveRoom,
    status,
    syncRoomState,
  }), [achievements, activeRoom, catalog, claimDailyReward, createRoom, findMatch, history, joinRoom, leaderboard, loadHistory, loadLeaderboard, profile, recentlyPlayed, recordOfflineMatch, refreshHome, status, syncRoomState]);

  return <GamesContext.Provider value={value}>{children}</GamesContext.Provider>;
}

export function useGames() {
  return useContext(GamesContext);
}
