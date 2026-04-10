import { useState } from "react";

import { C as TC, FONT } from "../../data/tokens";
import { ManagerAvatar, randomAvatar, FEATURE_COUNTS } from "./ManagerAvatar.jsx";

const C = { ...TC, bg: "#0a0a1a", bgCard: "rgba(30,41,59,0.6)", bgInput: "#1e293b" };
const F = {
  xl: "clamp(13px,3vw,18px)",
  lg: "clamp(10px,2.5vw,14px)",
  md: "clamp(8px,2vw,11px)",
  sm: "clamp(6px,1.5vw,9px)",
};

const FEATURE_ROWS = [
  { key: "skin", label: "SKIN" },
  { key: "hair", label: "HAIR" },
  { key: "hairColour", label: "HAIR COLOUR" },
  { key: "eyes", label: "EYES" },
  { key: "mouth", label: "MOUTH" },
  { key: "accessory", label: "ACCESSORY" },
];

export function ManagerIdentityScreen({ slotNumber, suggestedName, onConfirm, onBack, generateName }) {
  const [nameInput, setNameInput] = useState(suggestedName || "");
  const [avatar, setAvatar] = useState(() => randomAvatar());

  const cycle = (key, dir) => {
    const max = FEATURE_COUNTS[key];
    setAvatar(prev => ({ ...prev, [key]: ((prev[key] ?? 0) + dir + max) % max }));
  };

  const randomizeAll = () => {
    setAvatar(randomAvatar());
    if (generateName) setNameInput(generateName());
  };

  const canContinue = nameInput.trim().length > 0;
  const handleContinue = () => {
    if (!canContinue) return;
    onConfirm({ managerName: nameInput.trim(), managerAvatar: avatar });
  };

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, color: C.text,
      fontFamily: FONT,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "16px",
    }}>
      <div style={{ textAlign: "center", maxWidth: 460, width: "92%" }}>
        <div style={{
          fontSize: F.xl, color: C.green, letterSpacing: 2, marginBottom: 6,
          textShadow: "0 0 20px rgba(74,222,128,0.4)", lineHeight: 1.4,
        }}>
          🚬 FRUIT CIGS
        </div>
        <div style={{ fontSize: F.sm, color: C.slate, marginBottom: 24, letterSpacing: 1 }}>
          Slot {slotNumber} · New Career · Your Identity
        </div>

        {/* Avatar preview */}
        <div style={{
          display: "flex", justifyContent: "center", marginBottom: 18,
        }}>
          <ManagerAvatar avatar={avatar} size={120} />
        </div>

        {/* Feature pickers */}
        <div style={{
          background: "rgba(15,23,42,0.6)",
          border: `1px solid rgba(74,222,128,0.15)`,
          padding: "12px 14px",
          marginBottom: 16,
        }}>
          {FEATURE_ROWS.map(row => (
            <div key={row.key} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 10, marginBottom: 6,
            }}>
              <button
                onClick={() => cycle(row.key, -1)}
                style={{
                  background: "rgba(30,41,59,0.6)", border: `1px solid rgba(74,222,128,0.25)`,
                  color: C.green, fontFamily: FONT, fontSize: F.sm,
                  padding: "6px 10px", cursor: "pointer", letterSpacing: 1,
                }}
              >◀</button>
              <div style={{
                flex: 1, fontSize: F.sm, color: C.textMuted, letterSpacing: 1,
              }}>{row.label}</div>
              <button
                onClick={() => cycle(row.key, 1)}
                style={{
                  background: "rgba(30,41,59,0.6)", border: `1px solid rgba(74,222,128,0.25)`,
                  color: C.green, fontFamily: FONT, fontSize: F.sm,
                  padding: "6px 10px", cursor: "pointer", letterSpacing: 1,
                }}
              >▶</button>
            </div>
          ))}
        </div>

        {/* Name input */}
        <div style={{ fontSize: F.md, color: C.textMuted, marginBottom: 10, letterSpacing: 1 }}>
          NAME YOUR MANAGER
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            value={nameInput}
            onChange={e => setNameInput(e.target.value.slice(0, 20))}
            onKeyDown={e => {
              if (e.key === "Enter" && canContinue) handleContinue();
              if (e.key === "Escape") onBack();
            }}
            placeholder="e.g. Brian Clough"
            autoFocus
            style={{
              flex: 1, padding: "12px 14px", boxSizing: "border-box",
              background: C.bgInput, border: `2px solid rgba(74,222,128,0.4)`,
              color: C.text, fontSize: F.lg,
              fontFamily: FONT, textAlign: "center", outline: "none",
            }}
          />
          {generateName && (
            <button
              onClick={() => setNameInput(generateName())}
              title="Random name"
              style={{
                padding: "0 14px",
                background: "rgba(30,41,59,0.6)",
                border: `2px solid rgba(74,222,128,0.4)`,
                color: C.green, fontFamily: FONT, fontSize: F.lg,
                cursor: "pointer",
              }}
            >🎲</button>
          )}
        </div>

        {/* Randomize all + continue */}
        <button
          onClick={randomizeAll}
          style={{
            width: "100%", padding: "10px",
            background: "rgba(30,41,59,0.4)",
            border: `1px solid rgba(74,222,128,0.25)`,
            color: C.green, fontFamily: FONT, fontSize: F.sm,
            cursor: "pointer", letterSpacing: 1, marginBottom: 8,
          }}
        >🎲 RANDOMIZE ALL</button>

        <button
          onClick={handleContinue}
          disabled={!canContinue}
          style={{
            width: "100%", padding: "14px",
            background: canContinue ? "linear-gradient(180deg,#166534,#14532d)" : "rgba(30,41,59,0.3)",
            border: canContinue ? `2px solid ${C.green}` : `1px solid rgba(30,41,59,0.8)`,
            color: canContinue ? C.green : C.slate,
            fontFamily: FONT, fontSize: F.md, cursor: canContinue ? "pointer" : "default",
            letterSpacing: 2, marginBottom: 8,
            animation: canContinue ? "glow 2s ease infinite" : "none",
          }}
        >CONTINUE ▶</button>

        <button
          onClick={onBack}
          style={{
            width: "100%", padding: "10px",
            background: "none", border: `1px solid rgba(30,41,59,0.8)`,
            color: C.slate, fontFamily: FONT, fontSize: F.sm, cursor: "pointer",
          }}
        >◀ BACK</button>
      </div>
    </div>
  );
}
