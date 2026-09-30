// Exposes two actions to the local connect page only. Pages served by the
// NutriFlow server get no extra powers (the handlers check the caller is file://).
const { contextBridge, ipcRenderer } = require("electron");

if (location.protocol === "file:") {
  contextBridge.exposeInMainWorld("nutriflow", {
    saveServer: (url) => ipcRenderer.invoke("nutriflow:save-server", url),
    retry: () => ipcRenderer.invoke("nutriflow:retry"),
  });
}
