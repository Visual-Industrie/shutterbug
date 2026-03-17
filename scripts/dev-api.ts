/**
 * Local dev API server — thin wrapper around api/index.ts.
 * Usage: npx tsx scripts/dev-api.ts
 *
 * dotenv is loaded synchronously before the dynamic import of api/index.ts
 * so all env vars are available when the pool initialises on first request.
 */
import * as dotenv from 'dotenv'
import * as path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

// Dynamic import AFTER dotenv so DATABASE_URL etc. are set before any module-level code runs
const { default: apiApp } = await import('../api/index.js')

const app = express()

// CORS for Vite dev server
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS')
  next()
})
app.options('/{*path}', (_req, res) => res.sendStatus(204))

app.use(apiApp)

const PORT = 3003
app.listen(PORT, () => console.log(`API server running at http://localhost:${PORT}`))
