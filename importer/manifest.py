from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class DatasetSpec:
    key: str
    relative_path: str
    file_kind: str
    required: bool
    required_columns: tuple[str, ...]
    target: str | None


# Corresponde a las rutas declaradas en la clase Rutas del Streamlit original.
# target=None significa que se conserva en dataset_records sin imponer un esquema rígido.
DATASETS: tuple[DatasetSpec, ...] = (
    DatasetSpec("operational", "07_gestion_caida/gestion_caida_operativa.csv", "csv", True, ("NIU",), "operational"),
    DatasetSpec("managerial", "07_gestion_caida/gestion_caida_gerencial.csv", "csv", False, ("NIU",), None),
    DatasetSpec("cycle_summary", "07_gestion_caida/resumen_gestion_por_ciclo.csv", "csv", False, (), None),
    DatasetSpec("cut_summary", "07_gestion_caida/resumen_gestion_por_corte.csv", "csv", False, (), None),
    DatasetSpec("list_entries_exits", "07_gestion_caida/resumen_entradas_salidas_lista.csv", "csv", False, (), None),
    DatasetSpec("zero_sustained", "07_gestion_caida/clientes_cero_sostenido.csv", "csv", False, ("NIU",), None),
    DatasetSpec("projection_monthly", "14_proyeccion_anual/proyeccion_mensual_por_zona.csv", "csv", False, (), None),
    DatasetSpec("projection_annual", "14_proyeccion_anual/proyeccion_anual_por_zona.csv", "csv", False, (), None),
    DatasetSpec("projection_backtest", "14_proyeccion_anual/error_backtest_por_zona.csv", "csv", False, (), None),
    DatasetSpec("projection_comparison", "14_proyeccion_anual/comparacion_pronostico_individual.csv", "csv", False, (), None),
    DatasetSpec("forecast", "04_pronostico/modelo_final/predicciones_segmentadas_optimizadas_6_meses.parquet", "parquet", False, ("NIU",), "forecast"),
    DatasetSpec("forecast_profile_metrics", "04_pronostico/modelo_final/metricas_sistema_por_perfil_horizonte_optimizado.csv", "csv", False, (), None),
    DatasetSpec("forecast_global_metrics", "04_pronostico/modelo_final/metricas_sistema_ganador_backtest_optimizado.csv", "csv", False, (), None),
    DatasetSpec("forecast_model_selection", "04_pronostico/modelo_final/seleccion_modelo_por_perfil_horizonte_optimizada.csv", "csv", False, (), None),
    DatasetSpec("clusters", "05_segmentos_clientes/clientes_clusters_consumo.parquet", "parquet", False, ("NIU",), None),
    DatasetSpec("segment_catalog", "05_segmentos_clientes/catalogo_segmentos_negocio.csv", "csv", False, (), None),
    DatasetSpec("drop_analysis", "06_estudio_caida/estudio_caida_consumo.parquet", "parquet", False, ("NIU",), "drop"),
    DatasetSpec("drop_summary", "06_estudio_caida/resumen_caida_por_segmento.csv", "csv", False, (), None),
    DatasetSpec("followup_global", "08_seguimiento/seguimiento_pronostico_global.csv", "csv", False, (), None),
    DatasetSpec("followup_profile", "08_seguimiento/seguimiento_pronostico_por_perfil.csv", "csv", False, (), None),
    DatasetSpec("followup_zone", "08_seguimiento/seguimiento_pronostico_por_zona.csv", "csv", False, (), None),
    DatasetSpec("followup_list", "08_seguimiento/seguimiento_lista_gestion.csv", "csv", False, (), None),
    DatasetSpec("feedback_summary", "07_gestion_caida/retroalimentacion/evaluacion_retroalimentacion_resumen.csv", "csv", False, (), None),
    DatasetSpec("quality_control", "02_serie_reconstruida/control_calidad_mes_entrante.csv", "csv", False, (), None),
    DatasetSpec("churn_scores", "10_riesgo_fuga/riesgo_fuga_clientes.csv", "csv", False, ("NIU",), "churn"),
    DatasetSpec("churn_managerial", "10_riesgo_fuga/lista_riesgo_fuga_gerencial.csv", "csv", False, ("NIU",), None),
    DatasetSpec("churn_zone", "10_riesgo_fuga/lista_riesgo_fuga_por_zona.csv", "csv", False, (), None),
    DatasetSpec("churn_other_supplier", "10_riesgo_fuga/clientes_con_otro_comercializador.csv", "csv", False, ("NIU",), None),
    DatasetSpec("churn_non_regulated", "10_riesgo_fuga/vigilancia_mercado_no_regulado.csv", "csv", False, ("NIU",), None),
    DatasetSpec("churn_left_profiles", "10_riesgo_fuga/perfil_clientes_que_se_fueron.csv", "csv", False, (), None),
    DatasetSpec("churn_zone_summary", "10_riesgo_fuga/resumen_riesgo_fuga_por_zona.csv", "csv", False, (), None),
    DatasetSpec("churn_group_summary", "10_riesgo_fuga/resumen_riesgo_fuga_por_grupo.csv", "csv", False, (), None),
    DatasetSpec("churn_metrics", "10_riesgo_fuga/metricas_modelo_fuga.csv", "csv", False, (), None),
    DatasetSpec("churn_feature_importance", "10_riesgo_fuga/importancia_variables_fuga.csv", "csv", False, (), None),
    DatasetSpec("churn_followup", "10_riesgo_fuga/seguimiento_riesgo_fuga.csv", "csv", False, (), None),
    DatasetSpec("exports_index", "11_exportes_negocio/indice_exportes.csv", "csv", False, (), None),
    DatasetSpec("zone_cuts", "03_serie_modelado/cortes_por_zona.csv", "csv", False, (), None),
    DatasetSpec("consumption", "03_serie_modelado/serie_mensual_modelado_preprocesada.parquet", "parquet", False, ("NIU", "periodo"), "consumption"),
    DatasetSpec("cycle_by_niu", "03_serie_modelado/niu_ciclo.parquet", "parquet", False, ("NIU",), "client"),
    DatasetSpec("autogenerators", "03_serie_modelado/nius_autogeneradores_excluidos.parquet", "parquet", False, ("NIU",), None),
    DatasetSpec("locations", "13_ubicacion_clientes/ubicacion_clientes.parquet", "parquet", False, ("NIU",), "location"),
    DatasetSpec("municipalities", "13_ubicacion_clientes/municipios_zona.csv", "csv", False, (), None),
)


def discover(source: Path) -> tuple[list[tuple[DatasetSpec, Path]], list[DatasetSpec]]:
    found: list[tuple[DatasetSpec, Path]] = []
    missing_required: list[DatasetSpec] = []
    for spec in DATASETS:
        path = source / spec.relative_path
        if path.is_file():
            found.append((spec, path))
        elif spec.required:
            missing_required.append(spec)
    return found, missing_required
