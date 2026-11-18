"use client";

// The user's own AI settings: their Anthropic API key and chosen model.
// Kept in its own store on this device only. It is never part of a backup or cloud sync.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { DEFAULT_MODEL, MODELS } from "./models";

export type ConnectionStatus = { state: "untested" } | { state: "ok"; checkedAt: string } | { state: "error"; message: string };

interface AISettingsState {
  apiKey: string;
  model: string;
  status: ConnectionStatus;
  setApiKey: (key: string) => void;
  setModel: (model: string) => void;
  setStatus: (status: ConnectionStatus) => void;
  forgetKey: () => void;
}

export const useAISettings = create<AISettingsState>()(
  persist(
    (set) => ({
      apiKey: "",
      model: DEFAULT_MODEL,
      status: { state: "untested" },
      setApiKey: (apiKey) => set({ apiKey: apiKey.trim(), status: { state: "untested" } }),
      setModel: (model) => set({ model: MODELS.some((m) => m.id === model) ? model : DEFAULT_MODEL, status: { state: "untested" } }),
      setStatus: (status) => set({ status }),
      forgetKey: () => set({ apiKey: "", status: { state: "untested" } }),
    }),
    {
      name: "domaxing-ai-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ apiKey: s.apiKey, model: s.model, status: s.status }),
    },
  ),
);
