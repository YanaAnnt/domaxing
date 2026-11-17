"use client";

import { Moon, Sun } from "lucide-react";
import { useData } from "@/lib/store";
import { useIsDark } from "@/lib/theme";
import { Button } from "./ui/primitives";

/** One-tap switch between light and dark (Settings → Appearance also offers "System"). */
export function ThemeToggle({ size = "icon-sm" }: { size?: "icon" | "icon-sm" }) {
  const dark = useIsDark();
  const label = dark ? "Switch to light theme" : "Switch to dark theme";
  return (
    <Button
      variant="ghost"
      size={size}
      aria-label={label}
      title={label}
      onClick={() => useData.getState().updateSettings({ theme: dark ? "light" : "dark" })}
    >
      {dark ? <Sun className={size === "icon" ? "size-5" : "size-4"} /> : <Moon className={size === "icon" ? "size-5" : "size-4"} />}
    </Button>
  );
}
