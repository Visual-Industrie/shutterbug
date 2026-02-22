// Server-side only — used in Vercel API functions
// Do not import this in frontend code

import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('Missing DATABASE_URL')

export const db = drizzle(connectionString, { schema })
