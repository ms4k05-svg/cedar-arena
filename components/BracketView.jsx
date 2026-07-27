"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { C, BODY, DISP } from "@/lib/theme";
import { Btn, Tag } from "@/components/ui";
import { roundName, seriesShort, totalRoundsOf } from "@/lib/helpers";
import MatchChat from "@/components/MatchChat";

export default function BracketView({ bracket, t, tournamentId, me, onReportWinner, onPlayerReportWinner, onUndo, onNoShow, myTag, myId, myTeamId }) {
  const tr = useT();
  const totalRounds = totalRoundsOf(bracket);
  const lastIdx = bracket.rounds.length - 1;
  const lastRound = bracket.rounds[lastIdx];
  const [openChat, setOpenChat] = useState(null);
  const [pendingUndo, setPendingUndo] = useState(null);
  const [pendingNoShow, setPendingNoShow] = useState(false);

  const myEntryId = t?.format === "team" ? myTeamId : myId;
  const myMatchIdx = myEntryId
    ? lastRound.findIndex((m) => (m.p1 && m.p1.userId === myEntryId) || (m.p2 && m.p2.userId === myEntryId))
    : -1;
  const myMatch = myMatchIdx >= 0 ? lastRound[myMatchIdx] : null;
  const myOpponent = myMatch ? (myMatch.p1 && myMatch.p1.userId === myEntryId ? myMatch.p2 : myMatch.p1) : null;
  const myEntry = myMatch ? (myMatch.p1 && myMatch.p1.userId === myEntryId ? myMatch.p1 : myMatch.p2) : null;

  const chatTitle = (m) => `${m.p1 ? m.p1.name || m.p1.tag : "…"} vs ${m.p2 ? m.p2.name || m.p2.tag : "…"}`;

  const seriesFullFor = (ri) => {
    const s = seriesShort(t, ri, totalRounds);
    return s === "Bo5" ? tr("bo5_full") : s === "Bo3" ? tr("bo3_full") : "";
  };

  return (
    <section style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: DISP, fontSize: 26, letterSpacing: "0.05em", marginBottom: 12 }}>{tr("bracket")}</div>
      {onReportWinner && <div style={{ fontSize: 12, color: C.mute, marginBottom: 12 }}>{tr("admin_hint")}</div>}

      {me && myMatch && !onReportWinner && (
        <div
          style={{
            background: "rgba(233,180,76,0.07)",
            border: `1px solid ${C.line}`,
            borderRadius: 10,
            padding: "12px 14px",
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          {myOpponent ? (
            <>
              <div style={{ fontSize: 14 }}>
                {tr("your_opp", roundName(tr, lastIdx, totalRounds))}{" "}
                <b style={{ color: C.gold }}>{myOpponent.name || myOpponent.tag}</b> <Tag>{myOpponent.tag}</Tag>
                {t?.series && (
                  <div style={{ fontSize: 12, color: C.mute, marginTop: 2 }}>
                    {t.mode ? `${t.mode} · ` : ""}
                    {seriesFullFor(lastIdx)} — {tr("first_to", seriesShort(t, lastIdx, totalRounds) === "Bo5" ? 3 : 2)}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Btn small onClick={() => setOpenChat({ roundIdx: lastIdx, matchIdx: myMatchIdx, title: chatTitle(myMatch) })}>
                  {tr("chat_btn")}
                </Btn>
                {!myMatch.winner && onPlayerReportWinner && myEntry && (
                  <>
                    <Btn kind="cedar" small onClick={() => onPlayerReportWinner(lastIdx, myMatchIdx, myEntry)}>
                      {tr("i_won_btn")}
                    </Btn>
                    <Btn kind="ghost" small onClick={() => onPlayerReportWinner(lastIdx, myMatchIdx, myOpponent)}>
                      {tr("opponent_won_btn")}
                    </Btn>
                  </>
                )}
                {!myMatch.winner &&
                  (myMatch.noShowReport?.by === myId ? (
                    <Btn kind="ghost" small disabled>{tr("noshow_done")}</Btn>
                  ) : (
                    <Btn
                      kind="danger"
                      small
                      onClick={() => {
                        if (pendingNoShow) {
                          onNoShow(lastIdx, myMatchIdx);
                          setPendingNoShow(false);
                        } else {
                          setPendingNoShow(true);
                        }
                      }}
                    >
                      {pendingNoShow ? tr("noshow_confirm") : tr("noshow_btn")}
                    </Btn>
                  ))}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 14, color: C.mute }}>{tr("bye_round")}</div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }}>
        {bracket.rounds.map((round, ri) => (
          <div key={ri} style={{ minWidth: 210, flexShrink: 0 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.1em", color: C.gold, fontWeight: 700, marginBottom: 8, textTransform: "uppercase" }}>
              {roundName(tr, ri, totalRounds)}
              {t?.series ? ` · ${seriesFullFor(ri)}` : ""}
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {round.map((m, mi) => (
                <div key={mi}>
                  <Match
                    m={m}
                    myId={myId}
                    editable={!!onReportWinner && ri === lastIdx}
                    onPick={(p) => onReportWinner(ri, mi, p)}
                    onChat={
                      onReportWinner && ri === lastIdx && m.p1 && m.p2
                        ? () => setOpenChat({ roundIdx: ri, matchIdx: mi, title: chatTitle(m) })
                        : null
                    }
                  />
                  {!m.winner && m.noShowReport && (
                    <div style={{ fontSize: 11, marginTop: 4, color: C.red, fontWeight: 600 }}>
                      {tr(
                        "noshow_flag",
                        m.noShowReport.name,
                        new Date(m.noShowReport.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      )}
                    </div>
                  )}
                  {onUndo && m.winner && m.p1 && m.p2 && (
                    <div
                      onClick={() => {
                        const key = `${ri}-${mi}`;
                        if (pendingUndo === key) {
                          onUndo(ri, mi);
                          setPendingUndo(null);
                        } else {
                          setPendingUndo(key);
                        }
                      }}
                      style={{
                        fontSize: 11,
                        marginTop: 4,
                        cursor: "pointer",
                        color: pendingUndo === `${ri}-${mi}` ? C.red : C.mute,
                        fontWeight: pendingUndo === `${ri}-${mi}` ? 700 : 500,
                        userSelect: "none",
                      }}
                    >
                      {pendingUndo === `${ri}-${mi}` ? tr("undo_confirm") : tr("undo_result")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {openChat && me && (
        <MatchChat
          tournamentId={tournamentId}
          roundIdx={openChat.roundIdx}
          matchIdx={openChat.matchIdx}
          title={openChat.title}
          me={me}
          onClose={() => setOpenChat(null)}
        />
      )}
    </section>
  );
}

function Match({ m, editable, onPick, myId, onChat }) {
  const tr = useT();
  const row = (p) => {
    const isBye = p === null;
    const won = m.winner && p && m.winner.userId === p.userId;
    const lost = m.winner && p && m.winner.userId !== p.userId;
    const mine = p && myId && p.userId === myId;
    return (
      <div
        onClick={() => editable && p && !m.winner && onPick(p)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "9px 12px",
          fontSize: 13,
          cursor: editable && p && !m.winner ? "pointer" : "default",
          background: won ? "rgba(76,154,99,0.14)" : mine ? "rgba(233,180,76,0.06)" : "transparent",
          color: isBye ? C.mute : lost ? C.mute : C.bone,
          textDecoration: lost ? "line-through" : "none",
        }}
      >
        <span style={{ fontFamily: BODY, fontWeight: mine ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {isBye ? tr("bye") : p.name || p.tag}
        </span>
        {won && <span style={{ color: C.cedar }}>✔</span>}
      </div>
    );
  };
  return (
    <div style={{ background: C.panel, border: `1px solid ${m.winner ? C.lineSoft : C.line}`, borderRadius: 9, overflow: "hidden", position: "relative" }}>
      {row(m.p1)}
      <div style={{ height: 1, background: C.lineSoft }} />
      {row(m.p2)}
      {onChat && (
        <div onClick={onChat} style={{ position: "absolute", insetInlineEnd: 6, top: "50%", transform: "translateY(-50%)", cursor: "pointer", fontSize: 14, opacity: 0.75 }}>
          💬
        </div>
      )}
    </div>
  );
}
