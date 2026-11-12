"""quita tablas visits legacy e indices redundantes

Revision ID: e5a1c7d92b4f
Revises: aee518bb361f
Create Date: 2026-11-11 16:00:00.000000

Limpieza aprobada del esquema:
  - visit_results y visits: tablas de la feature de agendar visitas que nunca se
    llevo a la web (0 filas, sin modelo ORM, sus endpoints dan 404).
  - 8 indices no-clustering REDUNDANTES: sus columnas son prefijo exacto de otro
    indice compuesto que se conserva (p. ej. ix_client_locations_niu (niu) esta
    cubierto por uq_location_niu_run (niu, data_run_id)). Las consultas siguen
    usando el indice compuesto con el mismo resultado.

Idempotente: en una BD donde los objetos ya no existen (p. ej. prod, limpiado a
mano) no hace nada y solo deja la version al dia.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e5a1c7d92b4f'
down_revision: Union[str, Sequence[str], None] = 'aee518bb361f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (tabla, indice) que se elimina; cada uno esta cubierto por otro indice conservado.
INDICES_REDUNDANTES = (
    ('client_consumption_monthly', 'ix_client_consumption_monthly_niu'),
    ('client_forecasts', 'ix_client_forecasts_data_run_id'),
    ('client_locations', 'ix_client_locations_niu'),
    ('operational_management', 'ix_operational_management_data_run_id'),
    ('client_drop_analysis', 'ix_client_drop_analysis_data_run_id'),
    ('client_churn_risk', 'ix_client_churn_risk_data_run_id'),
    ('dataset_records', 'ix_dataset_records_data_run_id'),
    ('data_files', 'ix_data_files_data_run_id'),
)

# Definiciones exactas para el downgrade (capturadas del esquema real).
COLUMNAS_INDICE = {
    'ix_client_consumption_monthly_niu': ('client_consumption_monthly', ['niu']),
    'ix_client_forecasts_data_run_id': ('client_forecasts', ['data_run_id']),
    'ix_client_locations_niu': ('client_locations', ['niu']),
    'ix_operational_management_data_run_id': ('operational_management', ['data_run_id']),
    'ix_client_drop_analysis_data_run_id': ('client_drop_analysis', ['data_run_id']),
    'ix_client_churn_risk_data_run_id': ('client_churn_risk', ['data_run_id']),
    'ix_dataset_records_data_run_id': ('dataset_records', ['data_run_id']),
    'ix_data_files_data_run_id': ('data_files', ['data_run_id']),
}


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    for tabla, indice in INDICES_REDUNDANTES:
        existentes = {idx['name'] for idx in inspector.get_indexes(tabla)}
        if indice in existentes:
            op.drop_index(indice, table_name=tabla)
    # visit_results primero por la FK hacia visits; las FKs salientes de visits
    # (hacia data_runs y clients) se eliminan junto con la tabla.
    tablas = set(inspector.get_table_names())
    if 'visit_results' in tablas:
        op.drop_table('visit_results')
    if 'visits' in tablas:
        op.drop_table('visits')


def downgrade() -> None:
    op.create_table(
        'visits',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('niu', sa.String(length=80), nullable=False),
        sa.Column('data_run_id', sa.Integer(), nullable=True),
        sa.Column('assigned_to_uid', sa.String(length=160), nullable=True),
        sa.Column('cycle', sa.Integer(), nullable=True),
        sa.Column('scheduled_for', sa.Date(), nullable=True),
        sa.Column('status', sa.String(length=30), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['data_run_id'], ['data_runs.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['niu'], ['clients.niu'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_visits_assigned_to_uid', 'visits', ['assigned_to_uid'], unique=False)
    op.create_index('ix_visits_cycle', 'visits', ['cycle'], unique=False)
    op.create_index('ix_visits_niu', 'visits', ['niu'], unique=False)
    op.create_index('ix_visits_status', 'visits', ['status'], unique=False)
    op.create_table(
        'visit_results',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('visit_id', sa.Integer(), nullable=False),
        sa.Column('result', sa.String(length=80), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by_uid', sa.String(length=160), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['visit_id'], ['visits.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('visit_id'),
    )
    for indice, (tabla, columnas) in COLUMNAS_INDICE.items():
        op.create_index(indice, tabla, columnas, unique=False)
