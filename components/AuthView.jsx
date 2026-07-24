"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { C } from "@/lib/theme";
import { Btn, Field, WhatsAppIcon } from "@/components/ui";
import { waLink } from "@/lib/helpers";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function AuthView({ app }) {
  const tr = useT();
  const [firstUser, setFirstUser] = useState(false);
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [tag, setTag] = useState("");
  const [username, setUsername] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  useEffect(() => {
    let alive = true;
    supabaseBrowser()
      .rpc("no_accounts_yet")
      .then(({ data }) => {
        if (alive && data) {
          setFirstUser(true);
          setMode("signup");
        }
      });
    return () => { alive = false; };
  }, []);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    const e =
      mode === "signup"
        ? await app.signup({ email, password, phone, tag, username })
        : await app.login({ email, password });
    if (e) setErr(e);
    setBusy(false);
  };

  const settings = app.settings;

  return (
    <div style={{ maxWidth: 420, margin: "20px auto" }}>
      <div style={{ background: C.panel, border: `1px solid ${C.lineSoft}`, borderRadius: 14, padding: 24 }}>
        <div style={{ fontFamily: "'Bebas Neue', 'Cairo', sans-serif", fontSize: 34, letterSpacing: "0.04em", marginBottom: 4 }}>
          {mode === "signup" ? tr("auth_join") : tr("auth_welcome")}
        </div>
        {firstUser && mode === "signup" && (
          <div
            style={{
              fontSize: 12,
              color: C.gold,
              background: "rgba(233,180,76,0.08)",
              border: `1px solid ${C.line}`,
              borderRadius: 8,
              padding: "8px 12px",
              marginBottom: 16,
            }}
          >
            {tr("auth_first_admin")}
          </div>
        )}
        <div style={{ height: 10 }} />
        <Field label={tr("f_email")} value={email} onChange={setEmail} placeholder="you@example.com" />
        <Field
          label={tr("f_password")}
          type="password"
          value={password}
          onChange={setPassword}
          placeholder={mode === "login" ? tr("f_password_login_ph") : tr("f_password_ph")}
        />
        {mode === "signup" && (
          <>
            <Field
              label={tr("f_username")}
              value={username}
              onChange={setUsername}
              placeholder={tr("f_username_ph")}
              hint={tr("f_username_hint")}
            />
            <Field
              label={tr("f_phone")}
              value={phone}
              onChange={setPhone}
              placeholder="03 123 456"
              hint={tr("f_phone_hint")}
            />
            <Field
              label={tr("f_tag")}
              value={tag}
              onChange={setTag}
              placeholder="#2PP0V9L"
              hint={tr("f_tag_hint")}
            />
          </>
        )}
        {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{err}</div>}
        <Btn onClick={submit} disabled={busy} style={{ width: "100%" }}>
          {busy ? tr("busy") : mode === "signup" ? tr("btn_create") : tr("btn_login")}
        </Btn>
        {mode === "login" && (
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <span
              style={{ color: C.mute, fontSize: 12, cursor: "pointer", textDecoration: "underline" }}
              onClick={() => setShowForgot((v) => !v)}
            >
              {tr("forgot")}
            </span>
            {showForgot && (
              <div
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  color: C.bone,
                  background: "rgba(233,180,76,0.07)",
                  border: `1px solid ${C.line}`,
                  borderRadius: 8,
                  padding: "10px 12px",
                  textAlign: "start",
                  lineHeight: 1.7,
                }}
              >
                {tr("forgot_info", settings?.contact || "")}
                {settings?.contact && waLink(settings.contact) && (
                  <div style={{ marginTop: 8 }}>
                    <a
                      href={waLink(settings.contact)}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        color: "#25D366",
                        fontWeight: 700,
                        textDecoration: "none",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        direction: "ltr",
                      }}
                    >
                      <WhatsAppIcon /> {settings.contact}
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <div style={{ textAlign: "center", marginTop: 14, fontSize: 13, color: C.mute }}>
          {mode === "signup" ? (
            <>
              {tr("have_acct")}{" "}
              <span style={{ color: C.gold, cursor: "pointer" }} onClick={() => { setMode("login"); setErr(null); }}>
                {tr("link_login")}
              </span>
            </>
          ) : (
            <>
              {tr("new_here")}{" "}
              <span style={{ color: C.gold, cursor: "pointer" }} onClick={() => { setMode("signup"); setErr(null); }}>
                {tr("link_signup")}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
