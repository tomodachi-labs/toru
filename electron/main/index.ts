import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { is } from '@electron-toolkit/utils'
import { ScannerService, ScanOptions } from './scanner'
import { processCard, ProcessingOptions } from './image-processor'

let mainWindow: BrowserWindow | null = null
const scanner = new ScannerService()

// Current scan state
let currentBatchName: string | null = null
let currentOutputDir: string | null = null
let cardCount = 0
let processingQueue: Promise<void> = Promise.resolve()

// Default settings
let settings = {
  dpi: 600,
  format: 'png' as 'png' | 'jpg',
  margin: 2,
  jpgQuality: 90,
  outputDirectory: '',
  deviceId: '',
  duplex: true,
  // Scanner color adjustments (applied during scan)
  scannerBrightness: 0,   // -50 to 50 (maps to -127..127 internally)
  scannerContrast: -10,   // -50 to 50 - reduced to compensate for scanner
  scannerGamma: 1.0,      // 0.5 to 2.0
  // Post-processing color adjustments (applied after scan)
  saturation: 0.9,        // 0.5 to 1.5 - reduced to compensate for scanner
}

// Set default output directory after app is ready
app.whenReady().then(() => {
  settings.outputDirectory = app.getPath('documents')
})

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load the renderer - electron-vite handles the URL automatically
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Open DevTools in development
  if (is.dev) {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// ============================================================
// Scanner Event Handlers
// ============================================================

scanner.on('page', (page) => {
  console.log(`[Main] Received page ${page.pageNumber} -> card ${page.cardNumber}${page.side}`)

  // Capture current state for this page (before it could be reset)
  const outputDir = currentOutputDir

  // Queue this page for sequential processing
  processingQueue = processingQueue.then(async () => {
    if (!outputDir) {
      console.error('[Main] No output directory set!')
      return
    }

    try {
      const processingOptions: ProcessingOptions = {
        marginPx: Math.round((settings.margin / 25.4) * settings.dpi), // Convert mm to pixels
        format: settings.format,
        jpgQuality: settings.jpgQuality,
        dpi: settings.dpi,
        // Add color adjustments if saturation is not default
        colorAdjustments: settings.saturation !== 1.0
          ? { saturation: settings.saturation }
          : undefined,
      }

      const processed = await processCard(
        page.buffer,
        page.cardNumber,
        page.side,
        processingOptions
      )

      // Save to output directory
      const outputPath = join(outputDir, processed.filename)
      await writeFile(outputPath, processed.buffer)
      console.log(`[Main] Saved ${processed.filename} (${processed.buffer.length} bytes)`)

      // Update card count (only count when we get a front side)
      if (page.side === 'F') {
        cardCount = page.cardNumber
      }

      // Log validation warnings
      if (!processed.validation.valid) {
        console.warn(`[Card ${page.cardNumber}${page.side}] Crop warning: ${processed.validation.reason}`)
      }

      // Send progress to renderer
      console.log(`[Main] Sending preview for card ${page.cardNumber}${page.side}`)
      mainWindow?.webContents.send('scan:progress', {
        current: cardCount,
        total: 0, // Unknown total with ADF
        preview: processed.buffer.toString('base64'),
      })
    } catch (err) {
      console.error('[Main] Error processing page:', err)
      mainWindow?.webContents.send('scan:error', `Failed to process card ${page.cardNumber}${page.side}`)
    }
  })
})

scanner.on('complete', ({ pageCount }) => {
  console.log(`[Main] Batch "${currentBatchName}" scanner complete: ${pageCount} pages emitted, waiting for processing queue...`)

  // Wait for all queued processing to finish before resetting state
  processingQueue.then(() => {
    console.log(`[Main] Processing complete: ${cardCount} cards saved`)
    mainWindow?.webContents.send('scan:complete', {
      success: true,
      cardCount,
      message: `Scanned ${cardCount} cards to ${currentOutputDir}`,
    })
    currentBatchName = null
    currentOutputDir = null
    cardCount = 0
    processingQueue = Promise.resolve()
  })
})

scanner.on('error', (err) => {
  console.error('Scanner error:', err)
  mainWindow?.webContents.send('scan:error', err.message)

  // Wait for any pending processing before resetting state
  processingQueue.then(() => {
    currentBatchName = null
    currentOutputDir = null
    cardCount = 0
    processingQueue = Promise.resolve()
  })
})

// ============================================================
// IPC Handlers
// ============================================================

// Scanner operations
ipcMain.handle('scanner:start', async (_event, batchName: string) => {
  if (!batchName || typeof batchName !== 'string') {
    throw new Error('Invalid batch name')
  }

  if (scanner.isScanning()) {
    throw new Error('Scan already in progress')
  }

  if (!settings.deviceId) {
    throw new Error('No scanner selected. Please select a scanner in settings.')
  }

  // Create output directory
  currentBatchName = batchName
  currentOutputDir = join(settings.outputDirectory, batchName)
  cardCount = 0
  processingQueue = Promise.resolve()

  await mkdir(currentOutputDir, { recursive: true })

  console.log('Starting scan for batch:', batchName)
  console.log('Output directory:', currentOutputDir)

  // Build color options if any are non-default
  const hasColorOptions =
    settings.scannerBrightness !== 0 ||
    settings.scannerContrast !== 0 ||
    settings.scannerGamma !== 1.0

  const scanOptions: ScanOptions = {
    deviceId: settings.deviceId,
    dpi: settings.dpi,
    duplex: settings.duplex,
    // Map UI values (-50 to 50) to scanner range (-127 to 127) for brightness/contrast
    color: hasColorOptions
      ? {
          brightness: Math.round(settings.scannerBrightness * 2.54),
          contrast: Math.round(settings.scannerContrast * 2.54),
          gamma: settings.scannerGamma,
        }
      : undefined,
  }

  // Start scanning (async - events will handle progress)
  scanner.startBatch(scanOptions).catch((err) => {
    console.error('Failed to start scan:', err)
    mainWindow?.webContents.send('scan:error', err.message)
  })

  return { success: true, message: `Scan started for batch: ${batchName}` }
})

ipcMain.handle('scanner:stop', async () => {
  console.log('Stopping scan')
  await scanner.stop()
  return { success: true }
})

ipcMain.handle('scanner:getDevices', async () => {
  try {
    const devices = await scanner.listDevices()
    console.log('Found devices:', devices)
    return devices
  } catch (err) {
    console.error('Failed to list devices:', err)
    throw err
  }
})

ipcMain.handle('scanner:isScanning', async () => {
  return scanner.isScanning()
})

// Settings
ipcMain.handle('settings:get', async () => {
  return settings
})

ipcMain.handle('settings:set', async (_event, newSettings: Partial<typeof settings>) => {
  settings = { ...settings, ...newSettings }
  console.log('Settings updated:', settings)
  return { success: true }
})
