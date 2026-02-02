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
