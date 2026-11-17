// Domaxing desktop: a thin Electron shell around the same static build that powers the website.
// The app is served from a private `app://domaxing` origin so local data (localStorage) stays
// stable between launches and the service worker, notifications and PWA features keep working.
const { app, BrowserWindow, protocol, net, shell, Menu } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const SCHEME = "app";
const HOST = "domaxing";
const ROOT = path.join(__dirname, "..", "dist-web");

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, allowServiceWorkers: true, corsEnabled: true } },
]);

// `--data-dir=<folder>` keeps all app data (tasks, settings, caches) in that folder instead of
// %APPDATA%\Domaxing. `npm run desktop` uses it so a development run stays inside the project.
const dataDirArg = process.argv.find((a) => a.startsWith("--data-dir="));
if (dataDirArg) app.setPath("userData", path.resolve(dataDirArg.slice("--data-dir=".length)));

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;

function resolveFile(urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.normalize(path.join(ROOT, rel));
  // Never serve anything outside the bundled site.
  if (!file.startsWith(ROOT)) return path.join(ROOT, "404.html");
  return file;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 380,
    minHeight: 560,
    title: "Domaxing",
    backgroundColor: "#0c0d12",
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, "..", "public", "icons", "icon-512.png"),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true },
  });
  win.once("ready-to-show", () => win.show());

  // Links to other sites (calendar help pages, OAuth, docs) open in the user's browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`${SCHEME}://`)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`${SCHEME}://`)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  win.loadURL(`${SCHEME}://${HOST}/#/today`);
}

app.on("second-instance", () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  app.setAppUserModelId("com.yanaannt.domaxing"); // Windows notifications show the app name
  Menu.setApplicationMenu(null);
  protocol.handle(SCHEME, async (request) => {
    const { pathname } = new URL(request.url);
    const res = await net.fetch(pathToFileURL(resolveFile(pathname)).toString()).catch(() => null);
    if (res && res.ok) return res;
    return net.fetch(pathToFileURL(path.join(ROOT, "404.html")).toString());
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
