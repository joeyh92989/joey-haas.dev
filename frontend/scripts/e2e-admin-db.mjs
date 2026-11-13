// Prepares the local database for the admin browser suite (#205): creates
// `joeyhaas_e2e` if it is missing, then migrates it to alembic head.
// Idempotent. It only ever touches the one database named below.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { e2eBackendBin, E2E_DB_URL } from '../e2e/admin-env.js'

const DB = 'joeyhaas_e2e'
const ADMIN_URL = 'postgresql://postgres:postgres@localhost:5432/template1'
const run = (cmd, args, options = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...options })

const exists = run('psql', [
  ADMIN_URL,
  '-tAc',
  `SELECT 1 FROM pg_database WHERE datname = '${DB}'`,
]).trim()
if (!exists) {
  run('psql', [ADMIN_URL, '-c', `CREATE DATABASE ${DB}`])
  console.log(`created database ${DB}`)
}

const backend = fileURLToPath(new URL('../../backend', import.meta.url))
const output = run(`${e2eBackendBin()}/alembic`, ['upgrade', 'head'], {
  cwd: backend,
  env: { ...process.env, DATABASE_URL_DIRECT: E2E_DB_URL },
})
console.log(output.trim() || `${DB} is at head`)
