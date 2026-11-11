-- EBSA Azure SQL Database schema generated from Alembic migrations.
-- Execute migrations with: alembic upgrade head
-- This file is a reference script; migrations remain the source of truth.
BEGIN TRANSACTION;

CREATE TABLE alembic_version (
    version_num VARCHAR(32) NOT NULL,
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

GO

-- Running upgrade  -> 870c2041cb28

CREATE TABLE clients (
    niu VARCHAR(80) NOT NULL,
    clase_servicio VARCHAR(40) NULL,
    clase_servicio_nombre VARCHAR(120) NULL,
    grupo_consumo VARCHAR(80) NULL,
    estrato INTEGER NULL,
    ciclo INTEGER NULL,
    ciclo_etiqueta VARCHAR(120) NULL,
    zona_nombre VARCHAR(120) NULL,
    zona_regional VARCHAR(120) NULL,
    updated_at DATETIMEOFFSET NOT NULL,
    payload NVARCHAR(max) NULL,
    PRIMARY KEY (niu)
);

GO

CREATE TABLE data_runs (
    id INTEGER NOT NULL IDENTITY,
    period VARCHAR(7) NOT NULL,
    source_path TEXT NOT NULL,
    status VARCHAR(20) NOT NULL,
    files_total INTEGER NOT NULL,
    rows_imported INTEGER NOT NULL,
    error_message TEXT NULL,
    created_at DATETIMEOFFSET NOT NULL,
    completed_at DATETIMEOFFSET NULL,
    PRIMARY KEY (id)
);

GO

CREATE UNIQUE INDEX ix_data_runs_period ON data_runs (period);

GO

CREATE INDEX ix_data_runs_status ON data_runs (status);

GO

CREATE TABLE client_churn_risk (
    id INTEGER NOT NULL IDENTITY,
    data_run_id INTEGER NOT NULL,
    niu VARCHAR(80) NOT NULL,
    fecha_corte DATETIME NULL,
    nivel_riesgo VARCHAR(20) NULL,
    prob_fuga_6m NUMERIC(12, 8) NULL,
    valor_esperado_perdida_mes NUMERIC(18, 2) NULL,
    valor_en_riesgo_mes NUMERIC(18, 2) NULL,
    senales TEXT NULL,
    payload NVARCHAR(max) NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(data_run_id) REFERENCES data_runs (id) ON DELETE CASCADE,
    CONSTRAINT uq_churn_run_niu UNIQUE (data_run_id, niu)
);

GO

CREATE INDEX ix_client_churn_risk_data_run_id ON client_churn_risk (data_run_id);

GO

CREATE INDEX ix_client_churn_risk_niu ON client_churn_risk (niu);

GO

CREATE INDEX ix_client_churn_risk_nivel_riesgo ON client_churn_risk (nivel_riesgo);

GO

CREATE TABLE client_consumption_monthly (
    id INTEGER NOT NULL IDENTITY,
    data_run_id INTEGER NULL,
    niu VARCHAR(80) NOT NULL,
    periodo DATETIME NOT NULL,
    consumo_kwh NUMERIC(18, 4) NULL,
    es_rural BIT NULL,
    estado_mes VARCHAR(60) NULL,
    payload NVARCHAR(max) NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(data_run_id) REFERENCES data_runs (id) ON DELETE SET NULL,
    CONSTRAINT uq_consumption_niu_period UNIQUE (niu, periodo)
);

GO

CREATE INDEX ix_client_consumption_monthly_data_run_id ON client_consumption_monthly (data_run_id);

GO

CREATE INDEX ix_client_consumption_monthly_niu ON client_consumption_monthly (niu);

GO

CREATE INDEX ix_client_consumption_monthly_periodo ON client_consumption_monthly (periodo);

GO

CREATE TABLE client_drop_analysis (
    id INTEGER NOT NULL IDENTITY,
    data_run_id INTEGER NOT NULL,
    niu VARCHAR(80) NOT NULL,
    fecha_corte DATETIME NULL,
    veredicto VARCHAR(80) NULL,
    severidad VARCHAR(40) NULL,
    consumo_anterior_kwh NUMERIC(18, 4) NULL,
    consumo_reciente_kwh NUMERIC(18, 4) NULL,
    variacion_vs_anterior_pct NUMERIC(12, 4) NULL,
    valor_riesgo_mes NUMERIC(18, 2) NULL,
    payload NVARCHAR(max) NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(data_run_id) REFERENCES data_runs (id) ON DELETE CASCADE,
    CONSTRAINT uq_drop_run_niu UNIQUE (data_run_id, niu)
);

GO

CREATE INDEX ix_client_drop_analysis_data_run_id ON client_drop_analysis (data_run_id);

GO

CREATE INDEX ix_client_drop_analysis_niu ON client_drop_analysis (niu);

GO

CREATE TABLE client_forecasts (
    id INTEGER NOT NULL IDENTITY,
    data_run_id INTEGER NOT NULL,
    niu VARCHAR(80) NOT NULL,
    fecha_corte DATETIME NULL,
    horizonte INTEGER NULL,
    periodo_pronosticado DATETIME NULL,
    consumo_pronosticado_kwh NUMERIC(18, 4) NULL,
    grupo_consumo VARCHAR(80) NULL,
    payload NVARCHAR(max) NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(data_run_id) REFERENCES data_runs (id) ON DELETE CASCADE,
    CONSTRAINT uq_forecast_run_niu_horizon UNIQUE (data_run_id, niu, horizonte)
);

GO

CREATE INDEX ix_client_forecasts_data_run_id ON client_forecasts (data_run_id);

GO

CREATE INDEX ix_client_forecasts_niu ON client_forecasts (niu);

GO

CREATE TABLE client_locations (
    id INTEGER NOT NULL IDENTITY,
    niu VARCHAR(80) NOT NULL,
    data_run_id INTEGER NULL,
    municipio VARCHAR(120) NULL,
    direccion TEXT NULL,
    latitud NUMERIC(12, 8) NULL,
    longitud NUMERIC(12, 8) NULL,
    coordenadas_validas BIT NULL,
    payload NVARCHAR(max) NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(data_run_id) REFERENCES data_runs (id) ON DELETE SET NULL,
    FOREIGN KEY(niu) REFERENCES clients (niu) ON DELETE CASCADE,
    CONSTRAINT uq_location_niu_run UNIQUE (niu, data_run_id)
);

GO

CREATE INDEX ix_client_locations_data_run_id ON client_locations (data_run_id);

GO

CREATE INDEX ix_client_locations_municipio ON client_locations (municipio);

GO

CREATE INDEX ix_client_locations_niu ON client_locations (niu);

GO

CREATE TABLE data_files (
    id INTEGER NOT NULL IDENTITY,
    data_run_id INTEGER NOT NULL,
    dataset_key VARCHAR(80) NOT NULL,
    relative_path TEXT NOT NULL,
    file_type VARCHAR(10) NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    rows_seen INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL,
    error_message TEXT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(data_run_id) REFERENCES data_runs (id) ON DELETE CASCADE,
    CONSTRAINT uq_data_file_run_dataset UNIQUE (data_run_id, dataset_key)
);

GO

CREATE INDEX ix_data_files_data_run_id ON data_files (data_run_id);

GO

CREATE INDEX ix_data_files_dataset_key ON data_files (dataset_key);

GO

CREATE TABLE operational_management (
    id INTEGER NOT NULL IDENTITY,
    data_run_id INTEGER NOT NULL,
    niu VARCHAR(80) NOT NULL,
    fecha_corte DATETIME NULL,
    ciclo INTEGER NULL,
    ciclo_etiqueta VARCHAR(120) NULL,
    severidad VARCHAR(40) NULL,
    trayectoria VARCHAR(80) NULL,
    estado_en_lista VARCHAR(40) NULL,
    prioridad_gestion VARCHAR(80) NULL,
    perdida_kwh_mes NUMERIC(18, 4) NULL,
    valor_riesgo_mes NUMERIC(18, 2) NULL,
    orden_en_ciclo INTEGER NULL,
    payload NVARCHAR(max) NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(data_run_id) REFERENCES data_runs (id) ON DELETE CASCADE,
    CONSTRAINT uq_operational_run_niu UNIQUE (data_run_id, niu)
);

GO

CREATE INDEX ix_operational_management_ciclo ON operational_management (ciclo);

GO

CREATE INDEX ix_operational_management_data_run_id ON operational_management (data_run_id);

GO

CREATE INDEX ix_operational_management_fecha_corte ON operational_management (fecha_corte);

GO

CREATE INDEX ix_operational_management_niu ON operational_management (niu);

GO

CREATE INDEX ix_operational_management_severidad ON operational_management (severidad);

GO

CREATE INDEX ix_operational_management_valor_riesgo_mes ON operational_management (valor_riesgo_mes);

GO

CREATE INDEX ix_operational_run_risk ON operational_management (data_run_id, valor_riesgo_mes);

GO

CREATE TABLE visits (
    id INTEGER NOT NULL IDENTITY,
    niu VARCHAR(80) NOT NULL,
    data_run_id INTEGER NULL,
    assigned_to_uid VARCHAR(160) NULL,
    cycle INTEGER NULL,
    scheduled_for DATETIME NULL,
    status VARCHAR(30) NOT NULL,
    created_at DATETIMEOFFSET NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(data_run_id) REFERENCES data_runs (id) ON DELETE SET NULL,
    FOREIGN KEY(niu) REFERENCES clients (niu) ON DELETE CASCADE
);

GO

CREATE INDEX ix_visits_assigned_to_uid ON visits (assigned_to_uid);

GO

CREATE INDEX ix_visits_cycle ON visits (cycle);

GO

CREATE INDEX ix_visits_niu ON visits (niu);

GO

CREATE INDEX ix_visits_status ON visits (status);

GO

CREATE TABLE visit_results (
    id INTEGER NOT NULL IDENTITY,
    visit_id INTEGER NOT NULL,
    result VARCHAR(80) NOT NULL,
    notes TEXT NULL,
    created_by_uid VARCHAR(160) NOT NULL,
    created_at DATETIMEOFFSET NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(visit_id) REFERENCES visits (id) ON DELETE CASCADE,
    UNIQUE (visit_id)
);

GO

INSERT INTO alembic_version (version_num) OUTPUT inserted.version_num VALUES ('870c2041cb28');

GO

-- Running upgrade 870c2041cb28 -> 36618b7aba52

CREATE TABLE pipeline_feedback (
    id INTEGER NOT NULL IDENTITY,
    data_run_id INTEGER NULL,
    category VARCHAR(80) NOT NULL,
    message TEXT NOT NULL,
    created_by_uid VARCHAR(160) NOT NULL,
    created_at DATETIMEOFFSET NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(data_run_id) REFERENCES data_runs (id) ON DELETE SET NULL
);

GO

CREATE INDEX ix_pipeline_feedback_category ON pipeline_feedback (category);

GO

CREATE INDEX ix_pipeline_feedback_data_run_id ON pipeline_feedback (data_run_id);

GO

UPDATE alembic_version SET version_num='36618b7aba52' WHERE alembic_version.version_num = '870c2041cb28';

GO

-- Running upgrade 36618b7aba52 -> dfff6973f6c9

CREATE TABLE dataset_records (
    id INTEGER NOT NULL IDENTITY,
    data_run_id INTEGER NOT NULL,
    dataset_key VARCHAR(100) NOT NULL,
    niu VARCHAR(80) NULL,
    payload NVARCHAR(max) NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(data_run_id) REFERENCES data_runs (id) ON DELETE CASCADE
);

GO

CREATE INDEX ix_dataset_records_data_run_id ON dataset_records (data_run_id);

GO

CREATE INDEX ix_dataset_records_dataset_key ON dataset_records (dataset_key);

GO

CREATE INDEX ix_dataset_records_niu ON dataset_records (niu);

GO

CREATE INDEX ix_dataset_records_run_key ON dataset_records (data_run_id, dataset_key);

GO

UPDATE alembic_version SET version_num='dfff6973f6c9' WHERE alembic_version.version_num = '36618b7aba52';

GO

COMMIT;

GO
