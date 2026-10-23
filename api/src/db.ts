import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless/driver';
import * as schema from '../../drizzle/schema';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '..', '.env') });

// WebSocket pool — persistent connections, no HTTP overhead per query.
// This fixes the 30s learners list timeout caused by Neon HTTP's stateless model.
//
// Resilience: Neon scales to zero when idle, so the first query after an idle
// window can take a few seconds. connectionTimeoutMillis bounds that wait and
// the caller can retry, instead of hanging a request indefinitely; idleTimeout
// reaps unused sockets; pool.on('error') catches connections Neon drops
// server-side so one bad client can't take the process down.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
});

pool.on('error', (error) => {
  console.error('[db] idle client error (connection dropped by Neon?):', error.message);
});

export const db = drizzle(pool, { schema });

/**
 * Raw SQL query via WebSocket pool — use for large IN clauses or queries
 * where Drizzle's query builder adds too much overhead.
 * Uses pool.query() which benefits from persistent connections + prepared statements.
 */
export async function rawQuery(queryText: string, params?: any[]): Promise<any[]> {
  const result = await pool.query(queryText, params || []);
  return result.rows;
}

/** Close the pool cleanly on SIGTERM/SIGINT so in-flight queries can finish. */
export async function closeDb(): Promise<void> {
  await pool.end();
}
