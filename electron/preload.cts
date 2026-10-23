import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("masterbrowser", {
  invoke: (action: string, arg: unknown) =>
    ipcRenderer.invoke("masterbrowser", action, arg),
});
