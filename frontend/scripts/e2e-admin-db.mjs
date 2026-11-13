// Prepares the local database for the admin browser suite (#205): creates
// `joeyhaas_e2e` if it is missing, then migrates it to alembic head.
// Idempotent. It only ever touches the one database named below.
// E2E_PG_ADMIN_URL overrides the connection used to create it (a maintenance
// database such as template1 on another host, user or port); the database it
// creates and migrates is always `joeyhaas_e2e`.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { e2eBackendBin, E2E_DB_URL } from '../e2e/admin-env.js'

const DB = 'joeyhaas_e2e'
const ADMIN_URL =
  process.env.E2E_PG_ADMIN_URL ??
  'postgresql://postgres:postgres@localhost:5432/template1'

const dist = fileURLToPath(new URL('../dist/index.html', import.meta.url))
if (!existsSync(dist)) {
  console.error(
    'frontend/dist is missing: build first with `VITE_DAILY_SALT=local npm run build` (the admin suite serves the last build).',
  )
  process.exit(1)
}

function run(what, hint, cmd, args, options = {}) {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      stdio: 'pipe',
      ...options,
    })
  } catch (error) {
    const detail = (error.stderr || error.message || '').toString().trim()
    console.error(`e2e:admin: ${what} failed.\n${detail}\nFix: ${hint}`)
    process.exit(1)
  }
}

const PSQL_HINT =
  'make sure `psql` is on PATH and Postgres is running and reachable (set E2E_PG_ADMIN_URL if it is not postgres:postgres@localhost:5432).'

const exists = run('checking for the database with psql', PSQL_HINT, 'psql', [
  ADMIN_URL,
  '-tAc',
  `SELECT 1 FROM pg_database WHERE datname = '${DB}'`,
]).trim()
if (!exists) {
  run('creating the database with psql', PSQL_HINT, 'psql', [
    ADMIN_URL,
    '-c',
    `CREATE DATABASE ${DB}`,
  ])
  console.log(`created database ${DB}`)
}

const backend = fileURLToPath(new URL('../../backend', import.meta.url))
const output = run(
  'alembic upgrade head',
  'check E2E_BACKEND_BIN points at a venv bin directory with alembic installed (the backend venv, `pip install -r backend/requirements.txt`).',
  `${e2eBackendBin()}/alembic`,
  ['upgrade', 'head'],
  { cwd: backend, env: { ...process.env, DATABASE_URL_DIRECT: E2E_DB_URL } },
)
console.log(output.trim() || `${DB} is at head`)
