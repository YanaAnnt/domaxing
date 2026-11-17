"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { LogoMark } from "./logo";

export const PHRASE = { a: "One day", or: "or", b: "day one.", c: "You decide." };

/** The opening phrase. `still` renders it without entrance animation (used while the app loads). */
export function SplashPhrase({ still }: { still?: boolean }) {
  const anim = (delay: number) =>
    still ? undefined : ({ animation: `splash-rise 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) ${delay}s both` } as React.CSSProperties);
  return (
    <div className="flex flex-col items-center px-8 text-center">
      <div style={anim(0)} className="mb-10 opacity-90">
        <LogoMark size={40} />
      </div>
      <h1 className="text-[44px] font-semibold leading-[1.05] tracking-[-0.045em] sm:text-[64px]">
        <span style={anim(0.15)} className="block text-fg/45">
          {PHRASE.a}
        </span>
        <span style={anim(0.55)} className="block">
          <span className="text-[0.5em] font-medium tracking-[-0.01em] text-muted">{PHRASE.or} </span>
          <span className="bg-gradient-to-r from-[var(--c-accent)] via-[color-mix(in_oklab,var(--c-accent)_70%,#e05a9a)] to-[color-mix(in_oklab,var(--c-accent)_55%,#e08a3c)] bg-clip-text text-transparent">
            {PHRASE.b}
          </span>
        </span>
      </h1>
      <p style={anim(1.05)} className="mt-7 text-[12px] font-semibold uppercase tracking-[0.32em] text-muted">
        {PHRASE.c}
      </p>
    </div>
  );
}

/** Static version shown before the app's code has loaded. */
export function SplashScreen() {
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center" aria-label="Domaxing: One day or day one. You decide.">
      <SplashPhrase still />
    </div>
  );
}

const SEEN_KEY = "domaxing-splash-seen";

/** Plays the opening phrase once per launch, then fades away. Tap, click or any key skips it. */
export function OpeningSplash() {
  const [phase, setPhase] = React.useState<"show" | "leaving" | "gone">(() => {
    try {
      return sessionStorage.getItem(SEEN_KEY) ? "gone" : "show";
    } catch {
      return "show";
    }
  });

  const leave = React.useCallback(() => {
    setPhase((p) => (p === "show" ? "leaving" : p));
  }, []);

  React.useEffect(() => {
    if (phase !== "show") return;
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* private mode */
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(leave, reduced ? 1500 : 3300);
    const onKey = () => leave();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [phase, leave]);

  React.useEffect(() => {
    if (phase !== "leaving") return;
    const t = setTimeout(() => setPhase("gone"), 650);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === "gone") return null;
  return (
    <div
      role="presentation"
      onClick={leave}
      className={cn(
        "fixed inset-0 z-[90] grid cursor-pointer place-items-center transition-[opacity,filter,transform] duration-[650ms] ease-out",
        phase === "leaving" && "pointer-events-none scale-[1.03] opacity-0 blur-sm",
      )}
    >
      {/* the same soft canvas as the app, so the hand-off is seamless */}
      <div aria-hidden className="absolute inset-0 bg-[var(--c-bg)]" />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(55vw 55vh at 6% 0%, var(--g1), transparent 70%), radial-gradient(50vw 50vh at 100% 6%, var(--g2), transparent 70%), radial-gradient(60vw 60vh at 85% 100%, var(--g3), transparent 70%), radial-gradient(50vw 55vh at 0% 100%, var(--g4), transparent 70%)",
        }}
      />
      <div className="relative">
        <SplashPhrase />
      </div>
    </div>
  );
}
