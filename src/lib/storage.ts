import fs from 'node:fs';
import path from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

export interface StorageUploadResult {
  key: string;
  url?: string;
  size: number;
  bucket: string;
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
 * Access Cloudflare Worker bindings dynamically from @opennextjs/cloudflare
 */
async function getCloudflareBinding(bindingName: string): Promise<any | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const env = ctx?.env as Record<string, any> | undefined;
    if (env && env[bindingName]) {
      return env[bindingName];
    }
  } catch {
    // Not running inside Cloudflare worker environment
  }
  return null;
}

// Separate bucket configuration ensuring strict privacy
const QUARANTINE_BUCKET_NAME = process.env.R2_QUARANTINE_BUCKET || 'theroadproblem-quarantine-private';
const PUBLIC_BUCKET_NAME = process.env.R2_PUBLIC_BUCKET || 'theroadproblem-derivatives-public';

const LOCAL_PRIVATE_DIR = process.env.LOCAL_PRIVATE_DIR || './storage_private';
const LOCAL_PUBLIC_DIR = process.env.LOCAL_PUBLIC_DIR || './storage_public';

/**
 * Public CDN URL for derivatives. Never returns URLs for quarantined private items.
 */
export function getPublicDerivativeUrl(key: string): string {
  if (key.startsWith('quarantine/') || key.includes('private')) {
    throw new Error('Privacy Violation: Quarantined original files have no public URL.');
  }
  const customDomain = process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_URL;
  if (customDomain) {
    const base = customDomain.replace(/\/+$/, '');
    const cleanKey = key.replace(/^\/+/, '');
    return `${base}/${cleanKey}`;
  }
  return `/${key.replace(/^\/+/, '')}`;
}

/**
 * 1. QUARANTINE STORAGE: Strictly Private Bucket
 * Stores unvetted citizen uploads and raw evidence payloads with zero public access.
 */
export async function putQuarantinedOriginal(
  key: string,
  buffer: Buffer | Uint8Array,
  contentType: string = 'application/octet-stream'
): Promise<StorageUploadResult> {
  // Edge R2 binding
  const r2Bucket = await getCloudflareBinding('QUARANTINE_BUCKET');
  if (r2Bucket) {
    await r2Bucket.put(key, buffer, {
      httpMetadata: { contentType },
    });
    return {
      key,
      size: buffer.length,
      bucket: QUARANTINE_BUCKET_NAME,
      driver: 'r2-binding',
    };
  }

  // S3 Client
  const s3 = getS3Client();
  if (s3 && process.env.STORAGE_DRIVER !== 'local') {
    await s3.send(new PutObjectCommand({
      Bucket: QUARANTINE_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));
    return {
      key,
      size: buffer.length,
      bucket: QUARANTINE_BUCKET_NAME,
      driver: 'r2-s3',
    };
  }

  // Local private filesystem (outside web root)
  const fullPath = path.join(LOCAL_PRIVATE_DIR, key);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, buffer);

  return {
    key,
    size: buffer.length,
    bucket: 'local-private',
    driver: 'local',
  };
}

export async function getQuarantinedOriginal(key: string): Promise<Buffer | null> {
  const r2Bucket = await getCloudflareBinding('QUARANTINE_BUCKET');
  if (r2Bucket) {
    const obj = await r2Bucket.get(key);
    if (!obj) return null;
    return Buffer.from(await obj.arrayBuffer());
  }

  const s3 = getS3Client();
  if (s3 && process.env.STORAGE_DRIVER !== 'local') {
    try {
      const response = await s3.send(new GetObjectCommand({
        Bucket: QUARANTINE_BUCKET_NAME,
        Key: key,
      }));
      if (!response.Body) return null;
      return Buffer.from(await response.Body.transformToByteArray());
    } catch (err: any) {
      if (err.name === 'NoSuchKey') return null;
      throw err;
    }
  }

  const fullPath = path.join(LOCAL_PRIVATE_DIR, key);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath);
}

export async function deleteQuarantinedOriginal(key: string): Promise<boolean> {
  const r2Bucket = await getCloudflareBinding('QUARANTINE_BUCKET');
  if (r2Bucket) {
    await r2Bucket.delete(key);
    return true;
  }

  const s3 = getS3Client();
  if (s3 && process.env.STORAGE_DRIVER !== 'local') {
    await s3.send(new DeleteObjectCommand({
      Bucket: QUARANTINE_BUCKET_NAME,
      Key: key,
    }));
    return true;
  }

  const fullPath = path.join(LOCAL_PRIVATE_DIR, key);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    return true;
  }
  return false;
}

/**
 * 2. PUBLIC DERIVATIVES STORAGE: Public CDN Bucket
 * Stores normalized, EXIF-stripped WebP derivative images and public data exports.
 */
export async function putPublicDerivative(
  key: string,
  buffer: Buffer | Uint8Array,
  contentType: string = 'image/webp'
): Promise<StorageUploadResult> {
  const r2Bucket = await getCloudflareBinding('PUBLIC_DERIVATIVES_BUCKET') || await getCloudflareBinding('EVIDENCE_BUCKET');
  if (r2Bucket) {
    await r2Bucket.put(key, buffer, {
      httpMetadata: {
        contentType,
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });
    return {
      key,
      url: getPublicDerivativeUrl(key),
      size: buffer.length,
      bucket: PUBLIC_BUCKET_NAME,
      driver: 'r2-binding',
    };
  }

  const s3 = getS3Client();
  if (s3 && process.env.STORAGE_DRIVER !== 'local') {
    await s3.send(new PutObjectCommand({
      Bucket: PUBLIC_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    return {
      key,
      url: getPublicDerivativeUrl(key),
      size: buffer.length,
      bucket: PUBLIC_BUCKET_NAME,
      driver: 'r2-s3',
    };
  }

  const fullPath = path.join(LOCAL_PUBLIC_DIR, key);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, buffer);

  return {
    key,
    url: getPublicDerivativeUrl(key),
    size: buffer.length,
    bucket: 'local-public',
    driver: 'local',
  };
}

export async function getPublicDerivative(key: string): Promise<Buffer | null> {
  const r2Bucket = await getCloudflareBinding('PUBLIC_DERIVATIVES_BUCKET') || await getCloudflareBinding('EVIDENCE_BUCKET');
  if (r2Bucket) {
    const obj = await r2Bucket.get(key);
    if (!obj) return null;
    return Buffer.from(await obj.arrayBuffer());
  }

  const s3 = getS3Client();
  if (s3 && process.env.STORAGE_DRIVER !== 'local') {
    try {
      const response = await s3.send(new GetObjectCommand({
        Bucket: PUBLIC_BUCKET_NAME,
        Key: key,
      }));
      if (!response.Body) return null;
      return Buffer.from(await response.Body.transformToByteArray());
    } catch (err: any) {
      if (err.name === 'NoSuchKey') return null;
      throw err;
    }
  }

  const fullPath = path.join(LOCAL_PUBLIC_DIR, key);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath);
}

// Backward-compatible generic storage methods
export async function putStorageObject(
  key: string,
  buffer: Buffer | Uint8Array,
  contentType: string = 'application/octet-stream',
  localBaseDir?: string
): Promise<StorageUploadResult> {
  if (key.startsWith('quarantine/') || key.startsWith('raw_sources/')) {
    return putQuarantinedOriginal(key, buffer, contentType);
  }
  return putPublicDerivative(key, buffer, contentType);
}

export async function getStorageObject(
  key: string,
  localBaseDir?: string
): Promise<Buffer | null> {
  if (key.startsWith('quarantine/') || key.startsWith('raw_sources/')) {
    return getQuarantinedOriginal(key);
  }
  return getPublicDerivative(key);
}

export async function deleteStorageObject(
  key: string,
  localBaseDir?: string
): Promise<boolean> {
  if (key.startsWith('quarantine/') || key.startsWith('raw_sources/')) {
    return deleteQuarantinedOriginal(key);
  }
  const fullPath = path.join(LOCAL_PUBLIC_DIR, key);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    return true;
  }
  return false;
}
