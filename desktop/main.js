// NutriFlow AI desktop app — a secure window onto the NutriFlow server.
// The app contains no data and no accounts: everything lives on the server,
// whose address is built in (app-config.json) and can be changed from the menu.
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const BUILT_IN = readJson(path.join(__dirname, "app-config.json")) ?? {};
const SETTINGS_PATH = path.join(app.getPath("userData"), "settings.json");

let mainWindow = null;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function serverUrl() {
  return readJson(SETTINGS_PATH)?.serverUrl || BUILT_IN.serverUrl || "";
}

function normalizeUrl(input) {
  let url;
  try {
    url = new URL(String(input).trim());
  } catch {
    return null;
  }
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null; // never send passwords over plain http
  return url.origin;
}

function isInsideApp(target) {
  try {
    return new URL(target).origin === serverUrl();
  } catch {
    return false;
  }
}

function showLocalPage(mode, extra = {}) {
  const query = new URLSearchParams({ mode, server: serverUrl(), ...extra }).toString();
  mainWindow.loadFile(path.join(__dirname, "connect.html"), { search: query });
}

async function openServer() {
  const url = serverUrl();
  if (!url) return showLocalPage("setup");
  try {
    await mainWindow.loadURL(url);
  } catch {
    // did-fail-load shows the offline page
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: "NutriFlow AI",
    backgroundColor: "#f6f5f1",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => (mainWindow = null));

  const wc = mainWindow.webContents;
  // Stay on the NutriFlow server; open anything else in the normal browser.
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  wc.on("will-navigate", (e, url) => {
    if (url.startsWith("file:") || isInsideApp(url)) return;
    e.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });
  wc.on("did-fail-load", (_e, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* aborted by a new navigation */ || url.startsWith("file:")) return;
    showLocalPage("offline", { error: description });
  });

  openServer();
}

// Only the local connect page may use these (it's loaded from file://).
function fromConnectPage(event) {
  return event.senderFrame?.url.startsWith("file:");
}

ipcMain.handle("nutriflow:save-server", async (event, input) => {
  if (!fromConnectPage(event)) return { ok: false };
  const url = normalizeUrl(input);
  if (!url) return { ok: false, error: "Enter the full https:// address you were given." };
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify({ serverUrl: url }, null, 2));
  openServer();
  return { ok: true };
});

ipcMain.handle("nutriflow:retry", (event) => {
  if (fromConnectPage(event)) openServer();
});

function buildMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "File",
        submenu: [
          { label: "Server address…", click: () => mainWindow && showLocalPage("setup") },
          { label: "Home", accelerator: "Alt+Home", click: () => mainWindow && openServer() },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "View",
        submenu: [{ role: "reload" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }],
      },
      {
        label: "Help",
        submenu: [
          {
            label: "About NutriFlow AI",
            click: () =>
              dialog.showMessageBox(mainWindow, {
                title: "About NutriFlow AI",
                message: `NutriFlow AI ${app.getVersion()}`,
                detail: `Dietitian-controlled nutrition coaching with private AI.\n\nConnected to: ${serverUrl() || "(not set)"}`,
              }),
          },
        ],
      },
    ]),
  );
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(() => {
    buildMenu();
    createWindow();
  });
  app.on("window-all-closed", () => app.quit());
}
