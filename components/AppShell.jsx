"use client";

import { useApp } from "@/lib/useApp";
import { LangCtx } from "@/lib/i18n";
import { C, DISP, BODY } from "@/lib/theme";
import { Btn, CedarCrown } from "@/components/ui";
import AuthView from "@/components/AuthView";
import ArenaView from "@/components/ArenaView";
import PastView from "@/components/PastView";
import ProfileView from "@/components/ProfileView";
import AdminView from "@/components/AdminView";

export default function AppShell() {
  const app = useApp();
  const { lang, setLang, tr, session, me, isAdmin, view, setView, loading, toast, notices, setNotices } = app;

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: C.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: C.mute,
          fontFamily: BODY,
        }}
      >
        {tr("loading")}
      </div>
    );
  }

  return (
    <LangCtx.Provider value={lang}>
      <div
        dir={lang === "ar" ? "rtl" : "ltr"}
        style={{
          minHeight: "100vh",
          background: `radial-gradient(1200px 500px at 50% -10%, rgba(233,180,76,0.07), transparent), ${C.bg}`,
          color: C.bone,
          fontFamily: BODY,
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: `1px solid ${C.lineSoft}`,
            position: "sticky",
            top: 0,
            background: "rgba(13,19,34,0.92)",
            backdropFilter: "blur(8px)",
            zIndex: 10,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
            onClick={() => setView("arena")}
          >
            <CedarCrown />
            <div>
              <div style={{ fontFamily: DISP, fontSize: 24, letterSpacing: "0.06em", lineHeight: 1 }}>
                CEDAR ARENA
              </div>
              <div style={{ fontSize: 10, color: C.mute, letterSpacing: "0.14em" }}>{tr("tagline")}</div>
            </div>
          </div>
          <nav style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <div
              style={{
                display: "flex",
                gap: 2,
                border: `1px solid ${C.lineSoft}`,
                borderRadius: 8,
                padding: 2,
                marginInlineEnd: 4,
              }}
            >
              {[["en", "EN"], ["ar", "ع"], ["fr", "FR"]].map(([code, label]) => (
                <div
                  key={code}
                  onClick={() => setLang(code)}
                  style={{
                    padding: "4px 8px",
                    fontSize: 11,
                    fontWeight: 700,
                    borderRadius: 6,
                    cursor: "pointer",
                    userSelect: "none",
                    background: lang === code ? "rgba(233,180,76,0.15)" : "transparent",
                    color: lang === code ? C.gold : C.mute,
                  }}
                >
                  {label}
                </div>
              ))}
            </div>
            <Btn kind="ghost" small onClick={() => setView("arena")}>{tr("nav_arena")}</Btn>
            <Btn kind="ghost" small onClick={() => setView("past")}>{tr("nav_past")}</Btn>
            {me && (
              <Btn kind="ghost" small onClick={() => setView("profile")}>{tr("nav_profile")}</Btn>
            )}
            {isAdmin && (
              <Btn kind="ghost" small onClick={() => setView("admin")} style={{ color: C.gold }}>
                {tr("nav_admin")}
              </Btn>
            )}
            {session ? (
              <Btn kind="ghost" small onClick={() => app.logout()}>{tr("nav_logout")}</Btn>
            ) : (
              <Btn small onClick={() => setView("auth")}>{tr("nav_signin")}</Btn>
            )}
          </nav>
        </header>

        <main style={{ maxWidth: 880, margin: "0 auto", padding: "24px 16px 80px" }}>
          {view === "auth" && <AuthView app={app} />}
          {view === "arena" && <ArenaView app={app} />}
          {view === "past" && <PastView app={app} />}
          {view === "profile" && me && <ProfileView app={app} />}
          {view === "admin" && isAdmin && <AdminView app={app} />}
        </main>

        {notices.length > 0 && (
          <div
            style={{
              position: "fixed",
              top: 74,
              left: "50%",
              transform: "translateX(-50%)",
              display: "grid",
              gap: 8,
              zIndex: 60,
              width: "min(420px, 92vw)",
            }}
          >
            {notices.map((n) => (
              <div
                key={n.id}
                onClick={() => setNotices((arr) => arr.filter((x) => x.id !== n.id))}
                style={{
                  background: `linear-gradient(180deg, ${C.panelSoft}, ${C.panel})`,
                  border: `1px solid ${C.gold}`,
                  color: C.bone,
                  padding: "12px 16px",
                  borderRadius: 12,
                  fontSize: 13,
                  fontWeight: 600,
                  boxShadow: "0 10px 34px rgba(0,0,0,0.55)",
                  cursor: "pointer",
                  textAlign: "center",
                }}
              >
                {n.text}
              </div>
            ))}
          </div>
        )}

        {toast && (
          <div
            style={{
              position: "fixed",
              bottom: 22,
              left: "50%",
              transform: "translateX(-50%)",
              background: C.panelSoft,
              border: `1px solid ${C.line}`,
              color: C.bone,
              padding: "12px 20px",
              borderRadius: 10,
              fontSize: 13,
              zIndex: 50,
              maxWidth: "90vw",
              boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
            }}
          >
            {toast}
          </div>
        )}
      </div>
    </LangCtx.Provider>
  );
}
