import sharp from 'sharp'

export interface CropRegion {
  left: number
  top: number
  width: number
  height: number
}

export interface ProcessingOptions {
  marginPx: number
  format: 'png' | 'jpg'
  jpgQuality: number
  dpi: number
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

  // Step 3: Add margin if configured
  const withMargin = await addMargin(cropped, options.marginPx)

  // Step 4: Export to final format
  const final = await exportImage(withMargin, {
    format: options.format,
    jpgQuality: options.jpgQuality,
  })

  // Step 5: Generate filename
  const filename = generateFilename(cardNumber, side, options.format)

  return {
    filename,
    buffer: final,
    region,
    validation,
  }
}
