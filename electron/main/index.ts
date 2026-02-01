import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

let mainWindow: BrowserWindow | null = null

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
// IPC Handlers
// ============================================================

// Scanner operations
ipcMain.handle('scanner:start', async (_event, batchName: string) => {
  console.log('Starting scan for batch:', batchName)
  // TODO: Implement SANE scanner integration
  return { success: true, message: `Scan started for batch: ${batchName}` }
})

ipcMain.handle('scanner:stop', async () => {
  console.log('Stopping scan')
  // TODO: Implement scan cancellation
  return { success: true }
})

ipcMain.handle('scanner:getDevices', async () => {
  // TODO: Implement device discovery via scanimage -L
  return []
})

// Settings
ipcMain.handle('settings:get', async () => {
  // TODO: Load from electron-store or file
  return {
    dpi: 600,
    format: 'png',
    margin: 2,
    jpgQuality: 90,
    outputDirectory: app.getPath('documents'),
  }
})

ipcMain.handle('settings:set', async (_event, settings: Record<string, unknown>) => {
  // TODO: Save to electron-store or file
  console.log('Saving settings:', settings)
  return { success: true }
})
