"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { C, DISP } from "@/lib/theme";
import { Btn } from "@/components/ui";

export default function PastView({ app }) {
  const tr = useT();
  const { history, isAdmin, deletePastTournament } = app;
  const [confirmId, setConfirmId] = useState(null);

  if (!history.length) {
    return <div style={{ textAlign: "center", color: C.mute, padding: "60px 20px" }}>{tr("past_empty")}</div>;
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ fontFamily: DISP, fontSize: 30, letterSpacing: "0.05em" }}>{tr("past_title")}</div>
      {history.map((t) => (
        <div
          key={t.id}
          style={{
            background: C.panel,
            border: `1px solid ${C.lineSoft}`,
            borderRadius: 12,
            padding: "16px 18px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{t.name}</div>
            <div style={{ fontSize: 12, color: C.mute }}>
              {tr("players_prize", t.confirmed_count, t.prize || "—")}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ textAlign: "end" }}>
              <div style={{ fontSize: 10, letterSpacing: "0.1em", color: C.mute }}>{tr("champion_sm")}</div>
              <div style={{ color: C.gold, fontWeight: 700 }}>👑 {t.champion?.name || t.champion?.tag || "—"}</div>
            </div>
            {isAdmin &&
              (confirmId === t.id ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn kind="danger" small onClick={() => { deletePastTournament(t.id); setConfirmId(null); }}>
                    {tr("confirm_del")}
                  </Btn>
                  <Btn kind="ghost" small onClick={() => setConfirmId(null)}>{tr("keep")}</Btn>
                </div>
              ) : (
                <Btn kind="danger" small onClick={() => setConfirmId(t.id)}>{tr("delete")}</Btn>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
