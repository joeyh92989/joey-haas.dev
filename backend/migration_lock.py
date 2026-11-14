"""The advisory lock key that serialises `alembic upgrade` runs.

Held by migrations/env.py on its own connection while migrations run, so two
runs against one database (two deploys close together, a deploy and a hand run)
take turns instead of both applying the same revision. Postgres advisory locks
are per database and the key is arbitrary. It lives here, not in env.py,
because env.py runs migrations when imported and a test has to hold the same
key to prove a waiting run waits.
"""

MIGRATION_LOCK_KEY = 7_243_000_001
