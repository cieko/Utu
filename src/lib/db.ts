import { Pool } from 'pg';

export function createPool(connectionString: string): Pool {
  const sslMode = (process.env.PGSSLMODE ?? '').toLowerCase();
  const ssl = sslMode === 'require' ? { rejectUnauthorized: false } : undefined;

  return new Pool({
    connectionString,
    ssl,
  });
}
