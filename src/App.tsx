import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type { ScanProgress } from './types/electron'

function App() {
  const [batchName, setBatchName] = useState('')
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<ScanProgress | null>(null)

  useEffect(() => {
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

  const progressPercent = progress ? (progress.current / progress.total) * 100 : 0

  return (
    <main className="min-h-screen bg-background text-foreground p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Toru</h1>
          <p className="text-muted-foreground">TCG Card Scanner</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>New Scan</CardTitle>
            <CardDescription>
              Enter a batch name and start scanning cards
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Batch Name</label>
              <Input
                type="text"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                placeholder="e.g. deposit-001"
                disabled={scanning}
              />
            </div>

            {!scanning ? (
              <Button
                onClick={startScan}
                disabled={!batchName.trim()}
                className="w-full"
              >
                Start Scan
              </Button>
            ) : (
              <Button
                onClick={stopScan}
                variant="destructive"
                className="w-full"
              >
                Stop Scan
              </Button>
            )}

            {progress && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Scanning...</span>
                  <span>{progress.current} / {progress.total}</span>
                </div>
                <Progress value={progressPercent} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>Last scanned card</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="min-h-[300px] flex items-center justify-center border border-dashed border-border rounded-lg">
              {progress?.preview ? (
                <img
                  src={`data:image/png;base64,${progress.preview}`}
                  alt="Last scanned card"
                  className="max-h-[280px] object-contain"
                />
              ) : (
                <p className="text-muted-foreground">No preview available</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

export default App
