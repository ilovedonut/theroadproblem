import fs from 'node:fs';
import path from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

export interface StorageUploadResult {
  key: string;
  url: string;
  size: number;
  driver: 'r2-binding' | 'r2-s3' | 'local';
}

let s3ClientInstance: S3Client | null = null;

function getS3Client(): S3Client | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null;
  }

  if (!s3ClientInstance) {
    s3ClientInstance = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  return s3ClientInstance;
}

/**
 * Attempt to get Cloudflare Worker R2 binding from @opennextjs/cloudflare
 */
async function getCloudflareR2Bucket(): Promise<any | null> {
  try {
    // Dynamic import to prevent bundler failures in non-edge environments
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const env = ctx?.env as Record<string, any> | undefined;
    if (env && env.EVIDENCE_BUCKET) {
      return env.EVIDENCE_BUCKET;
    }
  } catch {
    // Not running in Cloudflare worker context
  }
  return null;
}

/**
 * Resolves the public URL for an asset.
 * If R2_PUBLIC_URL is configured (e.g. https://evidence.theroadproblem.quest), use that.
 * Otherwise fallback to /derivatives/{key} or /api/v1/storage/{key}.
 */
export function getStoragePublicUrl(key: string): string {
  const customDomain = process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_URL;
  if (customDomain) {
    const base = customDomain.replace(/\/+$/, '');
    const cleanKey = key.replace(/^\/+/, '');
    return `${base}/${cleanKey}`;
  }
  return `/${key}`;
}

/**
 * Store an object (evidence photo, tender PDF, or data export)
 * Priority:
 * 1. Cloudflare Native R2 Bucket Binding (Edge runtime)
 * 2. Cloudflare R2 via S3-compatible API (Server / Actions / CLI)
 * 3. Local filesystem fallback (Offline development & unit tests)
 */
export async function putStorageObject(
  key: string,
  buffer: Buffer | Uint8Array,
  contentType: string = 'application/octet-stream',
  localBaseDir: string = process.env.LOCAL_STORAGE_DIR || './storage_data'
): Promise<StorageUploadResult> {
  // 1. Check Cloudflare Native R2 Binding
  const r2Bucket = await getCloudflareR2Bucket();
  if (r2Bucket) {
    await r2Bucket.put(key, buffer, {
      httpMetadata: {
        contentType,
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });
    return {
      key,
      url: getStoragePublicUrl(key),
      size: buffer.length,
      driver: 'r2-binding',
    };
  }

  // 2. Check S3 / R2 credentials
  const s3 = getS3Client();
  const bucketName = process.env.R2_BUCKET_NAME || 'theroadproblem-evidence';
  if (s3 && process.env.STORAGE_DRIVER !== 'local') {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    });
    await s3.send(command);
    return {
      key,
      url: getStoragePublicUrl(key),
      size: buffer.length,
      driver: 'r2-s3',
    };
  }

  // 3. Fallback to Local Filesystem
  const fullPath = path.join(localBaseDir, key);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, buffer);

  return {
    key,
    url: getStoragePublicUrl(key),
    size: buffer.length,
    driver: 'local',
  };
}

/**
 * Retrieve an object from storage
 */
export async function getStorageObject(
  key: string,
  localBaseDir: string = process.env.LOCAL_STORAGE_DIR || './storage_data'
): Promise<Buffer | null> {
  // 1. Edge R2 Binding
  const r2Bucket = await getCloudflareR2Bucket();
  if (r2Bucket) {
    const obj = await r2Bucket.get(key);
    if (!obj) return null;
    const arrayBuffer = await obj.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  // 2. S3 / R2 Client
  const s3 = getS3Client();
  const bucketName = process.env.R2_BUCKET_NAME || 'theroadproblem-evidence';
  if (s3 && process.env.STORAGE_DRIVER !== 'local') {
    try {
      const response = await s3.send(new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      }));
      if (!response.Body) return null;
      const byteArray = await response.Body.transformToByteArray();
      return Buffer.from(byteArray);
    } catch (err: any) {
      if (err.name === 'NoSuchKey') return null;
      throw err;
    }
  }

  // 3. Local Filesystem
  const fullPath = path.join(localBaseDir, key);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  return fs.readFileSync(fullPath);
}

/**
 * Delete an object from storage (e.g. DPDP Act right-to-erasure)
 */
export async function deleteStorageObject(
  key: string,
  localBaseDir: string = process.env.LOCAL_STORAGE_DIR || './storage_data'
): Promise<boolean> {
  // 1. Edge R2 Binding
  const r2Bucket = await getCloudflareR2Bucket();
  if (r2Bucket) {
    await r2Bucket.delete(key);
    return true;
  }

  // 2. S3 / R2 Client
  const s3 = getS3Client();
  const bucketName = process.env.R2_BUCKET_NAME || 'theroadproblem-evidence';
  if (s3 && process.env.STORAGE_DRIVER !== 'local') {
    await s3.send(new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    }));
    return true;
  }

  // 3. Local Filesystem
  const fullPath = path.join(localBaseDir, key);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    return true;
  }
  return false;
}
