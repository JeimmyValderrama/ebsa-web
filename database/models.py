from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, JSON, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class DataRun(Base):
    __tablename__ = "data_runs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    period: Mapped[str] = mapped_column(String(7), unique=True, index=True)
    source_path: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="STARTED", index=True)
    files_total: Mapped[int] = mapped_column(Integer, default=0)
    rows_imported: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    files: Mapped[list[DataFile]] = relationship(back_populates="run", cascade="all, delete-orphan")


class DataFile(Base):
    __tablename__ = "data_files"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    data_run_id: Mapped[int] = mapped_column(ForeignKey("data_runs.id", ondelete="CASCADE"), index=True)
    dataset_key: Mapped[str] = mapped_column(String(80), index=True)
    relative_path: Mapped[str] = mapped_column(Text)
    file_type: Mapped[str] = mapped_column(String(10))
    file_size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    rows_seen: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="PENDING")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    run: Mapped[DataRun] = relationship(back_populates="files")
    __table_args__ = (UniqueConstraint("data_run_id", "dataset_key", name="uq_data_file_run_dataset"),)


class DatasetRecord(Base):
    __tablename__ = "dataset_records"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    data_run_id: Mapped[int] = mapped_column(ForeignKey("data_runs.id", ondelete="CASCADE"), index=True)
    dataset_key: Mapped[str] = mapped_column(String(100), index=True)
    niu: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)
    __table_args__ = (Index("ix_dataset_records_run_key", "data_run_id", "dataset_key"),)


class Client(Base):
    __tablename__ = "clients"
    niu: Mapped[str] = mapped_column(String(80), primary_key=True)
    clase_servicio: Mapped[str | None] = mapped_column(String(40), nullable=True)
    clase_servicio_nombre: Mapped[str | None] = mapped_column(String(120), nullable=True)
    grupo_consumo: Mapped[str | None] = mapped_column(String(80), nullable=True)
    estrato: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ciclo: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ciclo_etiqueta: Mapped[str | None] = mapped_column(String(120), nullable=True)
    zona_nombre: Mapped[str | None] = mapped_column(String(120), nullable=True)
    zona_regional: Mapped[str | None] = mapped_column(String(120), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)


class ClientLocation(Base):
    __tablename__ = "client_locations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    niu: Mapped[str] = mapped_column(ForeignKey("clients.niu", ondelete="CASCADE"), index=True)
    data_run_id: Mapped[int | None] = mapped_column(ForeignKey("data_runs.id", ondelete="SET NULL"), nullable=True, index=True)
    municipio: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    direccion: Mapped[str | None] = mapped_column(Text, nullable=True)
    latitud: Mapped[Decimal | None] = mapped_column(Numeric(12, 8), nullable=True)
    longitud: Mapped[Decimal | None] = mapped_column(Numeric(12, 8), nullable=True)
    coordenadas_validas: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    __table_args__ = (UniqueConstraint("niu", "data_run_id", name="uq_location_niu_run"),)


class OperationalManagement(Base):
    __tablename__ = "operational_management"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    data_run_id: Mapped[int] = mapped_column(ForeignKey("data_runs.id", ondelete="CASCADE"), index=True)
    niu: Mapped[str] = mapped_column(String(80), index=True)
    fecha_corte: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    ciclo: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    ciclo_etiqueta: Mapped[str | None] = mapped_column(String(120), nullable=True)
    severidad: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    trayectoria: Mapped[str | None] = mapped_column(String(80), nullable=True)
    estado_en_lista: Mapped[str | None] = mapped_column(String(40), nullable=True)
    prioridad_gestion: Mapped[str | None] = mapped_column(String(80), nullable=True)
    perdida_kwh_mes: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    valor_riesgo_mes: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True, index=True)
    orden_en_ciclo: Mapped[int | None] = mapped_column(Integer, nullable=True)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    __table_args__ = (UniqueConstraint("data_run_id", "niu", name="uq_operational_run_niu"), Index("ix_operational_run_risk", "data_run_id", "valor_riesgo_mes"))


class ClientDropAnalysis(Base):
    __tablename__ = "client_drop_analysis"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    data_run_id: Mapped[int] = mapped_column(ForeignKey("data_runs.id", ondelete="CASCADE"), index=True)
    niu: Mapped[str] = mapped_column(String(80), index=True)
    fecha_corte: Mapped[date | None] = mapped_column(Date, nullable=True)
    veredicto: Mapped[str | None] = mapped_column(String(80), nullable=True)
    severidad: Mapped[str | None] = mapped_column(String(40), nullable=True)
    consumo_anterior_kwh: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    consumo_reciente_kwh: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    variacion_vs_anterior_pct: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    valor_riesgo_mes: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    __table_args__ = (UniqueConstraint("data_run_id", "niu", name="uq_drop_run_niu"),)


class ClientChurnRisk(Base):
    __tablename__ = "client_churn_risk"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    data_run_id: Mapped[int] = mapped_column(ForeignKey("data_runs.id", ondelete="CASCADE"), index=True)
    niu: Mapped[str] = mapped_column(String(80), index=True)
    fecha_corte: Mapped[date | None] = mapped_column(Date, nullable=True)
    nivel_riesgo: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    prob_fuga_6m: Mapped[Decimal | None] = mapped_column(Numeric(12, 8), nullable=True)
    valor_esperado_perdida_mes: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    valor_en_riesgo_mes: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    senales: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    __table_args__ = (UniqueConstraint("data_run_id", "niu", name="uq_churn_run_niu"),)


class ClientForecast(Base):
    __tablename__ = "client_forecasts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    data_run_id: Mapped[int] = mapped_column(ForeignKey("data_runs.id", ondelete="CASCADE"), index=True)
    niu: Mapped[str] = mapped_column(String(80), index=True)
    fecha_corte: Mapped[date | None] = mapped_column(Date, nullable=True)
    horizonte: Mapped[int | None] = mapped_column(Integer, nullable=True)
    periodo_pronosticado: Mapped[date | None] = mapped_column(Date, nullable=True)
    consumo_pronosticado_kwh: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    grupo_consumo: Mapped[str | None] = mapped_column(String(80), nullable=True)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    __table_args__ = (UniqueConstraint("data_run_id", "niu", "horizonte", name="uq_forecast_run_niu_horizon"),)


class ClientConsumptionMonthly(Base):
    __tablename__ = "client_consumption_monthly"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    data_run_id: Mapped[int | None] = mapped_column(ForeignKey("data_runs.id", ondelete="SET NULL"), nullable=True, index=True)
    niu: Mapped[str] = mapped_column(String(80), index=True)
    periodo: Mapped[date] = mapped_column(Date, index=True)
    consumo_kwh: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    es_rural: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    estado_mes: Mapped[str | None] = mapped_column(String(60), nullable=True)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    __table_args__ = (UniqueConstraint("niu", "periodo", name="uq_consumption_niu_period"),)


class Visit(Base):
    __tablename__ = "visits"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    niu: Mapped[str] = mapped_column(ForeignKey("clients.niu", ondelete="CASCADE"), index=True)
    data_run_id: Mapped[int | None] = mapped_column(ForeignKey("data_runs.id", ondelete="SET NULL"), nullable=True)
    assigned_to_uid: Mapped[str | None] = mapped_column(String(160), nullable=True, index=True)
    cycle: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    scheduled_for: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="PENDIENTE", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class VisitResult(Base):
    __tablename__ = "visit_results"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    visit_id: Mapped[int] = mapped_column(ForeignKey("visits.id", ondelete="CASCADE"), unique=True)
    result: Mapped[str] = mapped_column(String(80))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_uid: Mapped[str] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class PipelineRun(Base):
    """Corrida del pipeline registrada en 09_registro_corridas/<corrida>/resumen_corrida.txt."""

    __tablename__ = "pipeline_runs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    data_run_id: Mapped[int | None] = mapped_column(ForeignKey("data_runs.id", ondelete="SET NULL"), nullable=True, index=True)
    folder_name: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    action: Mapped[str | None] = mapped_column(String(40), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    summary_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class PipelineFeedback(Base):
    __tablename__ = "pipeline_feedback"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    data_run_id: Mapped[int | None] = mapped_column(ForeignKey("data_runs.id", ondelete="SET NULL"), nullable=True, index=True)
    category: Mapped[str] = mapped_column(String(80), index=True)
    message: Mapped[str] = mapped_column(Text)
    created_by_uid: Mapped[str] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


__all__ = [
    "Base", "Client", "ClientChurnRisk", "ClientConsumptionMonthly", "ClientDropAnalysis", "ClientForecast",
    "ClientLocation", "DataFile", "DataRun", "DatasetRecord", "OperationalManagement", "PipelineFeedback", "PipelineRun", "Visit", "VisitResult",
]
