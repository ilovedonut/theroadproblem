import type pg from 'pg';

/** Retry connection acquisition only; never replay a partially written import. */
export async function connectForIngestion(
  pool: Pick<pg.Pool, 'connect'>,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<pg.PoolClient> {
  for (let attempt = 0; ; attempt++) {
    try { return await pool.connect(); }
    catch (error) {
      const failure = error as { code?: string; message?: string };
      const transient = ['53300', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'].includes(failure.code || '')
        || /EMAXCONNSESSION|max clients reached|too many clients|remaining connection slots|connection timeout/i.test(failure.message || '');
      if (!transient || attempt >= 2) throw error;
      await wait(500 * 2 ** attempt);
    }
  }
}
