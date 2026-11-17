"use client";

import dynamic from "next/dynamic";
import { SplashScreen } from "@/components/splash";

// The app is fully client-side (local-first), so skip SSR to avoid hydration mismatches.
const App = dynamic(() => import("@/components/app").then((m) => m.App), {
  ssr: false,
  loading: () => <SplashScreen />,
});

export default function Page() {
  return <App />;
}
