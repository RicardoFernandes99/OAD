import os
import re
import time
from decimal import Decimal

import psycopg
from flask import Flask, jsonify, request, send_from_directory
from psycopg.rows import dict_row

app = Flask(__name__, static_folder="dist/assets", static_url_path="/assets")
DATASET_ROWS = 5_000_000

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

