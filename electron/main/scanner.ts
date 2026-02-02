import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { mkdtemp, readFile, rm, readdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

export interface ScannerDevice {
  id: string
  name: string
  model: string
}

export interface ScanOptions {
  deviceId: string
  dpi: number
  duplex: boolean
}

export interface PageEvent {
  pageNumber: number
  cardNumber: number
  side: 'F' | 'B'
  buffer: Buffer
}

export interface CompleteEvent {
  pageCount: number
}

interface ScannerEvents {
  page: (event: PageEvent) => void
  complete: (event: CompleteEvent) => void
  error: (error: Error) => void
}

export class ScannerService extends EventEmitter {
  private process: ChildProcess | null = null
  private tempDir: string | null = null
  private scanning = false
  private pollInterval: ReturnType<typeof setInterval> | null = null
  private processedPages = new Set<number>()

  constructor() {
    super()
  }

  // Override EventEmitter methods for type safety
  override on<K extends keyof ScannerEvents>(event: K, listener: ScannerEvents[K]): this {
    return super.on(event, listener)
  }

  override emit<K extends keyof ScannerEvents>(
    event: K,
    ...args: Parameters<ScannerEvents[K]>
  ): boolean {
    return super.emit(event, ...args)
  }

  async listDevices(): Promise<ScannerDevice[]> {
    return new Promise((resolve, reject) => {
      const proc = spawn('scanimage', ['-L'])
      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString()
      })

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      proc.on('error', (err) => {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(new Error('scanimage not found. Install sane-utils package.'))
        } else {
          reject(err)
        }
      })

      proc.on('close', (code) => {
        if (code !== 0 && stderr.includes('permission denied')) {
          reject(
            new Error(
              'Permission denied. Add your user to the "scanner" group: sudo usermod -aG scanner $USER'
            )
          )
          return
        }

        // Parse device list
        // Format: device `pfufs:fi-8170:012345' is a FUJITSU fi-8170 scanner
        const devices: ScannerDevice[] = []
        const regex = /device `([^']+)' is a (.+)/g
        let match

        while ((match = regex.exec(stdout)) !== null) {
          const id = match[1]
          const fullName = match[2]
          // Extract model from full name (e.g., "FUJITSU fi-8170 scanner" -> "fi-8170")
          const modelMatch = fullName.match(/(\S+-\S+)/)
          devices.push({
            id,
            name: fullName,
            model: modelMatch ? modelMatch[1] : fullName,
          })
        }

        resolve(devices)
      })
    })
  }

  async startBatch(options: ScanOptions): Promise<void> {
    if (this.scanning) {
      throw new Error('Scan already in progress')
    }

    this.scanning = true
    this.processedPages.clear()

    // Create temp directory for batch output
    this.tempDir = await mkdtemp(join(tmpdir(), 'toru-'))
    const batchPattern = join(this.tempDir, 'page%04d.png')

    const args = [
      '-d',
      options.deviceId,
      '--resolution',
      options.dpi.toString(),
      '--mode',
      'Color',
      '--format',
      'png',
      `--batch=${batchPattern}`,
      '--batch-start=1',
    ]

    // Add duplex source if requested
    // Note: pfufs driver uses Adf-front/Adf-duplex (lowercase, hyphenated)
    if (options.duplex) {
      args.push('--source', 'Adf-duplex')
    } else {
      args.push('--source', 'Adf-front')
    }

    this.process = spawn('scanimage', args)

    // Poll temp directory for new pages
    this.pollInterval = setInterval(() => {
      this.checkForNewPages(options.duplex)
    }, 200)

    this.process.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString()
      console.log('[scanimage]', msg)
    })

    this.process.on('error', (err) => {
      this.cleanup()
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.emit('error', new Error('scanimage not found. Install sane-utils package.'))
      } else {
        this.emit('error', err)
      }
    })

    this.process.on('close', async (code) => {
      // Process any remaining pages before cleanup
      await this.checkForNewPages(options.duplex)

      const pageCount = this.processedPages.size

      // Exit code 7 = SANE_STATUS_NO_DOCS (ADF empty - normal completion)
      if (code === 0 || code === 7) {
        this.emit('complete', { pageCount })
      } else {
        this.emit('error', new Error(`Scanner exited with code ${code}`))
      }

      this.cleanup()
    })
  }

  private async checkForNewPages(duplex: boolean): Promise<void> {
    if (!this.tempDir) return

    try {
      const files = await readdir(this.tempDir)
      const pageFiles = files
        .filter((f) => f.startsWith('page') && f.endsWith('.png'))
        .sort()

      for (const file of pageFiles) {
        // Extract page number from filename (e.g., "page0001.png" -> 1)
        const match = file.match(/page(\d+)\.png/)
        if (!match) continue

        const pageNumber = parseInt(match[1], 10)
        if (this.processedPages.has(pageNumber)) continue

        try {
          const buffer = await readFile(join(this.tempDir, file))

          // Calculate card number and side from page number
          const { cardNumber, side } = this.getCardInfo(pageNumber, duplex)

          this.processedPages.add(pageNumber)
          this.emit('page', { pageNumber, cardNumber, side, buffer })
        } catch {
          // File might still be writing, skip for now
        }
      }
    } catch {
      // Directory might not exist yet
    }
  }

  private getCardInfo(
    pageNumber: number,
    duplex: boolean
  ): { cardNumber: number; side: 'F' | 'B' } {
    if (!duplex) {
      return { cardNumber: pageNumber, side: 'F' }
    }

    // Duplex: pages arrive interleaved - front1, back1, front2, back2...
    const cardNumber = Math.ceil(pageNumber / 2)
    const side = pageNumber % 2 === 1 ? 'F' : 'B'
    return { cardNumber, side }
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM')
    }
    this.cleanup()
  }

  private cleanup(): void {
    this.scanning = false

    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }

    // Clean up temp directory
    if (this.tempDir) {
      rm(this.tempDir, { recursive: true, force: true }).catch(() => {
        // Ignore cleanup errors
      })
      this.tempDir = null
    }

    this.process = null
  }

  isScanning(): boolean {
    return this.scanning
  }
}
