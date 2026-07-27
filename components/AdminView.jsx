"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { C, DISP } from "@/lib/theme";
import { Btn, Field, Choice, Tag, Pill, Panel, SlotMeter } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function AdminView({ app }) {
  const tr = useT();
  const { tournament: t, settings, saveSettings, createTournament, cancelTournament, setRegStatus, removeReg, startBracket, users, adminResetPassword, me, refresh, games, adminSetTeamStatus, adminRemoveTeam } = app;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: DISP, fontSize: 30, letterSpacing: "0.05em" }}>{tr("admin")}</div>
        <Btn kind="ghost" small onClick={refresh}>{tr("refresh")}</Btn>
      </div>

      <AdminSettings settings={settings} onSave={saveSettings} />

      {!t ? (
        <CreateTournament onCreate={createTournament} games={games} />
      ) : (
        <ManageTournament
          t={t}
          onSetStatus={setRegStatus}
          onRemove={removeReg}
          onSetTeamStatus={adminSetTeamStatus}
          onRemoveTeam={adminRemoveTeam}
          onStart={startBracket}
          onCancel={cancelTournament}
        />
      )}

      <AccountsPanel users={users} onReset={adminResetPassword} adminId={me?.id} />
    </div>
  );
}

function AccountsPanel({ users, onReset, adminId }) {
  const tr = useT();
  const [q, setQ] = useState("");
  const [pendingId, setPendingId] = useState(null);
  const [tempShown, setTempShown] = useState(null);

  const filtered = users.filter((u) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      (u.username || "").toLowerCase().includes(s) ||
      u.email.toLowerCase().includes(s) ||
      (u.player_tag || "").toLowerCase().includes(s) ||
      (u.player_id || "").includes(s)
    );
  });

  const doReset = async (userId) => {
    const temp = await onReset(userId);
    setTempShown({ userId, temp });
    setPendingId(null);
  };

  return (
    <Panel title={tr("acct_panel")}>
      <Field label="" value={q} onChange={setQ} placeholder={tr("acct_search")} />
      <div style={{ display: "grid", gap: 8 }}>
        {filtered.length === 0 && <div style={{ fontSize: 13, color: C.mute }}>{tr("acct_none")}</div>}
        {filtered.map((u) => (
          <div key={u.id} style={{ background: C.bg, border: `1px solid ${C.lineSoft}`, borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "grid", gap: 2 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>
                    {u.username || "—"} {u.role === "admin" && "👑"}
                  </span>
                  {u.player_tag && <Tag>{u.player_tag}</Tag>}
                  <Tag>{u.player_id}</Tag>
                </div>
                <div style={{ fontSize: 12, color: C.mute, direction: "ltr", textAlign: "start" }}>
                  {u.email} · {u.phone}
                </div>
              </div>
              {u.id !== adminId && (
                <Btn kind="danger" small onClick={() => (pendingId === u.id ? doReset(u.id) : setPendingId(u.id))}>
                  {pendingId === u.id ? tr("reset_confirm") : tr("reset_btn")}
                </Btn>
              )}
            </div>
            {tempShown?.userId === u.id && (
              <div style={{ marginTop: 8, background: "rgba(76,154,99,0.1)", border: `1px solid rgba(76,154,99,0.35)`, borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
                <b style={{ color: C.cedar, direction: "ltr", display: "inline-block" }}>{tr("reset_show", tempShown.temp)}</b>
                <div style={{ fontSize: 11, color: C.mute, marginTop: 3 }}>{tr("reset_show_hint")}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function AdminSettings({ settings, onSave }) {
  const tr = useT();
  const [whish, setWhish] = useState(settings.whish_number || "");
  const [contact, setContact] = useState(settings.contact || "");
  useEffect(() => {
    setWhish(settings.whish_number || "");
    setContact(settings.contact || "");
  }, [settings]);
  return (
    <Panel title={tr("pay_settings")}>
      <Field label={tr("whish_label")} value={whish} onChange={setWhish} placeholder="03 123 456" hint={tr("whish_hint")} />
      <Field label={tr("contact_label")} value={contact} onChange={setContact} placeholder={tr("contact_ph")} hint={tr("contact_hint")} />
      <Btn small onClick={() => onSave({ whishNumber: whish.trim(), contact: contact.trim() })}>{tr("save_settings")}</Btn>
    </Panel>
  );
}

function CreateTournament({ onCreate, games }) {
  const tr = useT();
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [entryFee, setEntryFee] = useState("");
  const [prizePool, setPrizePool] = useState("");
  const [maxPlayers, setMaxPlayers] = useState("16");
  const [mode, setMode] = useState("Mega Draft");
  const [series, setSeries] = useState("Bo3");
  const [bo5From, setBo5From] = useState("none");
  const [gameId, setGameId] = useState("");
  const [format, setFormat] = useState("solo");
  const [minTeamSize, setMinTeamSize] = useState("5");
  const [maxTeamSize, setMaxTeamSize] = useState("");
  const [checkInRequired, setCheckInRequired] = useState(false);
  const [scoreReporting, setScoreReporting] = useState("admin");
  const [requireScreenshot, setRequireScreenshot] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!gameId && games.length > 0) setGameId(games[0].id);
  }, [games, gameId]);

  const isClashRoyale = games.find((g) => g.id === gameId)?.slug === "clash-royale";
  const isTeamFormat = format === "team";

  const submit = async () => {
    setErr(null);
    if (!gameId) { setErr(tr("err_t_game")); return; }
    const e = await onCreate({
      name, startsAt, entryFee, prizePool, maxPlayers,
      mode: isClashRoyale ? mode : null, series, bo5From, gameId,
      format,
      minTeamSize: isTeamFormat ? minTeamSize : null,
      maxTeamSize: isTeamFormat && maxTeamSize.trim() !== "" ? maxTeamSize : null,
      checkInRequired, scoreReporting, requireScreenshot,
    });
    if (e) setErr(e);
  };

  return (
    <Panel title={tr("create_t")}>
      {games.length > 0 && (
        <Choice
          label={tr("game_label")}
          value={gameId}
          onChange={setGameId}
          options={games.map((g) => ({ value: g.id, label: g.name }))}
        />
      )}
      <Choice
        label={tr("format_label")}
        value={format}
        onChange={setFormat}
        options={[
          { value: "solo", label: tr("format_solo") },
          { value: "team", label: tr("format_team") },
        ]}
      />
      {isTeamFormat && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label={tr("min_team_size")} value={minTeamSize} onChange={setMinTeamSize} placeholder="5" />
          <Field label={tr("max_team_size")} value={maxTeamSize} onChange={setMaxTeamSize} placeholder={tr("max_team_size_ph")} />
        </div>
      )}
      <Field label={tr("f_name")} value={name} onChange={setName} placeholder="Cedar Cup #1" />
      <Field label={tr("f_starts")} value={startsAt} onChange={setStartsAt} placeholder={tr("f_starts_ph")} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label={tr("f_fee")} value={entryFee} onChange={setEntryFee} placeholder="$5" />
        <Field label={tr("f_prize")} value={prizePool} onChange={setPrizePool} placeholder="$50" />
      </div>
      {isClashRoyale && (
        <Choice
          label={tr("mode_label")}
          value={mode}
          onChange={setMode}
          options={[
            { value: "Mega Draft", label: "Mega Draft" },
            { value: "Triple Draft", label: "Triple Draft" },
            { value: "Duel", label: "Duel" },
          ]}
          hint={mode === "Duel" ? tr("duel_hint") : null}
        />
      )}
      {(!isClashRoyale || mode !== "Duel") && (
        <Choice
          label={tr("matches_are")}
          value={series}
          onChange={setSeries}
          options={[
            { value: "Bo3", label: tr("bo3_full") },
            { value: "Bo5", label: tr("bo5_full") },
          ]}
        />
      )}
      {(mode === "Duel" || series === "Bo3") && (
        <Choice
          label={tr("bo5from")}
          value={bo5From}
          onChange={setBo5From}
          options={[
            { value: "none", label: tr("bo5_none") },
            { value: "final", label: tr("bo5_final") },
            { value: "semis", label: tr("bo5_semis") },
          ]}
          hint={mode === "Duel" ? tr("bo5_duel_hint") : tr("bo5_hint")}
        />
      )}
      <Field label={tr("f_count")} value={maxPlayers} onChange={setMaxPlayers} placeholder="16" hint={tr("count_hint")} />
      <Choice
        label={tr("checkin_label")}
        value={checkInRequired ? "on" : "off"}
        onChange={(v) => setCheckInRequired(v === "on")}
        options={[
          { value: "off", label: tr("disabled") },
          { value: "on", label: tr("enabled") },
        ]}
        hint={tr("checkin_hint")}
      />
      <Choice
        label={tr("score_reporting_label")}
        value={scoreReporting}
        onChange={setScoreReporting}
        options={[
          { value: "admin", label: tr("score_reporting_admin") },
          { value: "players", label: tr("score_reporting_players") },
        ]}
        hint={tr("score_reporting_hint")}
      />
      <Choice
        label={tr("require_screenshot_label")}
        value={requireScreenshot ? "on" : "off"}
        onChange={(v) => setRequireScreenshot(v === "on")}
        options={[
          { value: "off", label: tr("not_required") },
          { value: "on", label: tr("required") },
        ]}
      />
      {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{err}</div>}
      <Btn onClick={submit}>{tr("create_btn")}</Btn>
    </Panel>
  );
}

function ManageTournament({ t, onSetStatus, onRemove, onSetTeamStatus, onRemoveTeam, onStart, onCancel }) {
  const tr = useT();
  const [regs, setRegs] = useState([]);
  const [teamMembers, setTeamMembers] = useState({});
  const supabase = supabaseBrowser();
  const isTeam = t.format === "team";

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await supabase.from("registrations").select("*").eq("tournament_id", t.id).order("created_at", { ascending: true });
      if (!alive) return;
      setRegs(data || []);
      if (isTeam && data?.length) {
        const teamIds = data.map((r) => r.team_id).filter(Boolean);
        const { data: members } = await supabase
          .from("team_members")
          .select("team_id, user_id, profiles(username)")
          .in("team_id", teamIds);
        const byTeam = {};
        (members || []).forEach((m) => {
          if (!byTeam[m.team_id]) byTeam[m.team_id] = [];
          byTeam[m.team_id].push(m.profiles?.username || "—");
        });
        if (alive) setTeamMembers(byTeam);
      }
    };
    load();
    const channel = supabase
      .channel(`admin-regs-${t.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "registrations", filter: `tournament_id=eq.${t.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_members" }, load)
      .subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [supabase, t.id, isTeam]);

  const statusWord = t.status === "open" ? tr("st_open") : tr("st_live");
  const confirmedCount = t.confirmed_count;

  return (
    <Panel title={tr("cur_t", t.name, statusWord)}>
      <div style={{ marginBottom: 16 }}>
        <SlotMeter confirmed={confirmedCount} max={t.max_players} />
      </div>

      {t.status === "open" && (
        <>
          <div style={{ fontSize: 13, color: C.mute, marginBottom: 12 }}>
            {regs.length === 0 ? tr("no_regs") : tr("confirm_regs")}
          </div>
          <div style={{ display: "grid", gap: 8, marginBottom: 18 }}>
            {regs.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  background: C.bg,
                  border: `1px solid ${C.lineSoft}`,
                  borderRadius: 10,
                  padding: "10px 12px",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "grid", gap: 2 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{r.name || "—"}</span>
                    {!isTeam && <Tag>{r.tag}</Tag>}
                    {r.checked_in && <Pill status="confirmed" />}
                    <Pill status={r.status} />
                  </div>
                  {isTeam && (
                    <div style={{ fontSize: 12, color: C.mute }}>
                      {(teamMembers[r.team_id] || []).join(", ")}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {r.status === "pending" ? (
                    <Btn kind="cedar" small onClick={() => (isTeam ? onSetTeamStatus(r.team_id, "confirmed") : onSetStatus(r.user_id, "confirmed"))}>{tr("confirm_pay")}</Btn>
                  ) : (
                    <Btn kind="ghost" small onClick={() => (isTeam ? onSetTeamStatus(r.team_id, "pending") : onSetStatus(r.user_id, "pending"))}>{tr("undo")}</Btn>
                  )}
                  <Btn kind="danger" small onClick={() => (isTeam ? onRemoveTeam(r.team_id) : onRemove(r.user_id))}>{tr("remove")}</Btn>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Btn onClick={onStart} disabled={confirmedCount < 2}>{tr("start_btn", confirmedCount)}</Btn>
            <Btn kind="danger" onClick={onCancel}>{tr("cancel_t")}</Btn>
          </div>
          {confirmedCount > 0 && confirmedCount < t.max_players && (
            <div style={{ fontSize: 12, color: C.mute, marginTop: 10 }}>{tr("byes_note", t.max_players)}</div>
          )}
        </>
      )}

      {t.status === "live" && <div style={{ fontSize: 13, color: C.mute }}>{tr("live_note")}</div>}
    </Panel>
  );
}
