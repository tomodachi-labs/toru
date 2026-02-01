import { useState, useEffect } from 'react'
import type { ScanProgress } from './types/electron'

function App() {
  const [batchName, setBatchName] = useState('')
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<ScanProgress | null>(null)

  useEffect(() => {
    // Subscribe to scan events
    const unsubProgress = window.electronAPI.onScanProgress((p) => {
      setProgress(p)
    })

    const unsubComplete = window.electronAPI.onScanComplete((result) => {
      setScanning(false)
      setProgress(null)
      console.log('Scan complete:', result)
    })

    const unsubError = window.electronAPI.onScanError((error) => {
      setScanning(false)
      setProgress(null)
      console.error('Scan error:', error)
    })

    return () => {
      unsubProgress()
      unsubComplete()
      unsubError()
    }
  }, [])

  async function startScan() {
    if (!batchName.trim()) return
    setScanning(true)
    try {
      const result = await window.electronAPI.scanner.start(batchName)
      console.log(result)
    } catch (error) {
      console.error('Scan failed:', error)
      setScanning(false)
    }
  }

  async function stopScan() {
    await window.electronAPI.scanner.stop()
    setScanning(false)
    setProgress(null)
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Toru</h1>
        <p className="text-neutral-400 mb-8">TCG Card Scanner</p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-neutral-400 mb-2">
              Batch Name
            </label>
            <input
              type="text"
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              placeholder="e.g. deposit-001"
              disabled={scanning}
              className="w-full px-4 py-2 bg-neutral-900 border border-neutral-800 rounded-lg focus:outline-none focus:border-neutral-600 disabled:opacity-50"
            />
          </div>

          {!scanning ? (
            <button
              onClick={startScan}
              disabled={!batchName.trim()}
              className="w-full px-4 py-3 bg-white text-black font-medium rounded-lg hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Start Scan
            </button>
          ) : (
            <button
              onClick={stopScan}
              className="w-full px-4 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors"
            >
              Stop Scan
            </button>
          )}

          {progress && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-neutral-400">
                <span>Scanning...</span>
                <span>{progress.current} / {progress.total}</span>
              </div>
              <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 p-4 border border-neutral-800 rounded-lg min-h-[300px] flex items-center justify-center">
          {progress?.preview ? (
            <img
              src={`data:image/png;base64,${progress.preview}`}
              alt="Last scanned card"
              className="max-h-[280px] object-contain"
            />
          ) : (
            <p className="text-neutral-600">Preview will appear here</p>
          )}
        </div>
      </div>
    </main>
  )
}

export default App
