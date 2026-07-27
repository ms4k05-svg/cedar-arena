"use client";

import { C, BODY, MONO } from "@/lib/theme";
import { useT } from "@/lib/i18n";

export function Btn({ children, onClick, kind = "gold", disabled, small, style, type = "button" }) {
  const kinds = {
    gold: { background: C.gold, color: "#1A1408", border: "none" },
    ghost: { background: "transparent", color: C.bone, border: `1px solid ${C.lineSoft}` },
    cedar: { background: C.cedar, color: "#0B1A10", border: "none" },
    danger: { background: "transparent", color: C.red, border: `1px solid rgba(208,83,83,0.4)` },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...kinds[kind],
        fontFamily: BODY,
        fontWeight: 600,
        fontSize: small ? 12 : 14,
        padding: small ? "6px 12px" : "12px 20px",
        borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        letterSpacing: "0.02em",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Field({ label, type = "text", value, onChange, placeholder, hint }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      {label && (
        <div
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: C.mute,
            marginBottom: 6,
            fontWeight: 600,
          }}
        >
          {label}
        </div>
      )}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          boxSizing: "border-box",
          background: C.bg,
          border: `1px solid ${C.lineSoft}`,
          borderRadius: 8,
          padding: "11px 12px",
          color: C.bone,
          fontSize: 16,
          fontFamily: BODY,
          outline: "none",
        }}
      />
      {hint && <div style={{ fontSize: 11, color: C.mute, marginTop: 4 }}>{hint}</div>}
    </label>
  );
}

export function Choice({ label, options, value, onChange, hint }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: C.mute,
          marginBottom: 6,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <div
              key={opt.value}
              onClick={() => onChange(opt.value)}
              style={{
                padding: "9px 14px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                userSelect: "none",
                background: active ? "rgba(233,180,76,0.14)" : C.bg,
                border: `1px solid ${active ? C.gold : C.lineSoft}`,
                color: active ? C.gold : C.mute,
              }}
            >
              {opt.label}
            </div>
          );
        })}
      </div>
      {hint && <div style={{ fontSize: 11, color: C.mute, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export function MultiChoice({ label, options, values, onChange, hint }) {
  const toggle = (v) => {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  };
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: C.mute,
          marginBottom: 6,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {options.map((opt) => {
          const active = values.includes(opt.value);
          return (
            <div
              key={opt.value}
              onClick={() => toggle(opt.value)}
              style={{
                padding: "9px 14px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                userSelect: "none",
                background: active ? "rgba(233,180,76,0.14)" : C.bg,
                border: `1px solid ${active ? C.gold : C.lineSoft}`,
                color: active ? C.gold : C.mute,
              }}
            >
              {active ? "✓ " : ""}{opt.label}
            </div>
          );
        })}
      </div>
      {hint && <div style={{ fontSize: 11, color: C.mute, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export function Tag({ children }) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 12,
        background: "rgba(233,180,76,0.08)",
        border: `1px solid ${C.line}`,
        color: C.gold,
        padding: "2px 7px",
        borderRadius: 5,
        letterSpacing: "0.03em",
        direction: "ltr",
        display: "inline-block",
      }}
    >
      {children}
    </span>
  );
}

export function Pill({ status }) {
  const tr = useT();
  const map = {
    pending: { label: tr("st_pending"), color: C.amber, bg: "rgba(217,160,63,0.12)" },
    confirmed: { label: tr("st_confirmed"), color: C.cedar, bg: "rgba(76,154,99,0.14)" },
  };
  const s = map[status];
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: s.color,
        background: s.bg,
        padding: "3px 9px",
        borderRadius: 20,
        letterSpacing: "0.04em",
      }}
    >
      {s.label}
    </span>
  );
}

export function WhatsAppIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="11" fill="#25D366" />
      <path
        d="M12 5.6a6.3 6.3 0 0 0-5.4 9.6L5.5 18l2.9-1a6.3 6.3 0 1 0 3.6-11.4Zm3.6 8.9c-.15.42-.87.8-1.2.83-.33.04-.64.16-2.15-.45-1.82-.72-2.98-2.57-3.07-2.69-.09-.12-.73-.97-.73-1.86 0-.88.46-1.31.63-1.49a.66.66 0 0 1 .48-.22h.34c.11 0 .26-.04.4.31.15.36.51 1.24.55 1.33.05.09.08.19.02.31-.06.12-.09.19-.18.3l-.27.31c-.09.09-.18.19-.08.37.1.18.46.76 1 1.23.68.6 1.26.79 1.44.88.18.09.28.07.39-.04.1-.12.45-.52.57-.7.12-.18.24-.15.4-.09.16.06 1.04.49 1.22.58.18.09.3.13.34.21.05.08.05.45-.1.87Z"
        fill="#fff"
      />
    </svg>
  );
}

export function WhishBadge({ size = 18 }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: "#C8102E",
        color: "#fff",
        borderRadius: 6,
        padding: "2px 8px",
        fontSize: size * 0.62,
        fontWeight: 700,
        letterSpacing: "0.02em",
        verticalAlign: "middle",
        lineHeight: 1.6,
        direction: "ltr",
      }}
    >
      <svg width={size * 0.7} height={size * 0.7} viewBox="0 0 24 24" fill="none">
        <rect x="2" y="5" width="20" height="14" rx="3" fill="#fff" opacity="0.9" />
        <path d="M6 12h8m0 0-2.6-2.6M14 12l-2.6 2.6" stroke="#C8102E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="18" cy="12" r="1.6" fill="#C8102E" />
      </svg>
      whish
    </span>
  );
}

export function CedarCrown({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M4 28 L8 14 L14 21 L20 8 L26 21 L32 14 L36 28 Z" fill={C.gold} />
      <path
        d="M20 15 L24 21 H21.5 L25 26 H22 L26 31 H21 V34 H19 V31 H14 L18 26 H15 L18.5 21 H16 Z"
        fill={C.cedarDim}
        transform="translate(0,-2) scale(0.85) translate(3,5)"
      />
      <rect x="6" y="29" width="28" height="3" rx="1.5" fill={C.goldDim} />
    </svg>
  );
}

export function Stat({ label, value, accent, small }) {
  return (
    <div
      style={{
        background: "rgba(13,19,34,0.5)",
        border: `1px solid ${C.lineSoft}`,
        borderRadius: 10,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.1em",
          color: C.mute,
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "'Bebas Neue', 'Cairo', sans-serif",
          fontSize: small ? 18 : 26,
          color: accent,
          letterSpacing: "0.04em",
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function SlotMeter({ confirmed, max }) {
  const tr = useT();
  const pct = Math.min(100, Math.round((confirmed / max) * 100));
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          color: C.mute,
          marginBottom: 6,
        }}
      >
        <span>{tr("confirmed_players")}</span>
        <span style={{ color: C.bone, fontWeight: 600, direction: "ltr" }}>
          {confirmed} / {max}
        </span>
      </div>
      <div
        style={{
          height: 8,
          background: "rgba(242,239,230,0.07)",
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: `linear-gradient(90deg, ${C.cedarDim}, ${C.cedar})`,
            transition: "width 0.4s ease",
          }}
        />
      </div>
    </div>
  );
}

export function Panel({ title, children }) {
  return (
    <section
      style={{
        background: C.panel,
        border: `1px solid ${C.lineSoft}`,
        borderRadius: 14,
        padding: "20px 22px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.14em",
          color: C.gold,
          fontWeight: 700,
          marginBottom: 16,
          textTransform: "uppercase",
        }}
      >
        {title}
      </div>
      {children}
    </section>
  );
}
