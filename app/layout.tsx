import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { withBase } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Domaxing",
  description: "One day or day one. You decide.",
  applicationName: "Domaxing",
  appleWebApp: { capable: true, title: "Domaxing", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: withBase("/icons/icon-192.png"), sizes: "192x192", type: "image/png" }],
    apple: [{ url: withBase("/icons/apple-touch-icon.png"), sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f2f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0d12" },
  ],
};

// Applies the saved theme before first paint to avoid a flash.
const themeScript = `
try {
  var s = JSON.parse(localStorage.getItem('tidy-data-v1') || '{}').state || {};
  var t = (s.settings && s.settings.theme) || 'system';
  var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) document.documentElement.classList.add('dark');
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>{children}</body>
    </html>
  );
}
