# Toru (撮る)

TCG Card Scanner — Batch scanning with auto-crop for trading card businesses.

## Project Overview

Toru is a desktop app for high-volume TCG card scanning. It replaces Windows-only PaperStream Capture with a cross-platform Electron solution.

**Key features:**
- Batch ADF scanning with duplex (front/back)
- Auto-crop card edges from black background
- Configurable margins, DPI, format (PNG/JPG)
- Sequential naming (`0001F.png`, `0001B.png`)
- Live preview during scanning

**Target hardware:** Ricoh fi-8170 via SANE

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Electron 35 |
| Build | electron-vite |
| Frontend | React 19 + TypeScript |
| Styling | Tailwind v4 |
| Image Processing | Sharp |
| Scanner | SANE CLI (`scanimage`) |
| Packaging | electron-builder |

## Commands

```bash
bun run dev          # Start dev mode
bun run build        # Build for production
bun run package      # Build + package for current OS
bun run package:linux  # Package for Linux (.deb, .AppImage)
bun run typecheck    # Type check without emitting
```

## Project Structure

```
toru/
├── electron/
│   ├── main/           # Main process (Node.js)
│   │   └── index.ts    # Entry point, IPC handlers
│   └── preload/        # Preload scripts
│       └── index.ts    # contextBridge API
├── src/                # Renderer (React)
│   ├── App.tsx
│   ├── main.tsx
│   └── types/
│       └── electron.d.ts
├── electron.vite.config.ts
└── package.json
```

## Best Practices

### Electron Security

**NEVER expose full `ipcRenderer` in preload scripts:**

```typescript
// ❌ BAD
contextBridge.exposeInMainWorld('electron', { ipcRenderer })

// ✅ GOOD - specific methods only
contextBridge.exposeInMainWorld('electronAPI', {
  scanner: {
    start: (name: string) => ipcRenderer.invoke('scanner:start', name),
  },
})
```

**Event listeners — filter the event object:**

```typescript
// ❌ BAD - exposes Electron event object
onProgress: (cb) => ipcRenderer.on('progress', cb)

// ✅ GOOD - only pass data to callback
onProgress: (cb) => ipcRenderer.on('progress', (_event, data) => cb(data))
```

**Main process settings:**
- `contextIsolation: true` (default)
- `nodeIntegration: false` (default)
- `sandbox: true` for renderer

### Image Processing (Sharp)

```typescript
import sharp from 'sharp'

// Crop to region
await sharp(buffer)
  .extract({ left, top, width, height })
  .toBuffer()

// Add margin
await sharp(buffer)
  .extend({
    top: margin, bottom: margin, left: margin, right: margin,
    background: { r: 0, g: 0, b: 0 },
  })
  .toBuffer()

// Export JPEG with quality
await sharp(buffer)
  .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
  .toBuffer()
```

### IPC Patterns

**Main process handlers:**
```typescript
ipcMain.handle('scanner:start', async (_event, batchName: string) => {
  // Validate inputs
  if (!batchName || typeof batchName !== 'string') {
    throw new Error('Invalid batch name')
  }
  // Process...
  return { success: true }
})
```

**Renderer usage:**
```typescript
const result = await window.electronAPI.scanner.start(batchName)
```

### Scanner Integration (SANE)

Use `scanimage` CLI wrapper, not native bindings (simpler, more reliable):

```typescript
import { spawn } from 'child_process'

const proc = spawn('scanimage', [
  '-d', deviceId,
  '--resolution', '600',
  '--mode', 'Color',
  '--format', 'png',
])
```

List devices: `scanimage -L`

## Distribution

| Platform | Format | Notes |
|----------|--------|-------|
| Linux | `.AppImage`, `.deb` | Requires libsane1 |
| Windows | `.exe` (NSIS) | WIA/TWAIN for v2 |
| macOS | `.dmg` | ImageCaptureCore for v2 |

## Docs

- Full spec: `docs/spec.md`
- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
- [electron-vite](https://electron-vite.org/)
- [Sharp API](https://sharp.pixelplumbing.com/)
- [electron-builder](https://www.electron.build/)
