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
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

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
