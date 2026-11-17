"use client";

import { useId } from "react";

// Shared geometry (32×32 grid), mirrored in scripts/gen-icons.mjs for the PNG app icons.
// A "D" with a check cut out of it: Domaxing + done.
const D_PATH = "M10 9H16A7 7 0 0 1 16 23H10A1 1 0 0 1 9 22V10A1 1 0 0 1 10 9Z";
const CHECK_PATH = "M12.6 16.3L14.9 18.6L19.4 14.1";

/**
 * Glass app mark. Adapts to the theme through the --logo-* variables in globals.css:
 * light = clear glass with a faint pastel tint and a black "D"; dark = smoked black glass with a white "D".
 */
export function LogoMark({ size = 22 }: { size?: number }) {
  // Unique per instance: a hidden copy (e.g. the desktop sidebar on iPhone) must not own the defs.
  const uid = useId().replace(/:/g, "");
  const id = (name: string) => `domaxing-${name}-${uid}`;
  const stop = (offset: number, color: string, opacity = 1) => (
    <stop offset={offset} style={{ stopColor: color, stopOpacity: opacity }} />
  );
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={id("tile")} x1="0" y1="0" x2="0" y2="1">
          {stop(0, "var(--logo-tile-a)")}
          {stop(1, "var(--logo-tile-b)")}
        </linearGradient>
        {/* Pastel light bleeding through the glass (lavender top-left, peach right, mint bottom) */}
        <radialGradient id={id("t1")} cx="0.15" cy="0.25" r="0.6">
          {stop(0, "#c9bcff", 0.9)}
          {stop(1, "#c9bcff", 0)}
        </radialGradient>
        <radialGradient id={id("t2")} cx="0.9" cy="0.3" r="0.55">
          {stop(0, "#ffd2bf", 0.8)}
          {stop(1, "#ffd2bf", 0)}
        </radialGradient>
        <radialGradient id={id("t3")} cx="0.8" cy="0.95" r="0.6">
          {stop(0, "#bdeed6", 0.85)}
          {stop(1, "#bdeed6", 0)}
        </radialGradient>
        <linearGradient id={id("sheen")} x1="0" y1="0" x2="0" y2="1">
          {stop(0, "#ffffff", 1)}
          {stop(1, "#ffffff", 0)}
        </linearGradient>
        <linearGradient id={id("rim")} x1="0" y1="0" x2="0" y2="1">
          {stop(0, "var(--logo-rim)")}
          {stop(0.45, "var(--logo-rim)", 0)}
          {stop(1, "var(--logo-rim)", 0.25)}
        </linearGradient>
        <linearGradient id={id("glyph")} x1="0" y1="0" x2="0" y2="1">
          {stop(0, "var(--logo-glyph-a)")}
          {stop(1, "var(--logo-glyph-b)")}
        </linearGradient>
        <clipPath id={id("clip")}>
          <rect x="1" y="1" width="30" height="30" rx="9" />
        </clipPath>
        <mask id={id("check")} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
          <rect width="32" height="32" fill="white" />
          <path d={CHECK_PATH} fill="none" stroke="black" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
        </mask>
      </defs>

      {/* Glass tile */}
      <rect x="1" y="1" width="30" height="30" rx="9" fill={`url(#${id("tile")})`} />
      <g clipPath={`url(#${id("clip")})`}>
        <g style={{ opacity: "var(--logo-tint)" }}>
          <rect width="32" height="32" fill={`url(#${id("t1")})`} />
          <rect width="32" height="32" fill={`url(#${id("t2")})`} />
          <rect width="32" height="32" fill={`url(#${id("t3")})`} />
        </g>
        {/* Curved specular sheen across the top */}
        <path d="M0 0H32V9C24 7.5 14 9.5 0 15Z" fill={`url(#${id("sheen")})`} style={{ opacity: "var(--logo-sheen)" }} />
      </g>
      {/* Bright rim on the top edge + hairline so the tile holds on any background */}
      <rect x="1.4" y="1.4" width="29.2" height="29.2" rx="8.6" fill="none" stroke={`url(#${id("rim")})`} strokeWidth="0.8" />
      <rect x="1.15" y="1.15" width="29.7" height="29.7" rx="8.85" fill="none" style={{ stroke: "var(--logo-edge)" }} strokeWidth="0.3" />

      {/* The mark */}
      <path d={D_PATH} fill={`url(#${id("glyph")})`} mask={`url(#${id("check")})`} />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-[-0.02em]">Domaxing</span>
    </div>
  );
}
