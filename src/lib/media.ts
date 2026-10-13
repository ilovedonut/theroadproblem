import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

export interface ProcessMediaResult {
  sha256: string;
  mime_type: string;
  original_bytes: number;
  derivative_bytes: number;
  width: number;
  height: number;
  quarantine_key: string;
  derivative_key: string;
}

const MAX_INPUT_BYTES = 8 * 1024 * 1024; // 8 MiB
const MAX_DECODED_PIXELS = 20_000_000; // 20 Megapixels
const MAX_DERIVATIVE_DIMENSION = 1600; // 1600px on longest edge

export async function processAndQuarantinePhoto(
  inputBuffer: Buffer,
  reportId: string,
  storageBaseDir: string = './storage_data'
): Promise<ProcessMediaResult> {
  // 1. Enforce size limits
  if (inputBuffer.length > MAX_INPUT_BYTES) {
    throw new Error(`File too large: ${inputBuffer.length} bytes exceeds 8 MiB limit.`);
  }

  // 2. Compute SHA-256
  const sha256 = crypto.createHash('sha256').update(inputBuffer).digest('hex');

  // 3. Inspect image metadata via Sharp (rejects invalid/malformed images)
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(inputBuffer).metadata();
  } catch (err: any) {
    throw new Error(`Invalid or malformed image data: ${err.message}`);
  }

  const format = metadata.format;
  if (!format || !['jpeg', 'png', 'webp'].includes(format)) {
    throw new Error(`Unsupported image format: ${format}. Only JPEG, PNG, and WebP are accepted.`);
  }

  const width = metadata.width || 0;
  const height = metadata.height || 0;
  if (width * height > MAX_DECODED_PIXELS) {
    throw new Error(`Image resolution too large: ${width}x${height} exceeds 20 megapixel limit.`);
  }

  // Ensure directories exist
  const quarantineDir = path.join(storageBaseDir, 'quarantine');
  const derivativesDir = path.join(storageBaseDir, 'derivatives');
  fs.mkdirSync(quarantineDir, { recursive: true });
  fs.mkdirSync(derivativesDir, { recursive: true });

  const fileId = `${reportId}_${sha256.slice(0, 12)}`;
  const quarantineKey = `quarantine/${fileId}_raw.${format}`;
  const derivativeKey = `derivatives/${fileId}_norm.webp`;

  // 4. Save quarantined original (private)
  const quarantinePath = path.join(storageBaseDir, quarantineKey);
  fs.writeFileSync(quarantinePath, inputBuffer);

  // 5. Generate normalized derivative:
  // - Resize longest edge to at most 1600px
  // - Strip all EXIF / camera / GPS metadata
  // - Convert to WebP quality 80
  const derivativeBuffer = await sharp(inputBuffer)
    .resize({
      width: width >= height ? MAX_DERIVATIVE_DIMENSION : undefined,
      height: height > width ? MAX_DERIVATIVE_DIMENSION : undefined,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toBuffer();

  const derivativePath = path.join(storageBaseDir, derivativeKey);
  fs.writeFileSync(derivativePath, derivativeBuffer);

  return {
    sha256,
    mime_type: 'image/webp',
    original_bytes: inputBuffer.length,
    derivative_bytes: derivativeBuffer.length,
    width: Math.min(width, MAX_DERIVATIVE_DIMENSION),
    height: Math.min(height, MAX_DERIVATIVE_DIMENSION),
    quarantine_key: quarantineKey,
    derivative_key: derivativeKey,
  };
}
