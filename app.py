import os
import re
import time

import psycopg
from flask import Flask, render_template, request
from psycopg.rows import dict_row

app = Flask(__name__)

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


def query_postgres():
    with psycopg.connect(**postgres_config(), row_factory=dict_row) as conn:
        started = time.perf_counter()
        with conn.cursor() as cur:
            cur.execute(QUERY.format(table="production_events"))
            rows = cur.fetchall()
        elapsed_ms = (time.perf_counter() - started) * 1000
    return {"engine": "PostgreSQL", "elapsed_ms": elapsed_ms, "rows": rows}


def query_snowflake():
    if not snowflake_configured():
        raise RuntimeError("Snowflake ainda não está configurado. Preenche as variáveis SNOWFLAKE_* no ficheiro .env e reinicia a app.")
    table = os.getenv("SNOWFLAKE_TABLE", "PRODUCTION_EVENTS")
    # Only allow simple identifiers before interpolating the configured table name.
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
        "session_parameters": {"WEEK_START": 1},
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
    return {"engine": "Snowflake", "elapsed_ms": elapsed_ms, "rows": rows}


def run_query(engine):
    try:
        if engine == "postgres":
            return query_postgres()
        if engine == "snowflake":
            return query_snowflake()
        raise RuntimeError("Fonte de dados desconhecida.")
    except Exception as exc:
        return {"engine": "PostgreSQL" if engine == "postgres" else "Snowflake", "error": str(exc)}


@app.get("/")
def index():
    return render_template("index.html", results=None, selection="both", snowflake_ready=snowflake_configured())


@app.post("/compare")
def compare():
    selection = request.form.get("source", "both")
    engines = ["postgres", "snowflake"] if selection == "both" else [selection]
    # Sequential execution makes the demonstration easier to interpret and avoids
    # measuring competition for resources created by this app.
    results = [run_query(engine) for engine in engines]
    return render_template("index.html", results=results, selection=selection, snowflake_ready=snowflake_configured())


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)

