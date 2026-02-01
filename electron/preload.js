import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  scanner: {
    start: (batchName) => ipcRenderer.invoke('scanner:start', batchName),
    getDevices: () => ipcRenderer.invoke('scanner:getDevices'),
  },
})
