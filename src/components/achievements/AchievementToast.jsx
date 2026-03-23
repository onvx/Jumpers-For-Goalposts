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
      {/* Cigarette shape */}
      <div style={{
        display: "flex", alignItems: "stretch",
        borderRadius: 6,
        overflow: "hidden",
        border: `1px solid ${C.gold}`,
        boxShadow: `0 0 24px rgba(250,204,21,0.2), 0 4px 16px rgba(0,0,0,0.4)`,
        minHeight: mob ? 56 : 64,
      }}>
        {/* Filter tip — cork/tan with sporadic speckle texture + icon */}
        <div style={{
          width: mob ? 80 : 100,
          backgroundColor: "#c89560",
          backgroundImage: [
            "radial-gradient(ellipse 2px 1px at 15% 20%, rgba(218,175,100,0.8) 0%, transparent 100%)",
            "radial-gradient(ellipse 1px 2px at 72% 35%, rgba(230,190,120,0.7) 0%, transparent 100%)",
            "radial-gradient(ellipse 3px 1px at 40% 70%, rgba(210,165,90,0.6) 0%, transparent 100%)",
            "radial-gradient(ellipse 1px 1px at 85% 80%, rgba(240,200,130,0.7) 0%, transparent 100%)",
            "radial-gradient(ellipse 2px 2px at 25% 55%, rgba(225,185,110,0.5) 0%, transparent 100%)",
            "radial-gradient(ellipse 1px 3px at 60% 15%, rgba(215,170,95,0.6) 0%, transparent 100%)",
            "radial-gradient(ellipse 2px 1px at 50% 90%, rgba(235,195,125,0.7) 0%, transparent 100%)",
            "radial-gradient(ellipse 1px 1px at 10% 45%, rgba(220,180,105,0.5) 0%, transparent 100%)",
            "radial-gradient(ellipse 2px 2px at 90% 60%, rgba(210,160,85,0.6) 0%, transparent 100%)",
            "radial-gradient(ellipse 1px 2px at 35% 30%, rgba(240,205,135,0.7) 0%, transparent 100%)",
          ].join(", "),
          flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: mob ? F.h2 : F.h1 }}>{ach.icon}</span>
        </div>

        {/* Pack color strip — menthol/popper band */}
        <div style={{
          width: mob ? 5 : 7,
          backgroundColor: stripColor,
          flexShrink: 0,
        }} />

        {/* Paper body — off-white with dark text */}
        <div style={{
          flex: 1,
          backgroundColor: "#f0ead6",
          padding: mob ? "10px 12px" : "12px 16px",
          display: "flex", alignItems: "center",
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: mob ? F.sm : F.md, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: "bold" }}>{ach.name}</div>
            <div style={{ fontSize: mob ? F.micro : F.xs, color: "#1e293b", marginTop: 2, opacity: 0.7 }}>{ach.desc}</div>
          </div>
        </div>

        {/* Burning end — ember to ash */}
        <div style={{
          width: mob ? 18 : 24,
          flexShrink: 0,
          background: "linear-gradient(90deg, #f0ead6 0%, #8b7355 15%, #f97316 40%, #ef4444 65%, #4b4b4b 85%, #6b7280 100%)",
          position: "relative",
          overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(circle at 50% 50%, rgba(251,146,60,0.8) 0%, rgba(239,68,68,0.5) 40%, transparent 70%)",
            animation: "cigBurn 1.5s ease-in-out infinite",
          }} />
        </div>
      </div>
    </div>
  );
}
