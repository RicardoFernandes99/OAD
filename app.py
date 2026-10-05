import os
import re
import time
from decimal import Decimal
from pathlib import Path
from threading import Lock

import psycopg
from flask import Flask, jsonify, request, send_from_directory
from psycopg.rows import dict_row

app = Flask(__name__, static_folder="dist/assets", static_url_path="/assets")
DATASET_ROWS = 5_000_000
MODEL_SAMPLE_SCRIPT = Path(__file__).parent / 'snowflake' / '003_failure_model_sample.sql'
_model_sample_result = None
_model_sample_lock = Lock()

QUERY = """
SELECT product_type,
       COUNT(*) AS record_count,
       SUM(machine_failure) AS machine_failures,
       ROUND(100.0 * SUM(machine_failure) / NULLIF(COUNT(*), 0), 3) AS failure_rate_pct,
       ROUND(AVG(air_temperature_k)::NUMERIC, 2) AS avg_air_temperature_k,
       ROUND(AVG(process_temperature_k)::NUMERIC, 2) AS avg_process_temperature_k,
       ROUND(AVG(rotational_speed_rpm)::NUMERIC, 1) AS avg_rotational_speed_rpm,
       ROUND(AVG(torque_nm)::NUMERIC, 2) AS avg_torque_nm,
       ROUND(AVG(tool_wear_min)::NUMERIC, 1) AS avg_tool_wear_min,
       ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY tool_wear_min)::NUMERIC, 1) AS p95_tool_wear_min,
       SUM(twf) AS twf_failures,
       SUM(hdf) AS hdf_failures,
       SUM(pwf) AS pwf_failures,
       SUM(osf) AS osf_failures,
       SUM(rnf) AS rnf_failures
FROM {table}
GROUP BY product_type
ORDER BY CASE product_type WHEN 'L' THEN 1 WHEN 'M' THEN 2 WHEN 'H' THEN 3 ELSE 4 END
"""

CHART_QUERIES = {
    "temperature": """
        SELECT FLOOR(air_temperature_k) AS temperature_band_k,
               COUNT(*) AS record_count,
               SUM(machine_failure) AS machine_failures,
               ROUND(100.0 * SUM(machine_failure) / NULLIF(COUNT(*), 0), 3) AS failure_rate_pct
        FROM {table}
        GROUP BY 1
        ORDER BY 1
    """,
    "tool_wear": """
        SELECT CASE
                   WHEN tool_wear_min < 50 THEN '0–49 min'
                   WHEN tool_wear_min < 100 THEN '50–99 min'
                   WHEN tool_wear_min < 150 THEN '100–149 min'
                   WHEN tool_wear_min < 200 THEN '150–199 min'
                   ELSE '200+ min'
               END AS tool_wear_range,
               COUNT(*) AS record_count,
               SUM(machine_failure) AS machine_failures,
               ROUND(100.0 * SUM(machine_failure) / NULLIF(COUNT(*), 0), 3) AS failure_rate_pct
        FROM {table}
        GROUP BY 1
        ORDER BY MIN(tool_wear_min)
    """,
}


def postgres_config():
    return {
        "host": os.getenv("POSTGRES_HOST", "localhost"),
        "port": int(os.getenv("POSTGRES_PORT", "5432")),
        "dbname": os.getenv("POSTGRES_DB", "oad_demo"),
        "user": os.getenv("POSTGRES_USER", "oad"),
        "password": os.getenv("POSTGRES_PASSWORD", "oad_local_only"),
        "connect_timeout": 5,
    }


def snowflake_configured():
    return all(os.getenv(key) for key in (
        "SNOWFLAKE_ACCOUNT", "SNOWFLAKE_USER", "SNOWFLAKE_PASSWORD",
        "SNOWFLAKE_WAREHOUSE", "SNOWFLAKE_DATABASE", "SNOWFLAKE_SCHEMA",
    ))


def snowflake_connection_config():
    config = {
        "account": os.environ["SNOWFLAKE_ACCOUNT"],
        "user": os.environ["SNOWFLAKE_USER"],
        "password": os.environ["SNOWFLAKE_PASSWORD"],
        "warehouse": os.environ["SNOWFLAKE_WAREHOUSE"],
        "database": os.environ["SNOWFLAKE_DATABASE"],
        "schema": os.environ["SNOWFLAKE_SCHEMA"],
        "session_parameters": {"WEEK_START": 1, "USE_CACHED_RESULT": False},
    }
    if os.getenv("SNOWFLAKE_ROLE"):
        config["role"] = os.environ["SNOWFLAKE_ROLE"]
    return config


def serialize_value(value):
    if isinstance(value, Decimal):
        return float(value)
    return value


def query_postgres():
    with psycopg.connect(**postgres_config(), row_factory=dict_row) as conn:
        started = time.perf_counter()
        with conn.cursor() as cur:
            cur.execute(QUERY.format(table="ai4i_readings"))
            rows = cur.fetchall()
        elapsed_ms = (time.perf_counter() - started) * 1000
    return {
        "engine": "PostgreSQL",
        "elapsed_ms": elapsed_ms,
        "rows_scanned": sum(int(row["record_count"]) for row in rows),
        "rows": [{key: serialize_value(value) for key, value in row.items()} for row in rows],
    }


def query_snowflake():
    if not snowflake_configured():
        raise RuntimeError("Snowflake ainda não está configurado. Preenche as variáveis SNOWFLAKE_* no ficheiro .env e reinicia a app.")
    table = os.getenv("SNOWFLAKE_TABLE", "AI4I_READINGS")
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_$]*", table):
        raise RuntimeError("SNOWFLAKE_TABLE deve ser um identificador simples, por exemplo AI4I_READINGS.")

    import snowflake.connector

    with snowflake.connector.connect(**snowflake_connection_config()) as conn:
        started = time.perf_counter()
        cur = conn.cursor()
        try:
            cur.execute(QUERY.format(table=table))
            columns = [column[0].lower() for column in cur.description]
            rows = [dict(zip(columns, row)) for row in cur.fetchall()]
        finally:
            cur.close()
        elapsed_ms = (time.perf_counter() - started) * 1000
    return {
        "engine": "Snowflake",
        "elapsed_ms": elapsed_ms,
        "rows_scanned": sum(int(row["record_count"]) for row in rows),
        "rows": [{key: serialize_value(value) for key, value in row.items()} for row in rows],
    }


def query_chart_data(engine):
    results = {}
    if engine == "postgres":
        with psycopg.connect(**postgres_config(), row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                for chart, query in CHART_QUERIES.items():
                    cur.execute(query.format(table="ai4i_readings"))
                    results[chart] = [
                        {key: serialize_value(value) for key, value in row.items()}
                        for row in cur.fetchall()
                    ]
        return results

    if not snowflake_configured():
        raise RuntimeError("Snowflake is not configured.")
    table = os.getenv("SNOWFLAKE_TABLE", "AI4I_READINGS")
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_$]*", table):
        raise RuntimeError("SNOWFLAKE_TABLE must be a simple identifier.")

    import snowflake.connector

    with snowflake.connector.connect(**snowflake_connection_config()) as conn:
        cur = conn.cursor()
        try:
            for chart, query in CHART_QUERIES.items():
                cur.execute(query.format(table=table))
                columns = [column[0].lower() for column in cur.description]
                results[chart] = [
                    {key: serialize_value(value) for key, value in zip(columns, row)}
                    for row in cur.fetchall()
                ]
        finally:
            cur.close()
    return results


def execute_failure_model_sample():
    if not snowflake_configured():
        raise RuntimeError("Snowflake is not configured.")

    import snowflake.connector

    with snowflake.connector.connect(**snowflake_connection_config()) as conn:
        cur = conn.cursor()
        try:
            # The checked-in script is the shared source for setup and inference.
            # It contains three statements, with no semicolons inside literals.
            for statement in MODEL_SAMPLE_SCRIPT.read_text(encoding='utf-8').split(';'):
                if statement.strip():
                    cur.execute(statement)
            columns = [column[0].lower() for column in cur.description]
            scored_groups = [
                {key: serialize_value(value) for key, value in zip(columns, row)}
                for row in cur.fetchall()
            ]
        finally:
            cur.close()

    test_rows = sum(int(row["test_rows"]) for row in scored_groups)
    actual_failures = sum(int(row["actual_failures"]) for row in scored_groups)
    predicted_positives = sum(int(row["predicted_positives"]) for row in scored_groups)
    true_positives = sum(int(row["true_positives"]) for row in scored_groups)
    correct_predictions = sum(int(row["correct_predictions"]) for row in scored_groups)
    precision = true_positives / predicted_positives if predicted_positives else 0
    recall = true_positives / actual_failures if actual_failures else 0
    f1_score = 2 * precision * recall / (precision + recall) if precision + recall else 0
    return {
        "model": "AI4I_FAILURE_MODEL",
        "training_rows": 2000,
        "test_rows": test_rows,
        "metrics": {
            "precision_pct": precision * 100,
            "recall_pct": recall * 100,
            "f1_pct": f1_score * 100,
            "accuracy_pct": correct_predictions / test_rows * 100 if test_rows else 0,
        },
        "predictions": [
            {
                "product_type": row["product_type"],
                "test_rows": row["test_rows"],
                "actual_failures": row["actual_failures"],
                "predicted_failures": row["predicted_failures"],
                "avg_predicted_risk_pct": row["avg_predicted_risk_pct"],
            }
            for row in scored_groups
        ],
    }


def get_failure_model_sample():
    global _model_sample_result
    # Serialize the first run so concurrent browser loads share the same sample.
    with _model_sample_lock:
        if _model_sample_result is None:
            _model_sample_result = execute_failure_model_sample()
        return _model_sample_result


def run_engine(engine):
    try:
        result = query_postgres() if engine == "postgres" else query_snowflake()
        result["status"] = "ok"
        return result
    except Exception as exc:
        return {"engine": "PostgreSQL" if engine == "postgres" else "Snowflake", "status": "error", "error": str(exc)}


@app.get("/api/status")
def status():
    try:
        config = postgres_config()
        config["connect_timeout"] = 3
        with psycopg.connect(**config) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM ai4i_readings")
                postgres_rows = cur.fetchone()[0]
        postgres_status = "online"
    except Exception:
        postgres_rows = 0
        postgres_status = "offline"
    snowflake_rows = None
    snowflake_status = "setup_required"
    if snowflake_configured():
        table = os.getenv("SNOWFLAKE_TABLE", "AI4I_READINGS")
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_$]*", table):
            try:
                import snowflake.connector
                with snowflake.connector.connect(**snowflake_connection_config()) as conn:
                    cur = conn.cursor()
                    try:
                        cur.execute(f"SELECT COUNT(*) FROM {table}")
                        snowflake_rows = cur.fetchone()[0]
                        snowflake_status = "ready"
                    finally:
                        cur.close()
            except Exception:
                snowflake_status = "offline"
        else:
            snowflake_status = "offline"
    return jsonify({
        "postgres": postgres_status,
        "postgres_rows": postgres_rows,
        "snowflake": snowflake_status,
        "snowflake_rows": snowflake_rows,
        "dataset_rows": DATASET_ROWS,
    })


@app.post("/api/benchmark")
def benchmark():
    payload = request.get_json(silent=True) or {}
    source = payload.get("source", "postgres")
    if source not in {"postgres", "snowflake", "both"}:
        return jsonify({"error": "Fonte inválida. Escolhe PostgreSQL, Snowflake ou ambos."}), 400

    engines = ["postgres", "snowflake"] if source == "both" else [source]
    # Keep execution sequential: concurrent scans would make the comparison noisy.
    results = [run_engine(engine) for engine in engines]
    return jsonify({"source": source, "dataset_rows": DATASET_ROWS, "results": results})


@app.post("/api/charts")
def charts():
    payload = request.get_json(silent=True) or {}
    source = payload.get("source", "postgres")
    if source not in {"postgres", "snowflake"}:
        return jsonify({"error": "Choose PostgreSQL or Snowflake."}), 400
    try:
        return jsonify({"source": source, "results": query_chart_data(source)})
    except Exception as exc:
        return jsonify({"source": source, "error": str(exc)}), 500


@app.post("/api/model/sample")
def model_sample():
    payload = request.get_json(silent=True) or {}
    if payload.get("source") != "snowflake":
        return jsonify({"error": "The model sample runs in Snowflake."}), 400
    try:
        return jsonify(get_failure_model_sample())
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.post("/api/chat")
def chat():
    from chatbot import answer_question, validate_history

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Enter a question."}), 400
    question, history = payload.get("question"), payload.get("history", [])
    try:
        validate_history(question, history)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if not snowflake_configured():
        return jsonify({"error": "Connect Snowflake to ask questions about the sample."}), 503
    try:
        return jsonify(answer_question(question, history, snowflake_connection_config()))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 422
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


@app.get("/")
def index():
    return send_from_directory("dist", "index.html")


@app.get("/<path:path>")
def spa_fallback(path):
    if path.startswith("api/") or path.startswith("assets/"):
        return jsonify({"error": "Não encontrado."}), 404
    return send_from_directory("dist", "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
