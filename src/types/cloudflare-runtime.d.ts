// Import only the binding types; keep browser and Next.js globals unchanged.
import type {
  Fetcher as WorkerFetcher,
  Hyperdrive as WorkerHyperdrive,
  R2Bucket as WorkerR2Bucket,
} from '@cloudflare/workers-types';

declare global {
  type Fetcher = WorkerFetcher;
  type Hyperdrive = WorkerHyperdrive;
  type R2Bucket = WorkerR2Bucket;
}
