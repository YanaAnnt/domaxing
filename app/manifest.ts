import type { MetadataRoute } from "next";
import { withBase } from "@/lib/utils";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Domaxing",
    short_name: "Domaxing",
    description: "One day or day one. You decide.",
    start_url: withBase("/#/today"),
    scope: withBase("/"),
    display: "standalone",
    orientation: "portrait",
    background_color: "#f1f2f6",
    theme_color: "#f1f2f6",
    categories: ["productivity"],
    icons: [
      { src: withBase("/icons/icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: withBase("/icons/icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: withBase("/icons/maskable-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Today", url: withBase("/#/today") },
      { name: "Inbox", url: withBase("/#/inbox") },
    ],
  };
}
