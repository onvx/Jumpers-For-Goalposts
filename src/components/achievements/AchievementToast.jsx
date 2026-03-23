import React, { useState, useEffect, useRef } from "react";
import { ACHIEVEMENTS } from "../../data/achievements.js";
import { ACH_TO_PACK, CIG_PACKS } from "../../data/cigPacks.js";
import { SFX } from "../../utils/sfx.js";
import { F, C, FONT, Z } from "../../data/tokens";
import { useMobile } from "../../hooks/useMobile.js";

export function AchievementToast({ achievement, onDone, muteSound }) {
  const [visible, setVisible] = useState(false);
  const mob = useMobile();
  const dismissedRef = useRef(false);
  const touchStartY = useRef(null);
  const [swipeOffset, setSwipeOffset] = useState(0);

  useEffect(() => {
    setTimeout(() => setVisible(true), 50);
    if (!muteSound) SFX.achievement();
    // Inject cigBurn keyframe if not already present
    if (!document.getElementById("cig-toast-styles")) {
      const style = document.createElement("style");
      style.id = "cig-toast-styles";
      style.textContent = `@keyframes cigBurn { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }`;
      document.head.appendChild(style);
    }
  }, [muteSound]);

  const dismiss = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setVisible(false);
    setSwipeOffset(0);
    setTimeout(onDone, 400);
  };

  const handleTouchStart = (e) => { touchStartY.current = e.touches[0].clientY; };
  const handleTouchMove = (e) => {
    if (touchStartY.current == null) return;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy < 0) setSwipeOffset(dy);
  };
  const handleTouchEnd = () => {
    if (swipeOffset < -40) dismiss();
    else setSwipeOffset(0);
    touchStartY.current = null;
  };

  const ach = ACHIEVEMENTS.find(a => a.id === achievement);
  if (!ach) { setTimeout(onDone, 100); return null; }

  // Look up pack color for the filter-end strip
  const packId = ACH_TO_PACK[achievement];
  const pack = packId ? CIG_PACKS.find(p => p.id === packId) : null;
  const stripColor = pack?.color || C.gold;

  return (
    <div
      onClick={dismiss}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        position: "fixed", top: mob ? "calc(10px + env(safe-area-inset-top, 0px))" : 20, left: "50%",
        transform: `translateX(-50%) translateY(${visible ? swipeOffset : -80}px)`,
        zIndex: Z.modal, fontFamily: FONT,
        transition: swipeOffset !== 0 ? "opacity 0.4s ease" : "transform 0.4s ease, opacity 0.4s ease",
        opacity: visible ? 1 : 0, cursor: "pointer",
        width: mob ? "calc(100% - 24px)" : "auto",
        maxWidth: mob ? "none" : 520,
      }}
    >
      {/* Cigarette — pixel art style: flat colors, sharp edges */}
      <div style={{
        display: "flex", alignItems: "stretch",
        border: `2px solid ${C.gold}`,
        minHeight: mob ? 52 : 60,
      }}>
        {/* Filter — flat orange/tan */}
        <div style={{
          width: mob ? 72 : 90,
          backgroundColor: "#e8a33e",
          flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: mob ? F.h2 : F.h1 }}>{ach.icon}</span>
        </div>

        {/* Pack color band */}
        <div style={{ width: mob ? 5 : 6, backgroundColor: stripColor, flexShrink: 0 }} />

        {/* Paper body — white, dark text */}
        <div style={{
          flex: 1,
          backgroundColor: "#ffffff",
          padding: mob ? "8px 12px" : "10px 16px",
          display: "flex", alignItems: "center",
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: mob ? F.sm : F.md, color: "#0f0f23", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: "bold" }}>{ach.name}</div>
            <div style={{ fontSize: mob ? F.micro : F.xs, color: "#0f0f23", marginTop: 2, opacity: 0.6 }}>{ach.desc}</div>
          </div>
        </div>

        {/* Burning tip — flat orange + grey ash */}
        <div style={{ display: "flex", flexShrink: 0 }}>
          <div style={{ width: mob ? 8 : 10, backgroundColor: "#f97316" }} />
          <div style={{ width: mob ? 10 : 14, backgroundColor: "#6b7280" }} />
        </div>
      </div>
    </div>
  );
}
