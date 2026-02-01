---
date: 2026-02-01T12:00:00+01:00
author: Claude
topic: "Toru - TCG Card Scanner"
tags: [spec, product, scanning, electron, cross-platform]
status: draft
---

# Spec: Toru

**Name**: Toru (撮る) — Japanese for "to capture"
**Tagline**: TCG Card Scanner
**Date**: 2026-02-01
**Status**: draft

## Problem

Tomodachi needs to scan TCG cards at the hub for deposit processing. The current solution (PaperStream Capture) is Windows-only, and the team has moved to Linux (Pop!_OS). Existing Linux alternatives (VueScan, gscan2pdf) don't provide the streamlined workflow needed for high-volume card scanning.

## Context

**Hardware:** Ricoh fi-8170 document scanner
- 100-sheet ADF (Automatic Document Feeder)
- Duplex scanning (front + back in one pass)
- 70 ppm scanning speed
- Selectable background color (white/black)
- Up to 600 DPI
- Already working on Linux via SANE (`pfufs` driver)

**Current workflow (Windows + PaperStream):**
1. Load batch of cards into ADF
2. Configure: color mode, DPI, naming pattern
3. Scan — auto-crops cards, outputs sequential files (`0001F.png`, `0001B.png`, etc.)
4. Upload folder to hub backend
5. AI processes scans (print recognition, grading) — out of scope for this tool

**Pain point:** No equivalent Linux software provides this workflow.

## Proposed Solution

Build **Toru** — a minimal desktop app for Linux that replicates and improves upon PaperStream's card scanning workflow.

### Core Features

1. **Batch ADF Scanning**
   - Scan entire stack via document feeder
   - Duplex support (front/back paired automatically)
   - Progress indicator during scan

2. **Auto-Crop**
   - Detect card edges using threshold-based detection or OpenCV
   - Use black scanner background for better edge detection
   - Crop precisely to card boundaries

3. **Black Margin**
   - Add configurable black border around cropped card
   - Default: 2-4px margin for clean presentation

4. **Sequential Naming**
   - Batch folder = user-defined name (e.g., "deposit-123", "inventory-batch-1")
   - Files: `0001F.{ext}`, `0001B.{ext}`, `0002F.{ext}`, `0002B.{ext}`, etc.
   - F = front, B = back

5. **Configurable Settings**
   - DPI: 300 / 600 / custom
   - Color mode: color / grayscale
   - Output format: PNG / JPG (selectable)
   - JPG quality: 1-100 (default 90)
   - Margin size: pixels (default 2px)
   - Output directory

6. **Minimal Desktop UI**
   - Single window app
   - Batch name input field (folder name for output)
   - Start scan button
   - Live preview of last scanned card
   - Progress bar for batch
   - Crop failure alert with rescan option
   - Settings panel (collapsible)

### "Better than PaperStream" Features

- **Live preview** of each card as it scans
- **Smart crop validation** — flag cards where crop might have failed
- **Batch summary** — show all scanned cards in grid after completion
- **One-click rescan** — rescan specific card if crop failed
- **Faster startup** — lightweight app, not bloated enterprise software
- **Auto-updates** — seamless updates via GitHub releases

## Scope

### In Scope
- ADF batch scanning with duplex
- Auto-crop with black background detection
- Black margin addition
- Sequential file naming (front/back pairs)
- Configurable DPI, color mode, format
- Electron desktop app with React UI
- Linux (Pop!_OS) support
- Ricoh fi-8170 via SANE
- Auto-update via electron-updater

### Out of Scope (v1)
- Print recognition / card identification
- AI grading
- Direct upload to Tomodachi backend
- Multi-scanner support
- Windows/macOS support (Linux only for v1, cross-platform later)
- Flatbed scanning (ADF only)
- Edge cases: multi-feed detection, damaged cards, oversized cards

### Future Potential
- Standalone product (separate from Tomodachi)
- Potential resale to other TCG businesses
- Cross-platform distribution (Windows, macOS)

## Technical Considerations

### Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | **Electron 35+** | Desktop app shell |
| Build Tool | **electron-vite** | Unified bundling for main/preload/renderer |
| Frontend | **React 19 + TypeScript** | UI components |
| Styling | **Tailwind v4 + shadcn/ui** | Design system |
| Image Processing | **Sharp** | Crop, resize, margins, format conversion |
| Edge Detection | **opencv4nodejs** (optional) | Advanced contour detection if Sharp insufficient |
| Scanner | **SANE CLI wrapper** | `scanimage` command integration |
| Packaging | **electron-builder** | Cross-platform distribution |
| Auto-Update | **electron-updater** | GitHub releases integration |

### Why Electron
- Cross-platform consistency (same Chromium everywhere)
- Mature ecosystem, well-documented issues
- Lower maintenance burden for side project
- Same JS/TS stack throughout (no Rust learning curve)
- Easier debugging, all errors in one language

**Trade-off:** Larger binary (~150MB vs ~15MB) but more reliable cross-platform.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Window                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Renderer Process (React)                 │  │
│  │   - Batch name input                                  │  │
│  │   - Scan button                                       │  │
│  │   - Preview panel                                     │  │
│  │   - Settings                                          │  │
│  │   - Uses window.electronAPI (exposed via preload)     │  │
│  └───────────────────────────────────────────────────────┘  │
│                         ↕ IPC                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Preload Script (contextBridge)           │  │
│  │   - Exposes specific IPC methods only                 │  │
│  │   - NEVER exposes full ipcRenderer                    │  │
│  └───────────────────────────────────────────────────────┘  │
│                         ↕ IPC                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Main Process (Node.js)                   │  │
│  │   - SANE scanner control (scanimage CLI)              │  │
│  │   - Image processing (Sharp)                          │  │
│  │   - File system operations                            │  │
│  │   - Auto-updater                                      │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Project Structure (electron-vite)

```
toru/
├── electron/
│   ├── main/
│   │   ├── index.ts          # Main process entry
│   │   ├── scanner.ts        # SANE integration
│   │   ├── image-processor.ts # Sharp operations
│   │   └── updater.ts        # Auto-update logic
│   └── preload/
│       └── index.ts          # contextBridge API
├── src/
│   ├── main.tsx              # React entry
│   ├── App.tsx               # Root component
│   ├── components/           # UI components
│   ├── hooks/                # Custom hooks
│   └── lib/                  # Utilities
├── electron.vite.config.ts   # electron-vite config
├── package.json
└── electron-builder.yml      # Build configuration
```

### Security Best Practices (Electron)

**Preload script pattern — NEVER expose full ipcRenderer:**

```typescript
// ❌ BAD - exposes full IPC
contextBridge.exposeInMainWorld('electron', { ipcRenderer })

// ❌ BAD - exposes event object
contextBridge.exposeInMainWorld('api', {
  onScanComplete: (callback) => ipcRenderer.on('scan-complete', callback)
})

// ✅ GOOD - specific methods, filtered callbacks
contextBridge.exposeInMainWorld('electronAPI', {
  scanner: {
    start: (batchName: string) => ipcRenderer.invoke('scanner:start', batchName),
    stop: () => ipcRenderer.invoke('scanner:stop'),
    getDevices: () => ipcRenderer.invoke('scanner:getDevices'),
  },
  onScanProgress: (callback: (progress: number) => void) => {
    ipcRenderer.on('scan:progress', (_event, value) => callback(value))
  },
  onScanComplete: (callback: (result: ScanResult) => void) => {
    ipcRenderer.on('scan:complete', (_event, value) => callback(value))
  },
})
```

**Main process security:**
- `contextIsolation: true` (default in Electron 12+)
- `nodeIntegration: false` (default)
- `sandbox: true` for renderer
- Validate all IPC inputs in main process

### Image Processing with Sharp

```typescript
import sharp from 'sharp'

// Crop to detected card region
async function cropCard(inputBuffer: Buffer, region: Region): Promise<Buffer> {
  return sharp(inputBuffer)
    .extract({
      left: region.x,
      top: region.y,
      width: region.width,
      height: region.height,
    })
    .toBuffer()
}

// Add black margin
async function addMargin(inputBuffer: Buffer, marginPx: number): Promise<Buffer> {
  return sharp(inputBuffer)
    .extend({
      top: marginPx,
      bottom: marginPx,
      left: marginPx,
      right: marginPx,
      background: { r: 0, g: 0, b: 0 },
    })
    .toBuffer()
}

// Export as JPEG with quality
async function exportJpeg(inputBuffer: Buffer, quality: number): Promise<Buffer> {
  return sharp(inputBuffer)
    .jpeg({ quality, chromaSubsampling: '4:4:4' })
    .toBuffer()
}

// Export as PNG
async function exportPng(inputBuffer: Buffer): Promise<Buffer> {
  return sharp(inputBuffer)
    .png({ compressionLevel: 9 })
    .toBuffer()
}

// Full pipeline
async function processCard(
  rawScan: Buffer,
  region: Region,
  options: { margin: number; format: 'png' | 'jpg'; jpgQuality: number }
): Promise<Buffer> {
  let buffer = await cropCard(rawScan, region)
  buffer = await addMargin(buffer, options.margin)

  if (options.format === 'jpg') {
    return exportJpeg(buffer, options.jpgQuality)
  }
  return exportPng(buffer)
}
```

### Scanner Integration (SANE CLI)

```typescript
import { spawn } from 'child_process'

interface ScanOptions {
  device: string
  dpi: number
  mode: 'Color' | 'Gray'
  format: 'png' | 'tiff'
}

async function scanPage(options: ScanOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const args = [
      '-d', options.device,
      '--resolution', String(options.dpi),
      '--mode', options.mode,
      '--format', options.format,
      '--batch-prompt',  // For ADF
    ]

    const proc = spawn('scanimage', args)
    const chunks: Buffer[] = []

    proc.stdout.on('data', (chunk) => chunks.push(chunk))
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks))
      } else {
        reject(new Error(`scanimage exited with code ${code}`))
      }
    })
  })
}

async function listDevices(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn('scanimage', ['-L'])
    let output = ''

    proc.stdout.on('data', (chunk) => { output += chunk })
    proc.on('close', () => {
      const devices = output
        .split('\n')
        .filter(line => line.includes('device'))
        .map(line => line.match(/`(.+?)'/)?.[1])
        .filter(Boolean) as string[]
      resolve(devices)
    })
  })
}
```

### electron-builder Configuration

```yaml
# electron-builder.yml
appId: com.tomodachi-labs.toru
productName: Toru
copyright: Copyright © 2026 Tomodachi Labs

directories:
  output: release
  buildResources: build

files:
  - "dist/**/*"
  - "!**/*.ts"
  - "!**/*.map"

linux:
  target:
    - AppImage
    - deb
  category: Graphics
  desktop:
    MimeType: ""

deb:
  depends:
    - libsane1
    - sane-utils
  priority: optional

win:
  target:
    - target: nsis
      arch: [x64]

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true

mac:
  target:
    - target: dmg
      arch: [universal]
  category: public.app-category.graphics-design
  hardenedRuntime: true

publish:
  provider: github
  owner: tomodachi-labs
  repo: toru
  releaseType: release
```

### Auto-Update Setup

```typescript
// electron/main/updater.ts
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'

autoUpdater.logger = log
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

export function setupAutoUpdater(mainWindow: BrowserWindow) {
  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('update:available', info.version)
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('update:progress', progress.percent)
  })

  autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update:ready')
  })

  // Check for updates after app starts
  setTimeout(() => autoUpdater.checkForUpdates(), 3000)
}

// IPC handlers
ipcMain.handle('update:download', () => autoUpdater.downloadUpdate())
ipcMain.handle('update:install', () => autoUpdater.quitAndInstall(false, true))
```

### Distribution

| Platform | Format | Dependencies |
|----------|--------|--------------|
| Linux | `.AppImage`, `.deb` | libsane1, sane-utils |
| Windows | `.exe` (NSIS) | None (bundle SANE or use WIA) |
| macOS | `.dmg` | None (use ImageCaptureCore) |

**Size:** ~150MB (Electron + Chromium)

### File Output Structure

```
output/
  DEP-ABC123/
    0001F.png
    0001B.png
    0002F.png
    0002B.png
    ...
    batch.json        # Metadata (optional)
```

**batch.json (optional):**
```json
{
  "batchName": "DEP-ABC123",
  "scannedAt": "2026-02-01T12:00:00Z",
  "cardCount": 50,
  "settings": {
    "dpi": 600,
    "format": "png",
    "margin": 2
  }
}
```

## Open Questions

~1. **Margin size** — How many pixels for the black margin? Should it be configurable?~
**Decided:** Configurable, default 2px

~2. **Crop failure handling** — What happens if edge detection fails? Skip? Use full image? Alert?~
**Decided:** Alert user, allow manual intervention

~3. **JPG quality** — What compression level for JPG output? 85? 95?~
**Decided:** Configurable quality setting

~4. **Batch naming** — Auto-increment batch number or manual entry each time?~
**Decided:** Batch = deposit ID (manual entry), files = `0001F`, `0001B`, etc.

~5. **Preview resolution** — Show full-res preview or scaled thumbnail for performance?~
**Decided:** Full-res preview

6. **Edge detection approach** — Start with Sharp threshold detection or use opencv4nodejs from the start?
   - Recommendation: Start with Sharp (simpler), add OpenCV if accuracy insufficient

7. **Windows scanner support** — Use SANE via WSL, WIA, or TWAIN?
   - Recommendation: Defer to v2, focus on Linux first

## Success Criteria

- [ ] Staff can batch scan 100 cards in under 5 minutes
- [ ] Auto-crop works correctly on 95%+ of standard TCG cards
- [ ] Output matches or exceeds PaperStream quality
- [ ] App is stable — no crashes during normal operation
- [ ] Workflow is faster than PaperStream (fewer clicks, quicker startup)
- [ ] App runs on Pop!_OS, Windows, macOS without additional configuration
- [ ] Single installer per platform (.deb, .exe, .dmg)
- [ ] Startup time < 3 seconds
- [ ] Auto-update works via GitHub releases

## References

- [Electron Security Best Practices](https://www.electronjs.org/docs/latest/tutorial/security)
- [electron-vite Documentation](https://electron-vite.org/)
- [Sharp API Reference](https://sharp.pixelplumbing.com/)
- [electron-builder Configuration](https://www.electron.build/configuration)
- [SANE scanimage Manual](http://www.sane-project.org/man/scanimage.1.html)
