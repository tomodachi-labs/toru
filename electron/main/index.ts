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

// Default settings
let settings = {
  dpi: 600,
  format: 'png' as 'png' | 'jpg',
  margin: 2,
  jpgQuality: 90,
  outputDirectory: '',
  deviceId: '',
  duplex: true,
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

scanner.on('page', async (page) => {
  if (!currentOutputDir) return

  try {
    const processingOptions: ProcessingOptions = {
      marginPx: Math.round((settings.margin / 25.4) * settings.dpi), // Convert mm to pixels
      format: settings.format,
      jpgQuality: settings.jpgQuality,
      dpi: settings.dpi,
    }

    const processed = await processCard(
      page.buffer,
      page.cardNumber,
      page.side,
      processingOptions
    )

    // Save to output directory
    await writeFile(join(currentOutputDir, processed.filename), processed.buffer)

    // Update card count (only count when we get a front side)
    if (page.side === 'F') {
      cardCount = page.cardNumber
    }

    // Log validation warnings
    if (!processed.validation.valid) {
      console.warn(`[Card ${page.cardNumber}${page.side}] Crop warning: ${processed.validation.reason}`)
    }

    // Send progress to renderer
    mainWindow?.webContents.send('scan:progress', {
      current: cardCount,
      total: 0, // Unknown total with ADF
      preview: processed.buffer.toString('base64'),
    })
  } catch (err) {
    console.error('Error processing page:', err)
    mainWindow?.webContents.send('scan:error', `Failed to process card ${page.cardNumber}${page.side}`)
  }
})

scanner.on('complete', ({ pageCount }) => {
  console.log(`Batch "${currentBatchName}" complete: ${pageCount} pages, ${cardCount} cards`)
  mainWindow?.webContents.send('scan:complete', {
    success: true,
    cardCount,
    message: `Scanned ${cardCount} cards to ${currentOutputDir}`,
  })
  currentBatchName = null
  currentOutputDir = null
  cardCount = 0
})

scanner.on('error', (err) => {
  console.error('Scanner error:', err)
  mainWindow?.webContents.send('scan:error', err.message)
  currentBatchName = null
  currentOutputDir = null
  cardCount = 0
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

  await mkdir(currentOutputDir, { recursive: true })

  console.log('Starting scan for batch:', batchName)
  console.log('Output directory:', currentOutputDir)

  const scanOptions: ScanOptions = {
    deviceId: settings.deviceId,
    dpi: settings.dpi,
    duplex: settings.duplex,
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
