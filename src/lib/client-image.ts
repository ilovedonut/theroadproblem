'use client';

export interface CompressedImageResult {
  blob: Blob;
  originalBytes: number;
  compressedBytes: number;
  width: number;
  height: number;
  dataUrl: string;
}

const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 0.82;

/**
 * Compresses an image file in-browser on the client side before upload.
 * Reduces raw mobile photos (5MB - 12MB) down to ~80KB - 160KB WebP.
 * Strips camera and GPS EXIF metadata in the canvas rasterization step.
 */
export async function compressImageOnClient(file: File): Promise<CompressedImageResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode image data'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Scale down if exceeding maximum bounds
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          } else {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 2D context unavailable'));
          return;
        }

        // Draw image into canvas (stripping EXIF metadata)
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to WebP format
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image to WebP'));
              return;
            }

            const dataUrl = canvas.toDataURL('image/webp', WEBP_QUALITY);

            resolve({
              blob,
              originalBytes: file.size,
              compressedBytes: blob.size,
              width,
              height,
              dataUrl,
            });
          },
          'image/webp',
          WEBP_QUALITY
        );
      };

      if (e.target?.result) {
        img.src = e.target.result as string;
      }
    };

    reader.readAsDataURL(file);
  });
}
