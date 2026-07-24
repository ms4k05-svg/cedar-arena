"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { C, BODY } from "@/lib/theme";
import { Btn } from "@/components/ui";
import { compressImage } from "@/lib/helpers";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uploadMatchImage, getMatchImageUrl } from "@/lib/storage";

export default function MatchChat({ tournamentId, roundIdx, matchIdx, title, me, onClose }) {
  const tr = useT();
  const supabase = supabaseBrowser();
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("tournament_id", tournamentId)
      .eq("round_idx", roundIdx)
      .eq("match_idx", matchIdx)
      .order("created_at", { ascending: true });
    setMsgs(data || []);
  }, [supabase, tournamentId, roundIdx, matchIdx]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`chat-${tournamentId}-${roundIdx}-${matchIdx}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        (payload) => {
          const m = payload.new;
          if (m.round_idx === roundIdx && m.match_idx === matchIdx) {
            setMsgs((prev) => [...prev, m]);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, load, tournamentId, roundIdx, matchIdx]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await supabase.from("messages").insert({
        tournament_id: tournamentId,
        round_idx: roundIdx,
        match_idx: matchIdx,
        sender_id: me.id,
        sender_name: me.username || me.player_tag,
        text: body.slice(0, 300),
      });
      setText("");
    } finally {
      setSending(false);
    }
  };

  const sendImage = async (file) => {
    if (!file || sending) return;
    setSending(true);
    try {
      let blob = await compressImage(file, 1000, 0.8);
      if (blob.size > 900000) blob = await compressImage(file, 800, 0.6);
      if (blob.size > 1500000) throw new Error("too large");
      const { path, error } = await uploadMatchImage(tournamentId, roundIdx, matchIdx, blob);
      if (error) throw error;
      await supabase.from("messages").insert({
        tournament_id: tournamentId,
        round_idx: roundIdx,
        match_idx: matchIdx,
        sender_id: me.id,
        sender_name: me.username || me.player_tag,
        image_path: path,
      });
    } catch {
      alert(tr("t_img_fail"));
    } finally {
      setSending(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div style={{ marginTop: 16, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${C.lineSoft}`, background: C.panelSoft }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          💬 {tr("chat_title")} — <span style={{ color: C.gold }}>{title}</span>
        </div>
        <span onClick={onClose} style={{ cursor: "pointer", color: C.mute, fontSize: 18, lineHeight: 1 }}>×</span>
      </div>
      <div style={{ maxHeight: 300, overflowY: "auto", padding: "12px 14px", display: "grid", gap: 8 }}>
        {msgs.length === 0 && (
          <div style={{ fontSize: 12, color: C.mute }}>
            {tr("chat_empty")}
            <div style={{ marginTop: 6, color: C.red }}>{tr("chat_rules")}</div>
          </div>
        )}
        {msgs.map((m) => {
          const mine = m.sender_id === me.id;
          return (
            <div key={m.id} style={{ justifySelf: mine ? "end" : "start", maxWidth: "80%" }}>
              <div style={{ fontSize: 10, color: C.mute, marginBottom: 2, textAlign: mine ? "end" : "start" }}>
                {mine ? tr("you") : m.sender_name} ·{" "}
                {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
              <div
                style={{
                  background: m.is_noshow ? "rgba(208,83,83,0.1)" : mine ? "rgba(233,180,76,0.12)" : C.panelSoft,
                  border: `1px solid ${m.is_noshow ? "rgba(208,83,83,0.4)" : mine ? C.line : C.lineSoft}`,
                  borderRadius: 10,
                  padding: m.image_path ? 4 : "8px 12px",
                  fontSize: 13,
                  wordBreak: "break-word",
                  color: m.is_noshow ? C.red : undefined,
                  fontWeight: m.is_noshow ? 600 : undefined,
                }}
              >
                {m.is_noshow ? tr("noshow_msg", m.sender_name) : m.image_path ? <ChatImage path={m.image_path} /> : m.text}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderTop: `1px solid ${C.lineSoft}`, alignItems: "center" }}>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => sendImage(e.target.files?.[0])} />
        <div
          onClick={() => !sending && fileRef.current?.click()}
          title={tr("chat_img_hint")}
          style={{ cursor: sending ? "wait" : "pointer", fontSize: 20, opacity: sending ? 0.4 : 0.85, userSelect: "none", flexShrink: 0 }}
        >
          📎
        </div>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={tr("chat_ph")}
          maxLength={300}
          style={{ flex: 1, background: C.bg, border: `1px solid ${C.lineSoft}`, borderRadius: 8, padding: "10px 12px", color: C.bone, fontSize: 16, fontFamily: BODY, outline: "none", minWidth: 0 }}
        />
        <Btn small onClick={send} disabled={sending || !text.trim()}>{tr("send")}</Btn>
      </div>
    </div>
  );
}

function ChatImage({ path }) {
  const [src, setSrc] = useState(null);
  const [big, setBig] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const url = await getMatchImageUrl(path);
      if (!alive) return;
      if (url) setSrc(url);
      else setFailed(true);
    })();
    return () => { alive = false; };
  }, [path]);

  if (failed) return <div style={{ fontSize: 12, color: C.mute, padding: "6px 8px" }}>🖼 …</div>;
  if (!src) return <div style={{ fontSize: 12, color: C.mute, padding: "6px 8px" }}>🖼 ⏳</div>;
  return (
    <img
      src={src}
      alt="screenshot"
      onClick={() => setBig((v) => !v)}
      style={{ display: "block", maxWidth: big ? "min(86vw, 520px)" : 200, borderRadius: 8, cursor: "zoom-in", transition: "max-width 0.15s ease" }}
    />
  );
}
