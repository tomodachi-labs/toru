import sharp from 'sharp'

export interface CropRegion {
  left: number
  top: number
  width: number
  height: number
}

export interface ColorAdjustments {
  saturation: number  // 0.5 to 2.0, default 1.0 (1 = no change)
}

export interface AutoBrightnessOptions {
  enabled: boolean
  targetBrightness: number  // Target mean brightness 0-255, default ~128
  minBrightness: number     // Only correct if below this threshold, default ~100
}

export interface ProcessingOptions {
  marginPx: number
  format: 'png' | 'jpg'
  jpgQuality: number
  dpi: number
  colorAdjustments?: ColorAdjustments  // Optional post-processing color adjustments
  autoBrightness?: AutoBrightnessOptions  // Automatic brightness normalization
}

export interface ProcessedCard {
  filename: string
  buffer: Buffer
  region: CropRegion
  validation: CropValidation
}

export interface CropValidation {
  valid: boolean
  reason?: string
}

// Standard card dimensions for validation
const CARD_DIMENSIONS = {
  // Standard TCG card: 63mm x 88mm
  standardMm: { width: 63, height: 88 },
  // Tolerance percentage for validation
  tolerancePercent: 15,
}

/**
 * Auto-crop card from black background using Sharp's trim()
 */
export async function autoCrop(
  buffer: Buffer,
  threshold = 30
): Promise<{ buffer: Buffer; region: CropRegion }> {
  const result = await sharp(buffer)
    .trim({ background: '#000000', threshold })
    .toBuffer({ resolveWithObject: true })

  // Get the trim info
  const { info } = result
  const region: CropRegion = {
    left: info.trimOffsetLeft ?? 0,
    top: info.trimOffsetTop ?? 0,
    width: info.width,
    height: info.height,
  }

  return { buffer: result.data, region }
}

/**
 * Apply color adjustments using Sharp's modulate
 */
export async function adjustColors(
  buffer: Buffer,
  adjustments: ColorAdjustments
): Promise<Buffer> {
  // Skip if no adjustments needed
  if (adjustments.saturation === 1.0) {
    return buffer
  }

  return sharp(buffer)
    .modulate({ saturation: adjustments.saturation })
    .toBuffer()
}

/**
 * Analyze image brightness by calculating mean luminance
 * Returns value 0-255
 */
export async function analyzeBrightness(buffer: Buffer): Promise<number> {
  const stats = await sharp(buffer).stats()

  // Calculate perceived luminance using standard coefficients
  // Y = 0.299*R + 0.587*G + 0.114*B
  const r = stats.channels[0].mean
  const g = stats.channels[1].mean
  const b = stats.channels[2].mean

  return 0.299 * r + 0.587 * g + 0.114 * b
}

/**
 * Normalize brightness if image is too dark
 * Uses gamma correction for natural-looking results
 */
export async function normalizeBrightness(
  buffer: Buffer,
  options: AutoBrightnessOptions
): Promise<{ buffer: Buffer; corrected: boolean; originalBrightness: number }> {
  if (!options.enabled) {
    return { buffer, corrected: false, originalBrightness: 0 }
  }

  const brightness = await analyzeBrightness(buffer)

  // Only correct if below the minimum threshold
  if (brightness >= options.minBrightness) {
    return { buffer, corrected: false, originalBrightness: brightness }
  }

  // Calculate gamma correction factor
  // We want to lift brightness from current to target
  // Using gamma: output = input^(1/gamma)
  // To lift darks: gamma > 1 means 1/gamma < 1, which lightens
  const ratio = options.targetBrightness / brightness
  // Clamp the correction to avoid extreme adjustments
  const clampedRatio = Math.min(Math.max(ratio, 1.0), 2.5)

  // Convert ratio to gamma: we use the formula gamma = 1 / log_base_ratio
  // Simpler approach: use linear multiplier combined with gamma
  // For better results, use gamma correction (lifts midtones without clipping highlights)
  const gamma = 1 / Math.pow(clampedRatio, 0.5)  // Softer correction curve

  const corrected = await sharp(buffer)
    .gamma(gamma)
    .toBuffer()

  return { buffer: corrected, corrected: true, originalBrightness: brightness }
}

/**
 * Add margin around the image
 */
export async function addMargin(buffer: Buffer, marginPx: number): Promise<Buffer> {
  if (marginPx <= 0) {
    return buffer
  }

  return sharp(buffer)
    .extend({
      top: marginPx,
      bottom: marginPx,
      left: marginPx,
      right: marginPx,
      background: { r: 0, g: 0, b: 0 },
    })
    .toBuffer()
}

/**
 * Export image to final format
 */
export async function exportImage(
  buffer: Buffer,
  options: { format: 'png' | 'jpg'; jpgQuality?: number }
): Promise<Buffer> {
  const image = sharp(buffer)

  if (options.format === 'jpg') {
    return image
      .jpeg({
        quality: options.jpgQuality ?? 90,
        chromaSubsampling: '4:4:4',
      })
      .toBuffer()
  }

  return image.png().toBuffer()
}

/**
 * Validate crop region against expected card dimensions
 */
export function validateCrop(region: CropRegion, dpi: number): CropValidation {
  // Convert expected dimensions from mm to pixels
  const mmToPixels = (mm: number) => Math.round((mm / 25.4) * dpi)

  const expectedWidth = mmToPixels(CARD_DIMENSIONS.standardMm.width)
  const expectedHeight = mmToPixels(CARD_DIMENSIONS.standardMm.height)

  const tolerance = CARD_DIMENSIONS.tolerancePercent / 100

  const minWidth = expectedWidth * (1 - tolerance)
  const maxWidth = expectedWidth * (1 + tolerance)
  const minHeight = expectedHeight * (1 - tolerance)
  const maxHeight = expectedHeight * (1 + tolerance)

  // Check dimensions
  if (region.width < minWidth || region.width > maxWidth) {
    return {
      valid: false,
      reason: `Width ${region.width}px outside expected range ${Math.round(minWidth)}-${Math.round(maxWidth)}px`,
    }
  }

  if (region.height < minHeight || region.height > maxHeight) {
    return {
      valid: false,
      reason: `Height ${region.height}px outside expected range ${Math.round(minHeight)}-${Math.round(maxHeight)}px`,
    }
  }

  // Check aspect ratio (width/height should be ~0.716 for standard TCG)
  const expectedRatio = CARD_DIMENSIONS.standardMm.width / CARD_DIMENSIONS.standardMm.height
  const actualRatio = region.width / region.height
  const ratioDiff = Math.abs(actualRatio - expectedRatio) / expectedRatio

  if (ratioDiff > tolerance) {
    return {
      valid: false,
      reason: `Aspect ratio ${actualRatio.toFixed(3)} differs from expected ${expectedRatio.toFixed(3)}`,
    }
  }

  return { valid: true }
}

/**
 * Generate output filename
 * Format: 0001F.png, 0001B.png, 0002F.jpg, etc.
 */
export function generateFilename(
  cardNumber: number,
  side: 'F' | 'B',
  format: 'png' | 'jpg'
): string {
  const paddedNumber = cardNumber.toString().padStart(4, '0')
  return `${paddedNumber}${side}.${format}`
}

/**
 * Process a single card through the full pipeline
 */
export async function processCard(
  rawBuffer: Buffer,
  cardNumber: number,
  side: 'F' | 'B',
  options: ProcessingOptions
): Promise<ProcessedCard> {
  // Step 1: Auto-crop from black background
  const { buffer: cropped, region } = await autoCrop(rawBuffer)

  // Step 2: Validate crop
  const validation = validateCrop(region, options.dpi)

  // Step 3: Auto-brightness normalization (before color adjustments)
  let brightnessCorrected = cropped
  if (options.autoBrightness?.enabled) {
    const result = await normalizeBrightness(cropped, options.autoBrightness)
    brightnessCorrected = result.buffer
    if (result.corrected) {
      console.log(`[ImageProcessor] Card ${cardNumber}${side}: brightness ${result.originalBrightness.toFixed(1)} -> corrected`)
    }
  }

  // Step 4: Apply color adjustments if configured
  let colorAdjusted = brightnessCorrected
  if (options.colorAdjustments) {
    colorAdjusted = await adjustColors(brightnessCorrected, options.colorAdjustments)
  }

  // Step 5: Add margin if configured
  const withMargin = await addMargin(colorAdjusted, options.marginPx)

  // Step 6: Export to final format
  const final = await exportImage(withMargin, {
    format: options.format,
    jpgQuality: options.jpgQuality,
  })

  // Step 7: Generate filename
  const filename = generateFilename(cardNumber, side, options.format)

  return {
    filename,
    buffer: final,
    region,
    validation,
  }
}
