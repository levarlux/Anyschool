import * as schema from '../../drizzle/schema';
export declare const db: import("drizzle-orm/neon-serverless/driver").NeonDatabase<typeof schema>;
/**
 * Raw SQL query via WebSocket pool — use for large IN clauses or queries
 * where Drizzle's query builder adds too much overhead.
 * Uses pool.query() which benefits from persistent connections + prepared statements.
 */
export declare function rawQuery(queryText: string, params?: any[]): Promise<any[]>;
//# sourceMappingURL=db.d.ts.map