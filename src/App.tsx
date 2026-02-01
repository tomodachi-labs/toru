import { useState } from 'react'

declare global {
  interface Window {
    electronAPI: {
      scanner: {
        start: (batchName: string) => Promise<{ success: boolean; message: string }>
        getDevices: () => Promise<string[]>
      }
    }
  }
}

function App() {
  const [batchName, setBatchName] = useState('')
  const [scanning, setScanning] = useState(false)

  async function startScan() {
    if (!batchName.trim()) return
    setScanning(true)
    try {
      const result = await window.electronAPI.scanner.start(batchName)
      console.log(result)
    } catch (error) {
      console.error('Scan failed:', error)
    } finally {
      setScanning(false)
    }
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
              className="w-full px-4 py-2 bg-neutral-900 border border-neutral-800 rounded-lg focus:outline-none focus:border-neutral-600"
            />
          </div>

          <button
            onClick={startScan}
            disabled={scanning || !batchName.trim()}
            className="w-full px-4 py-3 bg-white text-black font-medium rounded-lg hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {scanning ? 'Scanning...' : 'Start Scan'}
          </button>
        </div>

        <div className="mt-8 p-4 border border-neutral-800 rounded-lg min-h-[300px] flex items-center justify-center">
          <p className="text-neutral-600">Preview will appear here</p>
        </div>
      </div>
    </main>
  )
}

export default App
