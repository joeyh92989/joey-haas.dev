import path from 'node:path'

/** The only database the admin suite touches. Never `postgres`. */
export const E2E_DB_URL =
  'postgresql://postgres:postgres@localhost:5432/joeyhaas_e2e'

/**
 * Directory holding uvicorn and alembic. Defaults to the backend venv next to
 * the frontend; set E2E_BACKEND_BIN to use another one (a worktree has none).
 */
export function e2eBackendBin() {
  return path.resolve(
    process.env.E2E_BACKEND_BIN ??
      path.join(import.meta.dirname, '..', '..', 'backend', '.venv', 'bin'),
  )
}
