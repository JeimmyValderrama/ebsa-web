-- Esquema de referencia EBSA.
-- La creación ejecutable se realiza con `python -m database.init_db` usando SQLAlchemy.
-- No contiene datos productivos ni elimina tablas existentes.

CREATE TABLE IF NOT EXISTS data_runs (
  id SERIAL PRIMARY KEY,
  period VARCHAR(7) NOT NULL UNIQUE,
  source_path TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'STARTED',
  files_total INTEGER NOT NULL DEFAULT 0,
  rows_imported INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_data_runs_period ON data_runs(period);
CREATE INDEX IF NOT EXISTS ix_data_runs_status ON data_runs(status);

-- El resto de tablas se genera desde database/models.py para conservar un único modelo fuente.
-- Las futuras modificaciones serán migraciones Alembic aditivas.
