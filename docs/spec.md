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
   - Detect card edges using OpenCV
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

## Scope

### In Scope
- ADF batch scanning with duplex
- Auto-crop with black background detection
- Black margin addition
- Sequential file naming (front/back pairs)
- Configurable DPI, color mode, format
- Minimal PyQt desktop UI
- Linux (Pop!_OS) support
- Ricoh fi-8170 via SANE

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

**Stack:**
- **Electron** — desktop app framework (Node.js backend + Chromium frontend)
- **React + TypeScript + Tailwind + shadcn/ui** — frontend UI (same stack as Tomodachi)
- **Node.js** — backend (scanner control, image processing)
- **sharp** or **jimp** — image processing, crop, margins
- **node-sane** or native bindings — scanner control via SANE API (Linux)

**Why Electron:**
- Cross-platform consistency (same Chromium everywhere)
- Mature ecosystem, well-documented issues
- Lower maintenance burden for side project
- Same JS/TS stack throughout (no Rust learning curve)
- Easier debugging, all errors in one language

**Trade-off:** Larger binary (~150MB vs ~15MB) but more reliable cross-platform.

**Architecture:**
```
┌─────────────────────────────────────┐
│         Electron Window             │
│  ┌───────────────────────────────┐  │
│  │   React + Tailwind + shadcn   │  │
│  │   - Batch name input          │  │
│  │   - Scan button               │  │
│  │   - Preview panel             │  │
│  │   - Settings                  │  │
│  └───────────────────────────────┘  │
│                 ↕ IPC (invoke)      │
│  ┌───────────────────────────────┐  │
│  │   Node.js Main Process        │  │
│  │   - SANE scanner control      │  │
│  │   - Auto-crop (sharp/jimp)    │  │
│  │   - Margin addition           │  │
│  │   - File export (PNG/JPG)     │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

**Repository:** `toru` (separate GitHub repo, not in Tomodachi monorepo)

**Distribution:**
- Linux: `.deb`, `.AppImage`
- Windows: `.exe` (NSIS installer)
- macOS: `.dmg`
- ~150MB download size

**Scanner integration:**
- Device ID: `pfufs:fi-8170:XXX:XXX`
- SANE already working on the system
- Use black background mode for better crop detection
- Node.js talks to SANE via native bindings or CLI wrapper

**Image processing pipeline (Node.js):**
1. Receive raw scan from SANE
2. Detect card edges (contour detection on black background)
3. Crop to bounding box
4. Add black margin (configurable pixels)
5. Encode as PNG or JPG (configurable quality)
6. Save with sequential naming (`0001F.png`, `0001B.png`)
7. Send preview to renderer via Electron IPC

**File structure:**
```
output/
  DEP-ABC123/
    0001F.png
    0001B.png
    0002F.png
    0002B.png
    ...
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

## Success Criteria

- [ ] Staff can batch scan 100 cards in under 5 minutes
- [ ] Auto-crop works correctly on 95%+ of standard TCG cards
- [ ] Output matches or exceeds PaperStream quality
- [ ] App is stable — no crashes during normal operation
- [ ] Workflow is faster than PaperStream (fewer clicks, quicker startup)
- [ ] App runs on Pop!_OS, Windows, macOS without additional configuration
- [ ] Single installer per platform (.deb, .exe, .dmg)
- [ ] Startup time < 3 seconds
