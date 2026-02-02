import { contextBridge, ipcRenderer } from 'electron'

console.log('Preload script starting...')

// Type definitions for the exposed API
export interface ScanResult {
  success: boolean
  message?: string
  cardCount?: number
}

export interface ScanProgress {
  current: number
  total: number
  preview?: string // Base64 encoded image
}

export interface ScannerDevice {
  id: string
  name: string
  model: string
}

export interface Settings {
  dpi: number
  format: 'png' | 'jpg'
  margin: number
  jpgQuality: number
  outputDirectory: string
  deviceId: string
  duplex: boolean
  // Scanner color adjustments (applied during scan)
  scannerBrightness: number  // -50 to 50
  scannerContrast: number    // -50 to 50
  scannerGamma: number       // 0.5 to 2.0
  // Post-processing color adjustments (applied after scan)
  saturation: number         // 0.5 to 1.5
}

// ============================================================
// Expose API to renderer via contextBridge
// SECURITY: Never expose full ipcRenderer - only specific methods
// ============================================================

contextBridge.exposeInMainWorld('electronAPI', {
  // Scanner operations
  scanner: {
    start: (batchName: string): Promise<ScanResult> =>
      ipcRenderer.invoke('scanner:start', batchName),
    stop: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('scanner:stop'),
    getDevices: (): Promise<ScannerDevice[]> =>
      ipcRenderer.invoke('scanner:getDevices'),
    isScanning: (): Promise<boolean> =>
      ipcRenderer.invoke('scanner:isScanning'),
  },

  // Settings
  settings: {
    get: (): Promise<Settings> =>
      ipcRenderer.invoke('settings:get'),
    set: (settings: Partial<Settings>): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('settings:set', settings),
  },

  // Event listeners - filter event object, only pass data
  onScanProgress: (callback: (progress: ScanProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: ScanProgress) => callback(data)
    ipcRenderer.on('scan:progress', handler)
    return () => ipcRenderer.removeListener('scan:progress', handler)
  },

  onScanComplete: (callback: (result: ScanResult) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: ScanResult) => callback(data)
    ipcRenderer.on('scan:complete', handler)
    return () => ipcRenderer.removeListener('scan:complete', handler)
  },

  onScanError: (callback: (error: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: string) => callback(data)
    ipcRenderer.on('scan:error', handler)
    return () => ipcRenderer.removeListener('scan:error', handler)
  },
})
