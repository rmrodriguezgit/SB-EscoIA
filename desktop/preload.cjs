// Preload seguro (contextIsolation + sandbox): expone una sola función acotada.
// No da acceso a Node, al sistema de archivos ni a ipcRenderer completo.
const { contextBridge, ipcRenderer } = require("electron");
const VIEWS = ["cuerdas"];
contextBridge.exposeInMainWorld("escoia", {
  openWindow: (view) => (VIEWS.includes(view) ? ipcRenderer.invoke("escoia:open-window", view) : Promise.resolve(false)),
});
