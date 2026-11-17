"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useData } from "./store";
import { ACCENTS, CATEGORY_COLORS } from "./constants";

function subscribeDark(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}
const getDark = () => document.documentElement.classList.contains("dark");

export function useIsDark() {
  return useSyncExternalStore(subscribeDark, getDark, () => false);
}

export function useCategoryColor(key: string | undefined) {
  const dark = useIsDark();
  const c = CATEGORY_COLORS[key ?? "slate"] ?? CATEGORY_COLORS.slate;
  return dark ? c.dark : c.light;
}

export function colorFor(key: string | undefined, dark: boolean) {
  const c = CATEGORY_COLORS[key ?? "slate"] ?? CATEGORY_COLORS.slate;
  return dark ? c.dark : c.light;
}

/** Keeps <html class="dark"> and the accent variable in sync with settings + OS. */
export function useThemeController() {
  const theme = useData((s) => s.settings.theme);
  const accent = useData((s) => s.settings.accent);

  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches);
      const root = document.documentElement;
      root.classList.toggle("dark", dark);
      const a = ACCENTS[accent] ?? ACCENTS.blue;
      root.style.setProperty("--c-accent", dark ? a.dark : a.light);
      root.style.setProperty("--c-on-accent", dark ? "#0b1020" : "#ffffff");
      const meta = document.querySelectorAll('meta[name="theme-color"]');
      meta.forEach((m) => m.setAttribute("content", dark ? "#0c0d12" : "#f1f2f6"));
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme, accent]);
}
