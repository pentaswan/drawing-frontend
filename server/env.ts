import { config } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = resolve(rootDir, '.env')

const result = config({ path: envPath })

if (result.error) {
  console.warn(`[env] Could not load ${envPath}: ${result.error.message}`)
} else {
  const keys = Object.keys(result.parsed ?? {})
  console.log(`[env] Loaded ${keys.length} vars from ${envPath}`)
}

export { envPath, rootDir }
