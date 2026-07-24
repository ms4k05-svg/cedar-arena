"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { C, DISP } from "@/lib/theme";
import { Btn, Field, Tag, Panel } from "@/components/ui";

export default function ProfileView({ app }) {
  const tr = useT();
  const me = app.me;
  const [name, setName] = useState(me.username || "");
  const [currPass, setCurrPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [nameErr, setNameErr] = useState(null);
  const [passErr, setPassErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const saveName = async () => {
    setBusy(true);
    setNameErr(null);
    const e = await app.updateUsername(name);
    if (e) setNameErr(e);
    setBusy(false);
  };

  const savePass = async () => {
    if (newPass !== confirmPass) {
      setPassErr(tr("err_pass_match"));
      return;
    }
    setBusy(true);
    setPassErr(null);
    const e = await app.updatePassword(currPass, newPass);
    if (e) setPassErr(e);
    else {
      setCurrPass("");
      setNewPass("");
      setConfirmPass("");
    }
    setBusy(false);
  };

  return (
    <div style={{ display: "grid", gap: 18, maxWidth: 480, margin: "0 auto" }}>
      <div style={{ fontFamily: DISP, fontSize: 30, letterSpacing: "0.05em" }}>{tr("prof_title")}</div>

      {me.must_change_password && (
        <div style={{ background: "rgba(217,160,63,0.1)", border: `1px solid rgba(217,160,63,0.4)`, borderRadius: 10, padding: "12px 14px", fontSize: 13, color: C.amber, fontWeight: 600 }}>
          ⚠ {tr("temp_note")}
        </div>
      )}

      <Panel title={tr("prof_account")}>
        <div style={{ display: "grid", gap: 10, fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span style={{ color: C.mute }}>{tr("f_email")}</span>
            <span style={{ direction: "ltr" }}>{me.email}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span style={{ color: C.mute }}>{tr("f_phone")}</span>
            <span style={{ direction: "ltr" }}>{me.phone}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ color: C.mute }}>{tr("f_tag")}</span>
            <Tag>{me.player_tag}</Tag>
          </div>
          <div style={{ fontSize: 11, color: C.mute }}>🔒 {tr("prof_tag_note")}</div>
        </div>
      </Panel>

      <Panel title={tr("prof_uname_sec")}>
        <Field label={tr("f_username")} value={name} onChange={setName} placeholder={tr("f_username_ph")} hint={tr("prof_uname_hint")} />
        {nameErr && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{nameErr}</div>}
        <Btn small onClick={saveName} disabled={busy || !name.trim() || name.trim() === me.username}>
          {tr("prof_save_name")}
        </Btn>
      </Panel>

      <Panel title={tr("prof_pass_sec")}>
        <Field label={tr("f_curr_pass")} type="password" value={currPass} onChange={setCurrPass} />
        <Field label={tr("f_new_pass")} type="password" value={newPass} onChange={setNewPass} placeholder={tr("f_password_ph")} />
        <Field label={tr("f_confirm_pass")} type="password" value={confirmPass} onChange={setConfirmPass} />
        {passErr && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{passErr}</div>}
        <Btn small onClick={savePass} disabled={busy || !currPass || !newPass || !confirmPass}>
          {tr("prof_save_pass")}
        </Btn>
      </Panel>
    </div>
  );
}
