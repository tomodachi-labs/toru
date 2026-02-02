import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Scan,
  Square,
  Settings as SettingsIcon,
  Folder,
  ChevronDown,
  RefreshCw,
  Zap,
  Layers,
  Image as ImageIcon,
  X,
} from 'lucide-react'
import type { ScanProgress, ScannerDevice, Settings } from './types/electron'

function App() {
  // Scanner state
  const [devices, setDevices] = useState<ScannerDevice[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  const [batchName, setBatchName] = useState('')
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingDevices, setLoadingDevices] = useState(true)

  // Settings state
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<Settings>({
    dpi: 600,
    format: 'png',
    margin: 0,
    jpgQuality: 90,
    outputDirectory: '',
    deviceId: '',
    duplex: true,
  })

  // Completed scans counter
  const [totalScanned, setTotalScanned] = useState(0)

  // Load devices and settings on mount
  useEffect(() => {
    loadDevices()
    loadSettings()
  }, [])

  // Set up event listeners
  useEffect(() => {
    const unsubProgress = window.electronAPI.onScanProgress((p) => {
      setProgress(p)
    })

    const unsubComplete = window.electronAPI.onScanComplete((result) => {
      setScanning(false)
      if (result.cardCount) {
        setTotalScanned((prev) => prev + result.cardCount!)
      }
      setProgress(null)
    })

    const unsubError = window.electronAPI.onScanError((err) => {
      setScanning(false)
      setProgress(null)
      setError(err)
    })

    return () => {
      unsubProgress()
      unsubComplete()
      unsubError()
    }
  }, [])

  const loadDevices = useCallback(async () => {
    setLoadingDevices(true)
    try {
      const deviceList = await window.electronAPI.scanner.getDevices()
      setDevices(deviceList)
      if (deviceList.length > 0 && !selectedDevice) {
        setSelectedDevice(deviceList[0].id)
      }
    } catch (err) {
      console.error('Failed to load devices:', err)
    } finally {
      setLoadingDevices(false)
    }
  }, [selectedDevice])

  const loadSettings = useCallback(async () => {
    try {
      const s = await window.electronAPI.settings.get()
      setSettings(s)
      if (s.deviceId) {
        setSelectedDevice(s.deviceId)
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
    }
  }, [])

  const saveSettings = useCallback(
    async (newSettings: Partial<Settings>) => {
      const updated = { ...settings, ...newSettings }
      setSettings(updated)
      try {
        await window.electronAPI.settings.set(newSettings)
      } catch (err) {
        console.error('Failed to save settings:', err)
      }
    },
    [settings]
  )

  async function startScan() {
    if (!batchName.trim()) return
    setError(null)
    setScanning(true)

    // Save device selection
    if (selectedDevice !== settings.deviceId) {
      saveSettings({ deviceId: selectedDevice })
    }

    try {
      await window.electronAPI.scanner.start(batchName)
    } catch (err) {
      console.error('Scan failed:', err)
      setScanning(false)
      setError(err instanceof Error ? err.message : 'Scan failed')
    }
  }

  async function stopScan() {
    await window.electronAPI.scanner.stop()
    setScanning(false)
    setProgress(null)
  }

  const progressPercent = progress ? (progress.current / progress.total) * 100 : 0
  const canStartScan = batchName.trim() && selectedDevice && !scanning

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      {/* Subtle grid background */}
      <div className="absolute inset-0 bg-grid-pattern opacity-50" />

      {/* Noise texture */}
      <div className="absolute inset-0 noise-overlay" />

      {/* Main content */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className="border-b border-border/50 px-6 py-4">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center gap-4">
              {/* Logo */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/20">
                  <Scan className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">Toru</h1>
                  <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest">
                    撮る · Card Scanner
                  </p>
                </div>
              </div>
            </div>

            {/* Session stats */}
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono">
                  Session
                </p>
                <p className="text-lg font-mono font-medium tabular-nums">
                  {totalScanned.toString().padStart(4, '0')}
                  <span className="text-muted-foreground text-sm ml-1">cards</span>
                </p>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSettings(!showSettings)}
                className={showSettings ? 'bg-secondary' : ''}
              >
                <SettingsIcon className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </header>

        {/* Main grid */}
        <main className="flex-1 p-6">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 stagger-children">
            {/* Preview area */}
            <div className="order-2 lg:order-1">
              <div
                className={`
                  relative rounded-xl border-2 bg-card/50 backdrop-blur-sm overflow-hidden
                  transition-all duration-500 ease-out
                  ${scanning ? 'border-accent animate-pulse-glow' : 'border-border'}
                `}
                style={{ minHeight: '500px' }}
              >
                {/* Preview header */}
                <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-background/90 to-transparent">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${scanning ? 'bg-accent animate-pulse' : 'bg-muted-foreground/50'}`}
                    />
                    <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                      {scanning ? 'Live Preview' : 'Preview'}
                    </span>
                  </div>
                  {progress && (
                    <span className="text-xs font-mono text-muted-foreground">
                      {progress.current}/{progress.total}
                    </span>
                  )}
                </div>

                {/* Scanner line animation */}
                {scanning && (
                  <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-accent to-transparent animate-scan-line" />
                  </div>
                )}

                {/* Preview content */}
                <div className="flex items-center justify-center min-h-[500px] p-8">
                  {progress?.preview ? (
                    <div className="relative animate-fade-in">
                      <img
                        src={`data:image/png;base64,${progress.preview}`}
                        alt="Last scanned card"
                        className="max-h-[450px] max-w-full object-contain rounded-lg shadow-2xl shadow-black/50"
                      />
                      {/* Card reflection effect */}
                      <div className="absolute inset-x-0 -bottom-4 h-12 bg-gradient-to-b from-black/20 to-transparent blur-sm" />
                    </div>
                  ) : (
                    <div className="text-center space-y-4">
                      <div className="w-24 h-24 mx-auto rounded-2xl border-2 border-dashed border-border flex items-center justify-center">
                        <ImageIcon className="w-10 h-10 text-muted-foreground/50" />
                      </div>
                      <div>
                        <p className="text-muted-foreground text-sm">No preview available</p>
                        <p className="text-muted-foreground/60 text-xs mt-1">
                          Start scanning to see cards here
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Progress bar at bottom */}
                {scanning && (
                  <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background/90 to-transparent">
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="text-foreground tabular-nums">
                          {Math.round(progressPercent)}%
                        </span>
                      </div>
                      <Progress value={progressPercent} className="h-1.5" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Control panel */}
            <div className="order-1 lg:order-2 space-y-4">
              {/* Scanner selection */}
              <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                    Scanner
                  </h2>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={loadDevices}
                    disabled={loadingDevices}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${loadingDevices ? 'animate-spin' : ''}`}
                    />
                    <span className="ml-1 text-xs">Refresh</span>
                  </Button>
                </div>

                <div className="relative">
                  <select
                    value={selectedDevice}
                    onChange={(e) => setSelectedDevice(e.target.value)}
                    disabled={scanning || loadingDevices}
                    className="w-full h-11 rounded-lg border border-input bg-input/50 px-4 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingDevices ? (
                      <option>Searching for scanners...</option>
                    ) : devices.length === 0 ? (
                      <option>No scanners found</option>
                    ) : (
                      devices.map((device) => (
                        <option key={device.id} value={device.id}>
                          {device.name || device.model || device.id}
                        </option>
                      ))
                    )}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              {/* Batch name input */}
              <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm p-5 space-y-4">
                <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  Batch Name
                </h2>
                <Input
                  type="text"
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  placeholder="e.g. deposit-2024-001"
                  disabled={scanning}
                  className="h-11 font-mono bg-input/50"
                />
                <p className="text-xs text-muted-foreground">
                  Files will be named: <span className="font-mono">{batchName || 'batch'}-0001F.png</span>
                </p>
              </div>

              {/* Start/Stop buttons */}
              <div className="space-y-3">
                {!scanning ? (
                  <Button
                    onClick={startScan}
                    disabled={!canStartScan}
                    className="w-full h-14 text-base font-medium gap-3 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5"
                  >
                    <Zap className="w-5 h-5" />
                    Start Scanning
                  </Button>
                ) : (
                  <Button
                    onClick={stopScan}
                    variant="destructive"
                    className="w-full h-14 text-base font-medium gap-3 shadow-lg shadow-destructive/25"
                  >
                    <Square className="w-5 h-5 fill-current" />
                    Stop Scanning
                  </Button>
                )}

                {/* Quick stats during scan */}
                {scanning && progress && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-secondary/50 p-3 text-center">
                      <p className="text-2xl font-mono font-medium tabular-nums">
                        {progress.current}
                      </p>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">
                        Scanned
                      </p>
                    </div>
                    <div className="rounded-lg bg-secondary/50 p-3 text-center">
                      <p className="text-2xl font-mono font-medium tabular-nums">
                        {progress.total - progress.current}
                      </p>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">
                        Remaining
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Error display */}
              {error && (
                <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 flex items-start gap-3 animate-fade-in">
                  <div className="w-8 h-8 rounded-lg bg-destructive/20 flex items-center justify-center flex-shrink-0">
                    <X className="w-4 h-4 text-destructive" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-destructive">Scan Error</p>
                    <p className="text-xs text-destructive/80 mt-0.5 break-words">{error}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setError(null)}
                    className="flex-shrink-0 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}

              {/* Settings panel (collapsible) */}
              {showSettings && (
                <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm p-5 space-y-5 animate-fade-in">
                  <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <SettingsIcon className="w-4 h-4" />
                    Settings
                  </h2>

                  {/* DPI */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm">Resolution (DPI)</label>
                      <span className="text-sm font-mono text-muted-foreground tabular-nums">
                        {settings.dpi}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {[300, 600, 1200].map((dpi) => (
                        <button
                          key={dpi}
                          onClick={() => saveSettings({ dpi })}
                          disabled={scanning}
                          className={`
                            flex-1 h-9 rounded-lg text-sm font-mono transition-all
                            ${settings.dpi === dpi
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'}
                            disabled:opacity-50 disabled:cursor-not-allowed
                          `}
                        >
                          {dpi}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Format */}
                  <div className="space-y-2">
                    <label className="text-sm flex items-center gap-2">
                      <Layers className="w-4 h-4 text-muted-foreground" />
                      Output Format
                    </label>
                    <div className="flex gap-2">
                      {(['png', 'jpg'] as const).map((fmt) => (
                        <button
                          key={fmt}
                          onClick={() => saveSettings({ format: fmt })}
                          disabled={scanning}
                          className={`
                            flex-1 h-9 rounded-lg text-sm font-mono uppercase transition-all
                            ${settings.format === fmt
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'}
                            disabled:opacity-50 disabled:cursor-not-allowed
                          `}
                        >
                          {fmt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* JPG Quality (only show if JPG selected) */}
                  {settings.format === 'jpg' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm">JPEG Quality</label>
                        <span className="text-sm font-mono text-muted-foreground tabular-nums">
                          {settings.jpgQuality}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="50"
                        max="100"
                        value={settings.jpgQuality}
                        onChange={(e) =>
                          saveSettings({ jpgQuality: parseInt(e.target.value) })
                        }
                        disabled={scanning}
                        className="w-full"
                      />
                    </div>
                  )}

                  {/* Margin */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm">Edge Margin (px)</label>
                      <span className="text-sm font-mono text-muted-foreground tabular-nums">
                        {settings.margin}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      value={settings.margin}
                      onChange={(e) =>
                        saveSettings({ margin: parseInt(e.target.value) })
                      }
                      disabled={scanning}
                      className="w-full"
                    />
                  </div>

                  {/* Duplex toggle */}
                  <div className="flex items-center justify-between">
                    <label className="text-sm">Duplex (Front + Back)</label>
                    <button
                      onClick={() => saveSettings({ duplex: !settings.duplex })}
                      disabled={scanning}
                      className={`
                        w-12 h-7 rounded-full transition-all relative
                        ${settings.duplex ? 'bg-primary' : 'bg-secondary'}
                        disabled:opacity-50 disabled:cursor-not-allowed
                      `}
                    >
                      <div
                        className={`
                          absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-all
                          ${settings.duplex ? 'left-6' : 'left-1'}
                        `}
                      />
                    </button>
                  </div>

                  {/* Output directory */}
                  <div className="space-y-2">
                    <label className="text-sm flex items-center gap-2">
                      <Folder className="w-4 h-4 text-muted-foreground" />
                      Output Directory
                    </label>
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        value={settings.outputDirectory}
                        onChange={(e) =>
                          saveSettings({ outputDirectory: e.target.value })
                        }
                        placeholder="/home/user/scans"
                        disabled={scanning}
                        className="flex-1 font-mono text-xs bg-input/50"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-border/50 px-6 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <span className="font-mono">v0.1.0</span>
              <span className="text-border">|</span>
              <span>
                {selectedDevice ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Connected
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                    No scanner
                  </span>
                )}
              </span>
            </div>
            <div className="font-mono">
              {settings.dpi} DPI · {settings.format.toUpperCase()}
              {settings.duplex ? ' · Duplex' : ''}
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default App
