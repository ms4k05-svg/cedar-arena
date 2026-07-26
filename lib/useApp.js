"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "./supabase/client";
import { STR } from "./i18n";
import { roundName, totalRoundsOf, validPassword, validEmail, validPhone, normTag } from "./helpers";
import { purgeTournamentImages } from "./storage";

const emptySettings = { whish_number: "", contact: "" };

function tOf(lang, key, ...args) {
  const v = STR[lang]?.[key] ?? STR.en[key] ?? key;
  return typeof v === "function" ? v(...args) : v;
}

export function useApp() {
  const supabase = supabaseBrowser();

  const [lang, setLangState] = useState("en");
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [tournament, setTournament] = useState(null);
  const [history, setHistory] = useState([]);
  const [settings, setSettings] = useState(emptySettings);
  const [myReg, setMyReg] = useState(null);
  const [users, setUsers] = useState([]);
  const [games, setGames] = useState([]);
  const [view, setView] = useState("arena");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [notices, setNotices] = useState([]);

  const profileRef = useRef(null);
  const tournamentRef = useRef(null);
  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { tournamentRef.current = tournament; }, [tournament]);

  const tr = useCallback((key, ...args) => tOf(lang, key, ...args), [lang]);

  const notify = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }, []);

  const notice = useCallback((text) => {
    const id = crypto.randomUUID();
    setNotices((n) => [...n, { id, text }]);
    setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), 6000);
  }, []);

  const langRef = useRef(lang);
  useEffect(() => { langRef.current = lang; }, [lang]);

  /* ---------- initial load + auth ---------- */

  const fetchProfile = useCallback(async (userId) => {
    if (!userId) { setProfile(null); return null; }
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    setProfile(data || null);
    if (data?.language) setLangState(data.language);
    return data;
  }, [supabase]);

  const fetchTournamentData = useCallback(async () => {
    const [{ data: cur }, { data: hist }, { data: st }] = await Promise.all([
      supabase.from("tournaments").select("*").neq("status", "completed").maybeSingle(),
      supabase.from("tournaments").select("*").eq("status", "completed").order("completed_at", { ascending: false }),
      supabase.from("settings").select("*").eq("id", true).maybeSingle(),
    ]);
    setTournament(cur || null);
    setHistory(hist || []);
    setSettings(st || emptySettings);
    return cur || null;
  }, [supabase]);

  const fetchMyReg = useCallback(async (tournamentId, userId) => {
    if (!tournamentId || !userId) { setMyReg(null); return; }
    const { data } = await supabase
      .from("registrations")
      .select("*")
      .eq("tournament_id", tournamentId)
      .eq("user_id", userId)
      .maybeSingle();
    setMyReg(data || null);
  }, [supabase]);

  const fetchUsers = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: true });
    setUsers(data || []);
  }, [supabase]);

  const [myGameIds, setMyGameIds] = useState([]);
  const fetchMyGameIds = useCallback(async (userId) => {
    if (!userId) { setMyGameIds([]); return; }
    const { data } = await supabase.from("player_game_ids").select("*, games(name, slug, player_id_label)").eq("user_id", userId);
    setMyGameIds(data || []);
  }, [supabase]);

  const fetchGames = useCallback(async () => {
    const { data } = await supabase.from("games").select("*").order("created_at", { ascending: true });
    setGames(data || []);
  }, [supabase]);

  const refresh = useCallback(async () => {
    await fetchTournamentData();
    if (profileRef.current?.id) await fetchProfile(profileRef.current.id);
    if (profileRef.current?.role === "admin") await fetchUsers();
  }, [fetchTournamentData, fetchProfile, fetchUsers]);

  useEffect(() => {
    if (profile?.role === "admin") fetchUsers();
  }, [profile?.role, fetchUsers]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!alive) return;
      setSession(s || null);
      await Promise.all([
        fetchTournamentData(),
        fetchGames(),
        s?.user ? fetchProfile(s.user.id) : Promise.resolve(),
      ]);
      if (alive) setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s || null);
      if (s?.user) await fetchProfile(s.user.id);
      else setProfile(null);
    });

    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [supabase, fetchProfile, fetchTournamentData, fetchGames]);

  useEffect(() => {
    fetchMyReg(tournament?.id, profile?.id);
  }, [tournament?.id, profile?.id, fetchMyReg]);

  useEffect(() => {
    fetchMyGameIds(profile?.id);
  }, [profile?.id, fetchMyGameIds]);

  /* ---------- realtime ---------- */

  useEffect(() => {
    const channel = supabase
      .channel("cedar-tournaments")
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const deadId = payload.old?.id;
          setTournament((cur) => (cur?.id === deadId ? null : cur));
          setHistory((h) => h.filter((t) => t.id !== deadId));
          return;
        }
        const next = payload.new;
        if (next.status === "completed") {
          setTournament((cur) => (cur?.id === next.id ? null : cur));
          setHistory((h) => (h.some((t) => t.id === next.id) ? h : [next, ...h]));
          return;
        }

        const prev = tournamentRef.current;
        if (prev && prev.id === next.id) {
          if (prev.status === "open" && next.status === "live") {
            notice(tOf(langRef.current, "n_live", next.name));
          }
          const prevRounds = prev.bracket?.rounds?.length || 0;
          const nextRounds = next.bracket?.rounds?.length || 0;
          if (nextRounds > prevRounds && prevRounds > 0) {
            const total = totalRoundsOf(next.bracket);
            notice(tOf(langRef.current, "n_round", roundName((k, ...a) => tOf(langRef.current, k, ...a), nextRounds - 1, total)));
          }
          if (profileRef.current?.role === "admin" && next.status === "live" && next.bracket) {
            const prevLast = prev.bracket?.rounds?.[prev.bracket.rounds.length - 1] || [];
            const nextLast = next.bracket.rounds[next.bracket.rounds.length - 1] || [];
            nextLast.forEach((m, i) => {
              const prevAt = prevLast[i]?.noShowReport?.at;
              const nextAt = m?.noShowReport?.at;
              if (nextAt && nextAt !== prevAt) {
                const label = `${m.p1?.name || m.p1?.tag || "?"} vs ${m.p2?.name || m.p2?.tag || "?"}`;
                notice(tOf(langRef.current, "n_noshow", label));
              }
            });
          }
        }
        setTournament(next);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  // my own registration status changing live (e.g. admin confirms payment)
  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`cedar-my-regs-${profile.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "registrations", filter: `user_id=eq.${profile.id}` },
        (payload) => {
          const cur = tournamentRef.current;
          if (!cur) return;
          if (payload.eventType === "DELETE") {
            if (payload.old?.tournament_id === cur.id) setMyReg(null);
            return;
          }
          if (payload.new.tournament_id === cur.id) setMyReg(payload.new);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, profile?.id]);

  // opponent message popup for whichever match I'm currently in
  useEffect(() => {
    if (!profile?.id || !tournament?.id) return;
    const channel = supabase
      .channel(`cedar-msg-watch-${tournament.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `tournament_id=eq.${tournament.id}` },
        (payload) => {
          const m = payload.new;
          if (m.sender_id === profile.id) return;
          const t = tournamentRef.current;
          if (!t?.bracket) return;
          const lastIdx = t.bracket.rounds.length - 1;
          if (m.round_idx !== lastIdx) return;
          const match = t.bracket.rounds[lastIdx]?.[m.match_idx];
          const mine = match && ((match.p1?.userId === profile.id) || (match.p2?.userId === profile.id));
          if (mine) notice(tOf(langRef.current, "n_msg", m.sender_name));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, profile?.id, tournament?.id, notice]);

  /* ---------- language ---------- */

  const setLang = useCallback((code) => {
    setLangState(code);
    if (profileRef.current?.id) supabase.rpc("set_language", { p_lang: code });
  }, [supabase]);

  /* ---------- auth actions ---------- */

  async function signup({ email, password, phone, username }) {
    const em = (email || "").trim().toLowerCase();
    const name = (username || "").trim();
    if (name.length < 2 || name.length > 20) return tr("err_uname_len");
    if (!validEmail(em)) return tr("err_email");
    if (!validPassword(password)) return tr("err_pass");
    if (!validPhone(phone)) return tr("err_phone");

    const { data: check } = await supabase.rpc("check_signup_available", { p_username: name });
    if (check) {
      const map = { uname_len: "err_uname_len", uname_taken: "err_uname_taken" };
      return tr(map[check] || "err_generic");
    }

    const { data, error } = await supabase.auth.signUp({
      email: em,
      password,
      options: { data: { username: name, phone: phone.trim() } },
    });
    if (error) {
      if (/already registered/i.test(error.message)) return tr("err_email_exists");
      return tr("err_generic");
    }
    if (data.session) {
      setSession(data.session);
      const p = await fetchProfile(data.user.id);
      setView(p?.role === "admin" ? "admin" : "arena");
      notify(p?.role === "admin" ? tr("t_admin_welcome") : tr("t_welcome"));
    }
    return null;
  }

  async function login({ email, password }) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: (email || "").trim().toLowerCase(),
      password,
    });
    if (error) return tr("err_login");
    setSession(data.session);
    const p = await fetchProfile(data.user.id);
    if (p?.must_change_password) {
      setView("profile");
      notify(tr("temp_note"));
    } else {
      setView("arena");
    }
    return null;
  }

  async function logout() {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setView("arena");
  }

  async function adminResetPassword(userId) {
    const res = await fetch("/api/admin/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    if (!res.ok) return null;
    return data.tempPassword;
  }

  /* ---------- profile actions ---------- */

  async function updateUsername(newName) {
    const { data: code } = await supabase.rpc("update_username", { p_new_name: newName });
    if (code === "uname_len") return tr("err_uname_len");
    if (code === "uname_taken") return tr("err_uname_taken");
    await fetchProfile(profile.id);
    notify(tr("t_name_saved"));
    return null;
  }

  async function updatePassword(currentPass, newPass) {
    if (!validPassword(newPass)) return tr("err_pass");
    const { error: reauthErr } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password: currentPass || "",
    });
    if (reauthErr) return tr("err_curr_pass");
    const { error } = await supabase.auth.updateUser({ password: newPass });
    if (error) return tr("err_generic");
    await supabase.rpc("clear_must_change_password");
    await fetchProfile(profile.id);
    notify(tr("t_pass_saved"));
    return null;
  }

  /* ---------- tournament actions (admin) ---------- */

  async function createTournament(payload) {
    const n = parseInt(payload.maxPlayers, 10);
    const { data: code, error } = await supabase.rpc("create_tournament", {
      p_name: payload.name,
      p_starts_at: payload.startsAt,
      p_entry_fee: payload.entryFee,
      p_prize: payload.prizePool,
      p_max_players: Number.isFinite(n) ? n : null,
      p_mode: payload.mode,
      p_series: payload.series,
      p_bo5_from: payload.bo5From,
      p_game_id: payload.gameId,
    });
    if (error) { console.error("create_tournament failed", error); return tr("err_generic"); }
    if (code === "exists") return tr("err_t_exists");
    if (code === "name") return tr("err_t_name");
    if (code === "game") return tr("err_t_game");
    if (code === "count") return tr("err_t_count");
    await fetchTournamentData();
    notify(tr("t_created"));
    return null;
  }

  async function cancelTournament() {
    const id = tournament?.id;
    if (!id) return;
    await purgeTournamentImages(id);
    const { error } = await supabase.rpc("cancel_tournament", { p_id: id });
    if (error) { console.error("cancel_tournament failed", error); notify(tr("err_generic")); return; }
    await fetchTournamentData();
    notify(tr("t_cancelled"));
  }

  async function setRegStatus(userId, status) {
    if (!tournament) return;
    const { data: code, error } = await supabase.rpc("admin_set_registration_status", {
      p_tournament_id: tournament.id,
      p_user_id: userId,
      p_status: status,
    });
    if (error) { console.error("admin_set_registration_status failed", error); notify(tr("err_generic")); return; }
    if (code === "full") { notify(tr("t_slots_full")); return; }
    await fetchTournamentData();
  }

  async function removeReg(userId) {
    if (!tournament) return;
    const { error } = await supabase.rpc("admin_remove_registration", { p_tournament_id: tournament.id, p_user_id: userId });
    if (error) { console.error("admin_remove_registration failed", error); notify(tr("err_generic")); return; }
    await fetchTournamentData();
  }

  async function startBracket() {
    if (!tournament) return;
    const { data: code, error } = await supabase.rpc("start_bracket", { p_id: tournament.id });
    if (error) { console.error("start_bracket failed", error); notify(tr("err_generic")); return; }
    if (code === "need2") { notify(tr("t_need2")); return; }
    await fetchTournamentData();
    notify(tr("t_live"));
  }

  async function reportWinner(roundIdx, matchIdx, player) {
    if (!tournament) return;
    const { error } = await supabase.rpc("report_winner", {
      p_tournament_id: tournament.id,
      p_round_idx: roundIdx,
      p_match_idx: matchIdx,
      p_winner: player,
    });
    if (error) { console.error("report_winner failed", error); notify(tr("err_generic")); return; }
    await fetchTournamentData();
  }

  async function undoResult(roundIdx, matchIdx) {
    if (!tournament) return;
    const { error } = await supabase.rpc("undo_result", { p_tournament_id: tournament.id, p_round_idx: roundIdx, p_match_idx: matchIdx });
    if (error) { console.error("undo_result failed", error); notify(tr("err_generic")); return; }
    await fetchTournamentData();
    notify(tr("t_undone"));
  }

  async function finishTournament() {
    if (!tournament) return;
    await purgeTournamentImages(tournament.id);
    const { error } = await supabase.rpc("finish_tournament", { p_id: tournament.id });
    if (error) { console.error("finish_tournament failed", error); notify(tr("err_generic")); return; }
    await fetchTournamentData();
    notify(tr("t_archived"));
  }

  async function deletePastTournament(id) {
    const { error } = await supabase.rpc("delete_past_tournament", { p_id: id });
    if (error) { console.error("delete_past_tournament failed", error); notify(tr("err_generic")); return; }
    setHistory((h) => h.filter((t) => t.id !== id));
    notify(tr("t_deleted"));
  }

  async function saveSettings(next) {
    const { error } = await supabase.rpc("save_settings", { p_whish: next.whishNumber, p_contact: next.contact });
    if (error) { console.error("save_settings failed", error); notify(tr("err_generic")); return; }
    setSettings({ whish_number: next.whishNumber, contact: next.contact });
    notify(tr("t_settings"));
  }

  /* ---------- player actions ---------- */

  async function register() {
    if (!profile) { setView("auth"); return null; }
    const { data: code, error } = await supabase.rpc("register_for_tournament", { p_tournament_id: tournament.id });
    if (error) { console.error("register_for_tournament failed", error); notify(tr("err_generic")); return null; }
    if (code === "closed") { notify(tr("t_reg_closed")); await fetchTournamentData(); return null; }
    if (code === "already") { notify(tr("t_already")); return null; }
    if (code === "full") { notify(tr("t_full")); return null; }
    if (code === "need_game_id") { return "need_game_id"; }
    await fetchMyReg(tournament.id, profile.id);
    await fetchTournamentData();
    notify(tr("t_registered"));
    return null;
  }

  async function setGameId(gameId, rawValue, gameSlug) {
    const value = gameSlug === "clash-royale" ? normTag(rawValue) : (rawValue || "").trim();
    const { data: code, error } = await supabase.rpc("set_game_id", { p_game_id: gameId, p_value: value });
    if (error) { console.error("set_game_id failed", error); return tr("err_generic"); }
    if (code === "empty") return tr("err_generic");
    if (code === "invalid") return tr("err_game_id_invalid");
    await fetchMyGameIds(profile?.id);
    return null;
  }

  async function reportNoShow(roundIdx, matchIdx) {
    if (!tournament) return;
    const { error } = await supabase.rpc("report_no_show", { p_tournament_id: tournament.id, p_round_idx: roundIdx, p_match_idx: matchIdx });
    if (error) { console.error("report_no_show failed", error); notify(tr("err_generic")); return; }
    await fetchTournamentData();
    notify(tr("t_noshow"));
  }

  const isAdmin = profile?.role === "admin";

  return {
    lang, setLang, tr,
    session, profile, me: profile, isAdmin,
    tournament, history, settings, myReg, users, games, myGameIds,
    view, setView,
    loading, toast, notices, setNotices,
    signup, login, logout, adminResetPassword,
    updateUsername, updatePassword,
    createTournament, cancelTournament, setRegStatus, removeReg, startBracket,
    reportWinner, undoResult, finishTournament, deletePastTournament, saveSettings,
    register, reportNoShow, setGameId,
    refresh,
  };
}
