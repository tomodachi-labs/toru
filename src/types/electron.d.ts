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

export interface ElectronAPI {
  scanner: {
    start: (batchName: string) => Promise<ScanResult>
    stop: () => Promise<{ success: boolean }>
    getDevices: () => Promise<ScannerDevice[]>
    isScanning: () => Promise<boolean>
  }
  settings: {
    get: () => Promise<Settings>
    set: (settings: Partial<Settings>) => Promise<{ success: boolean }>
  }
  onScanProgress: (callback: (progress: ScanProgress) => void) => () => void
  onScanComplete: (callback: (result: ScanResult) => void) => () => void
  onScanError: (callback: (error: string) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
