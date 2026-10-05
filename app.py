import os
import re
import time
from datetime import date, datetime
from decimal import Decimal

import psycopg
from flask import Flask, jsonify, request, send_from_directory
from psycopg.rows import dict_row

app = Flask(__name__, static_folder="dist/assets", static_url_path="/assets")
DATASET_ROWS = 5_000_000

QUERY = """
SELECT DATE_TRUNC('WEEK', event_ts) AS week_start,
       line_id,
       SUM(units_produced) AS units_produced,
       SUM(units_defective) AS units_defective,
       100.0 * SUM(units_defective) / NULLIF(SUM(units_produced), 0) AS defect_rate_pct
FROM {table}
GROUP BY 1, 2
ORDER BY 1, 2
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


def serialize_value(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def query_postgres():
    with psycopg.connect(**postgres_config(), row_factory=dict_row) as conn:
        started = time.perf_counter()
        with conn.cursor() as cur:
            cur.execute(QUERY.format(table="production_events"))
            rows = cur.fetchall()
        elapsed_ms = (time.perf_counter() - started) * 1000
    return {
        "engine": "PostgreSQL",
        "elapsed_ms": elapsed_ms,
        "rows_scanned": DATASET_ROWS,
        "rows": [{key: serialize_value(value) for key, value in row.items()} for row in rows],
    }


def query_snowflake():
    if not snowflake_configured():
        raise RuntimeError("Snowflake ainda não está configurado. Preenche as variáveis SNOWFLAKE_* no ficheiro .env e reinicia a app.")
    table = os.getenv("SNOWFLAKE_TABLE", "PRODUCTION_EVENTS")
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_$]*", table):
        raise RuntimeError("SNOWFLAKE_TABLE deve ser um identificador simples, por exemplo PRODUCTION_EVENTS.")

    import snowflake.connector

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

    with snowflake.connector.connect(**config) as conn:
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
        "rows_scanned": DATASET_ROWS,
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
                cur.execute("SELECT 1")
                cur.fetchone()
        postgres_rows = DATASET_ROWS
        postgres_status = "online"
    except Exception:
        postgres_rows = 0
        postgres_status = "offline"
    return jsonify({
        "postgres": postgres_status,
        "postgres_rows": postgres_rows,
        "snowflake": "ready" if snowflake_configured() else "setup_required",
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
