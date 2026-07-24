"use client";

import { useT } from "@/lib/i18n";
import { C, DISP } from "@/lib/theme";
import { Btn, Tag, WhatsAppIcon, WhishBadge, CedarCrown, Stat, SlotMeter } from "@/components/ui";
import { waLink } from "@/lib/helpers";
import BracketView from "@/components/BracketView";

export default function ArenaView({ app }) {
  const tr = useT();
  const { tournament: t, me, myReg, settings, isAdmin, register, reportWinner, undoResult, finishTournament, reportNoShow } = app;

  if (!t) {
    return (
      <div style={{ textAlign: "center", padding: "70px 20px" }}>
        <CedarCrown size={54} />
        <div style={{ fontFamily: DISP, fontSize: 42, letterSpacing: "0.04em", marginTop: 14 }}>
          {tr("no_t_title")}
        </div>
        <div style={{ color: C.mute, fontSize: 14, maxWidth: 380, margin: "8px auto 0" }}>
          {tr("no_t_body")}
        </div>
      </div>
    );
  }

  const fmtValue =
    tr("fmt_single") +
    (t.series
      ? ` · ${t.series === "Bo5" ? tr("bo5_full") : tr("bo3_full")}` +
        (t.bo5_from === "final" ? ` ${tr("fmt_final_bo5")}` : t.bo5_from === "semis" ? ` ${tr("fmt_semis_bo5")}` : "")
      : "");

  return (
    <div>
      <section
        style={{
          background: `linear-gradient(180deg, ${C.panelSoft}, ${C.panel})`,
          border: `1px solid ${C.line}`,
          borderRadius: 16,
          padding: "28px 24px",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.18em",
            color: t.status === "live" && !t.champion ? C.red : C.gold,
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          {t.status === "open" && tr("reg_open")}
          {t.status === "live" && !t.champion && tr("live_now")}
          {t.status === "live" && t.champion && tr("champ_crowned")}
        </div>
        <h1 style={{ fontFamily: DISP, fontSize: "clamp(38px, 8vw, 64px)", letterSpacing: "0.03em", margin: 0, lineHeight: 1.1 }}>
          {t.name}
        </h1>
        {t.starts_at && <div style={{ color: C.mute, fontSize: 14, marginTop: 8 }}>{tr("starts", t.starts_at)}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, margin: "22px 0" }}>
          <Stat label={tr("stat_entry")} value={t.entry_fee || "—"} accent={C.bone} />
          <Stat label={tr("stat_prize")} value={t.prize || "—"} accent={C.gold} />
          {t.mode && <Stat label={tr("stat_mode")} value={t.mode} accent={C.bone} small />}
          <Stat label={tr("stat_format")} value={fmtValue} accent={C.bone} small />
        </div>

        <SlotMeter confirmed={t.confirmed_count} max={t.max_players} />

        {t.status === "open" && (
          <div style={{ marginTop: 22 }}>
            {!myReg ? (
              <Btn onClick={register} style={{ width: "100%" }}>
                {me ? tr("reg_btn") : tr("reg_signin")}
              </Btn>
            ) : (
              <RegStatusCard reg={myReg} t={t} settings={settings} />
            )}
          </div>
        )}
      </section>

      {t.status === "live" && t.champion && (
        <div
          style={{
            background: "rgba(233,180,76,0.1)",
            border: `1px solid ${C.gold}`,
            borderRadius: 14,
            padding: "20px 22px",
            marginBottom: 20,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 11, letterSpacing: "0.2em", color: C.mute, fontWeight: 700 }}>{tr("champion")}</div>
          <div style={{ fontFamily: DISP, fontSize: 40, color: C.gold, letterSpacing: "0.04em" }}>
            👑 {t.champion.name || t.champion.tag}
          </div>
          {isAdmin && (
            <div style={{ marginTop: 12 }}>
              <Btn onClick={finishTournament}>{tr("finish_btn")}</Btn>
              <div style={{ fontSize: 11, color: C.mute, marginTop: 8 }}>{tr("wrong_result")}</div>
            </div>
          )}
        </div>
      )}

      {t.status === "live" && t.bracket && (
        <BracketView
          bracket={t.bracket}
          t={t}
          tournamentId={t.id}
          me={me}
          onReportWinner={isAdmin ? reportWinner : null}
          onUndo={isAdmin ? undoResult : null}
          onNoShow={reportNoShow}
          myTag={me?.player_tag}
          myId={me?.id}
        />
      )}

      {t.status === "open" && <HowItWorks settings={settings} entryFee={t.entry_fee} />}
    </div>
  );
}

function RegStatusCard({ reg, t, settings }) {
  const tr = useT();
  if (reg.status === "confirmed") {
    return (
      <div style={{ background: "rgba(76,154,99,0.1)", border: `1px solid rgba(76,154,99,0.35)`, borderRadius: 10, padding: 16 }}>
        <div style={{ fontWeight: 700, color: C.cedar, marginBottom: 4 }}>{tr("youre_in")}</div>
        <div style={{ fontSize: 13, color: C.mute }}>
          {tr("playing_as")} <b>{reg.name || reg.tag}</b> <Tag>{reg.tag}</Tag> {tr("bracket_soon")}
        </div>
      </div>
    );
  }
  return (
    <div style={{ background: "rgba(217,160,63,0.08)", border: `1px solid rgba(217,160,63,0.35)`, borderRadius: 10, padding: 16 }}>
      <div style={{ fontWeight: 700, color: C.amber, marginBottom: 6 }}>{tr("pend_title")}</div>
      <ol style={{ fontSize: 13, color: C.bone, margin: 0, paddingInlineStart: 18, lineHeight: 2 }}>
        <li>
          {tr("pend_send")} <b>{t.entry_fee || tr("hiw2_fee")}</b> {tr("pend_via")} <WhishBadge />{" "}
          {tr("pend_to")}{" "}
          <b style={{ color: C.gold, direction: "ltr", display: "inline-block" }}>
            {settings.whish_number || tr("pend_admin_num")}
          </b>
        </li>
        <li>
          {tr("pend_msg")}
          {settings.contact ? (
            <>
              {" "}{tr("pend_on")}{" "}
              {waLink(settings.contact) ? (
                <a
                  href={waLink(settings.contact)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#25D366", fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, verticalAlign: "middle", direction: "ltr" }}
                >
                  <WhatsAppIcon /> {settings.contact}
                </a>
              ) : (
                <b>{settings.contact}</b>
              )}
            </>
          ) : (
            ""
          )}{" "}
          {tr("pend_with_tag")} <Tag>{reg.tag}</Tag>
        </li>
        <li>{tr("pend_lock")}</li>
      </ol>
    </div>
  );
}

function HowItWorks({ settings, entryFee }) {
  const tr = useT();
  const steps = [
    [tr("hiw1_t"), tr("hiw1_b")],
    [
      tr("hiw2_t"),
      <>
        {tr("hiw2_send")} {entryFee || tr("hiw2_fee")} {tr("pend_via")} <WhishBadge size={16} />{" "}
        {tr("pend_to")}{" "}
        <b style={{ color: C.bone, direction: "ltr", display: "inline-block" }}>
          {settings.whish_number || tr("hiw2_admin_num")}
        </b>
        {settings.contact && waLink(settings.contact) ? (
          <>
            {" "}{tr("hiw2_then")}{" "}
            <a
              href={waLink(settings.contact)}
              target="_blank"
              rel="noreferrer"
              style={{ color: "#25D366", fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, verticalAlign: "middle", direction: "ltr" }}
            >
              <WhatsAppIcon size={14} /> WhatsApp — {settings.contact}
            </a>
            .
          </>
        ) : (
          <> {tr("hiw2_plain")}</>
        )}
      </>,
    ],
    [tr("hiw3_t"), tr("hiw3_b")],
    [tr("hiw4_t"), tr("hiw4_b")],
  ];
  return (
    <section style={{ background: C.panel, border: `1px solid ${C.lineSoft}`, borderRadius: 14, padding: "20px 22px" }}>
      <div style={{ fontFamily: DISP, fontSize: 24, letterSpacing: "0.05em", marginBottom: 14 }}>{tr("hiw_title")}</div>
      <div style={{ display: "grid", gap: 12 }}>
        {steps.map(([h, b], i) => (
          <div key={i} style={{ display: "flex", gap: 12 }}>
            <div
              style={{
                minWidth: 26,
                height: 26,
                borderRadius: "50%",
                background: "rgba(233,180,76,0.1)",
                border: `1px solid ${C.line}`,
                color: C.gold,
                fontSize: 12,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {i + 1}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{h}</div>
              <div style={{ fontSize: 13, color: C.mute }}>{b}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 18, background: "rgba(208,83,83,0.07)", border: `1px solid rgba(208,83,83,0.3)`, borderRadius: 10, padding: "14px 16px" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.14em", color: C.red, fontWeight: 700, marginBottom: 8, textTransform: "uppercase" }}>
          {tr("rules_title")}
        </div>
        <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 13, color: C.bone, lineHeight: 1.8 }}>
          <li>{tr("rule1")}</li>
          <li>{tr("rule2")}</li>
          <li>{tr("rule3")}</li>
        </ul>
      </div>
    </section>
  );
}
