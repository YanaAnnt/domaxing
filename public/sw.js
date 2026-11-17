/* Domaxing service worker: offline app shell + notification clicks. */
const VERSION = "tidy-v3";
// The app may live under a sub-path (e.g. GitHub Pages), so every URL is relative to the SW scope.
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const ROOT = `${BASE}/`;
// On localhost (development) never cache, so code changes always show up.
const DEV = ["localhost", "127.0.0.1", "[::1]"].includes(self.location.hostname);
const SHELL = [ROOT, `${BASE}/manifest.webmanifest`, `${BASE}/icons/icon-192.png`, `${BASE}/icons/apple-touch-icon.png`];
const ICON = `${BASE}/icons/icon-192.png`;
// The backend sends root-relative links like "/#/today"; point them at the app sub-path.
const toApp = (u) => (BASE && u.startsWith("/") && !u.startsWith(ROOT) ? BASE + u : u);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (DEV || req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never cache Supabase / API traffic

  // Navigations: network first, fall back to the cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(ROOT, copy));
          return res;
        })
        .catch(() => caches.match(ROOT).then((r) => r || caches.match(req))),
    );
    return;
  }

  // Hashed build assets are immutable: cache first.
  if (url.pathname.startsWith(`${BASE}/_next/static/`) || url.pathname.startsWith(`${BASE}/icons/`)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Everything else: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    }),
  );
});

// Server push (reminders, daily briefing, new suggestions). Works even when the app is closed.
self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch (e) {
    d = { title: "Domaxing", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(d.title || "Domaxing", {
      body: d.body || "",
      tag: d.tag || undefined,
      icon: ICON,
      badge: ICON,
      data: { taskId: d.taskId || null, url: d.url ? toApp(d.url) : `${ROOT}#/today` },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = data.url || `${ROOT}#/today`;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const client = list[0];
      if (client) {
        client.focus();
        client.postMessage({ type: "open-url", url, taskId: data.taskId || null });
        return;
      }
      return self.clients.openWindow(url);
    }),
  );
});
