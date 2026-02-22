import pg from 'pg'

// Lazy pool so DATABASE_URL is read at first use (after dotenv has loaded)
let _pool: pg.Pool | null = null

export function getPool(): pg.Pool {
  if (!_pool) _pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  return _pool
}
