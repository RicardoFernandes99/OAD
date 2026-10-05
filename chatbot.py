"""Cortex Analyst chat over the bounded AI4I semantic view."""
import json
import re
from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from threading import Lock
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import sqlglot
from sqlglot import exp
from sqlglot.optimizer.scope import Scope, traverse_scope

_setup_lock = Lock()
_ready = False
SCRIPT = Path(__file__).parent / "snowflake" / "004_chat_semantic_view.sql"
SAFE_FUNCTIONS = {
    "ABS", "AVG", "CASE", "CAST", "CEIL", "COALESCE", "COUNT", "DIV0",
    "FLOOR", "IF", "IFF", "MAX", "MEDIAN", "MIN", "NULLIF", "NULLIFZERO",
    "PERCENTILE_CONT", "ROUND", "STDDEV", "STDDEV_POP", "STDDEV_SAMP",
    "SUM", "TRY_CAST", "ZEROIFNULL", "ROW_NUMBER", "RANK", "DENSE_RANK",
}
SEMANTIC_FIELDS = {
    "product_type", "temperature_band_k", "tool_wear_range", "failed",
    "record_count", "machine_failures", "failure_rate_pct", "avg_air_temperature_k",
    "avg_process_temperature_k", "avg_rotational_speed_rpm", "avg_torque_nm",
    "avg_tool_wear_min", "tool_wear_failures", "heat_dissipation_failures",
    "power_failures", "overstrain_failures", "random_failures",
}


def _identifier(node):
    if not isinstance(node, exp.Identifier):
        return ""
    return node.this if node.args.get("quoted") else node.this.upper()


def _allowed_table(table, name, database, schema):
    return (isinstance(table, exp.Table) and _identifier(table.this) == name
            and (not table.db or _identifier(table.args.get("db")) == schema.upper())
            and (not table.catalog or _identifier(table.args.get("catalog")) == database.upper()))


def validate_history(question, history):
    if not isinstance(question, str) or not question.strip() or len(question) > 2000:
        raise ValueError("Enter a question of up to 2,000 characters.")
    if not isinstance(history, list) or len(history) > 10:
        raise ValueError("Conversation history is too long. Start a new chat.")
    messages = []
    for index, message in enumerate(history):
        expected = "user" if index % 2 == 0 else "analyst"
        if not isinstance(message, dict) or message.get("role") != expected:
            raise ValueError("Invalid conversation history.")
        content = message.get("content")
        if not isinstance(content, list) or not content:
            raise ValueError("Invalid conversation history.")
        for block in content:
            if not isinstance(block, dict) or block.get("type") not in {"text", "sql", "suggestions"}:
                raise ValueError("Invalid conversation history.")
            if expected == "user" and (block["type"] != "text" or not isinstance(block.get("text"), str)):
                raise ValueError("Invalid conversation history.")
        messages.append({"role": expected, "content": content})
    if len(messages) % 2:
        raise ValueError("Invalid conversation history.")
    messages.append({"role": "user", "content": [{"type": "text", "text": question.strip()}]})
    if len(json.dumps(messages)) > 32000:
        raise ValueError("Conversation history is too long. Start a new chat.")
    return messages


def safe_query(statement, database, schema):
    """Reject writes, other data sources and arbitrary callable functions."""
    try:
        statements = sqlglot.parse(statement, read="snowflake")
    except sqlglot.errors.ParseError as exc:
        raise ValueError("The generated query could not be read safely. Rephrase your question.") from exc
    if len(statements) != 1 or not isinstance(statements[0], (exp.Select, exp.SetOperation)):
        raise ValueError("Only a single read-only query is allowed.")
    tree = statements[0]
    forbidden = (exp.DDL, exp.DML, exp.Command, exp.Into)
    if any(isinstance(node, forbidden) for node in tree.walk()):
        raise ValueError("Only read-only queries are allowed.")
    sources = 0
    physical_tables = []
    for scope in traverse_scope(tree):
        for _, source in scope.selected_sources.values():
            if isinstance(source, Scope):
                continue
            physical_tables.append(source)
    for table in physical_tables:
        if not isinstance(table, exp.Table):
            raise ValueError("This query uses an unsupported data source.")
        if isinstance(table.this, exp.SemanticView):
            semantic = table.this
            if not _allowed_table(semantic.this, "AI4I_MAINTENANCE", database, schema):
                raise ValueError("Chat queries can only use the sample semantic view.")
            for field in semantic.args.get("metrics", []) + semantic.args.get("dimensions", []):
                if not isinstance(field, exp.Column) or field.name.lower() not in SEMANTIC_FIELDS:
                    raise ValueError("This query uses an unsupported semantic field.")
            sources += 1
            continue
        if not isinstance(table.this, exp.Identifier):
            raise ValueError("This query uses an unsupported data source.")
        if not _allowed_table(table, "AI4I_CHAT_SOURCE", database, schema):
            raise ValueError("Chat queries can only read the 2,500-record sample.")
        sources += 1
    if not sources:
        raise ValueError("The query must use the sample data.")
    for function in tree.find_all(exp.Func):
        name = function.name.upper() if isinstance(function, exp.Anonymous) else function.sql_name()
        if name not in SAFE_FUNCTIONS or isinstance(function.parent, exp.Dot):
            raise ValueError("This query uses an unsupported function. Rephrase your question.")
    limit = tree.args.get("limit")
    count = limit.expression if limit else None
    cap = min(int(count.this), 50) if isinstance(count, exp.Literal) and count.is_int else 50
    tree = tree.limit(max(0, cap))
    return tree.sql(dialect="snowflake", pretty=True, comments=False)


@lru_cache(maxsize=1)
def _semantic_expressions():
    """Read the demo's expressions from its checked-in semantic definition."""
    script = SCRIPT.read_text(encoding="utf-8")
    definitions = {}
    for section, following in (("DIMENSIONS", "METRICS"), ("METRICS", "COMMENT")):
        block = re.search(rf"\n{section} \((.*?)\n\)\n{following}", script, re.S)
        if not block:
            return {}
        fields = {}
        for entry in re.split(r",\s*\n\s*(?=readings\.)", block.group(1)):
            match = re.match(r"\s*readings\.(\w+)\s+AS\s+(.*)", entry, re.S)
            if not match:
                return {}
            expression = re.split(r"\s+(?:WITH SYNONYMS|COMMENT)\s*=", match.group(2), maxsplit=1)[0]
            fields[match.group(1).lower()] = sqlglot.parse_one(expression, read="snowflake")
        definitions[section.lower()] = fields
    return definitions


def equivalent_table_sql(statement, database, schema):
    """Display equivalent SQL for this demo's simple metrics and dimensions.

    This is a translation of our definition, not Snowflake's compiled query plan.
    Keep unsupported semantic constructs in their original form.
    """
    tree = sqlglot.parse_one(statement, read="snowflake")
    semantic_tables = [table for table in tree.find_all(exp.Table) if isinstance(table.this, exp.SemanticView)]
    if not semantic_tables:
        return None
    definitions = _semantic_expressions()
    if not definitions:
        return None
    for table in semantic_tables:
        semantic = table.this
        if any(value for key, value in semantic.args.items() if key not in {"this", "metrics", "dimensions"}):
            return None
        projections, groups = [], []
        for kind in ("metrics", "dimensions"):
            for field in semantic.args.get(kind, []):
                if not isinstance(field, exp.Column) or field.name.lower() not in definitions[kind]:
                    return None
                expression = definitions[kind][field.name.lower()].copy()
                projections.append(exp.alias_(expression, field.name, quoted=field.this.args.get("quoted", False)))
                if kind == "dimensions":
                    groups.append(expression.copy())
        raw = exp.select(*projections).from_(f"{database}.{schema}.AI4I_CHAT_SOURCE")
        if groups:
            raw = raw.group_by(*groups) if semantic.args.get("metrics") else raw.distinct()
        # Flatten the common SELECT * wrapper when it has no filters or joins.
        parent = table.parent
        outer = parent.parent if isinstance(parent, exp.From) else None
        if (not table.alias and isinstance(outer, exp.Select) and outer.expressions == [exp.Star()]
                and not any(outer.args.get(key) for key in ("where", "joins", "group", "having", "qualify", "distinct"))):
            outer.set("expressions", raw.expressions)
            outer.set("from_", raw.args["from_"])
            outer.set("group", raw.args.get("group"))
            outer.set("distinct", raw.args.get("distinct"))
        else:
            table.replace(exp.Subquery(this=raw, alias=table.args.get("alias")))
    return tree.sql(dialect="snowflake", pretty=True, comments=False)


def _value(value):
    if isinstance(value, Decimal):
        return float(value)
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def answer_question(question, history, config):
    global _ready
    messages = validate_history(question, history)
    database, schema = config["database"], config["schema"]
    if any(not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_$]*", value) for value in (database, schema)):
        raise ValueError("Chat requires simple database and schema identifiers.")
    semantic_view = f"{database}.{schema}.AI4I_MAINTENANCE"
    import snowflake.connector

    config = {**config, "session_parameters": {**config.get("session_parameters", {}),
              "STATEMENT_TIMEOUT_IN_SECONDS": 30, "QUERY_TAG": "oad_semantic_chat"}}
    with snowflake.connector.connect(**config) as conn:
        with _setup_lock:
            if not _ready:
                with conn.cursor() as cur:
                    for statement in SCRIPT.read_text(encoding="utf-8").split(";"):
                        if statement.strip():
                            cur.execute(statement)
                _ready = True
        body = json.dumps({"messages": messages, "semantic_view": semantic_view, "stream": False}).encode()
        req = Request(f"https://{conn.host}/api/v2/cortex/analyst/message", data=body, method="POST",
                      headers={"Authorization": f'Snowflake Token="{conn.rest.token}"', "Content-Type": "application/json"})
        try:
            with urlopen(req, timeout=90) as response:
                result = json.load(response)
        except HTTPError as exc:
            try:
                detail = json.loads(exc.read()).get("message", "")
            except (ValueError, TypeError):
                detail = ""
            raise RuntimeError(f"Cortex Analyst could not answer (HTTP {exc.code}). {detail[:600]}") from exc
        except URLError as exc:
            raise RuntimeError("Could not connect to Cortex Analyst. Try again.") from exc
        message = result.get("message", {})
        content = message.get("content", [])
        text = "\n\n".join(block.get("text", "") for block in content if block.get("type") == "text")
        text = re.sub(r"^This is our interpretation of your question:\s*", "", text)
        suggestions = [item for block in content if block.get("type") == "suggestions" for item in block.get("suggestions", [])]
        statements = [block.get("statement", "") for block in content if block.get("type") == "sql"]
        columns, rows, sql, table_sql = [], [], None, None
        if len(statements) > 1:
            raise ValueError("The answer contained multiple queries. Try a simpler question.")
        if statements:
            sql = safe_query(statements[0], database, schema)
            try:
                table_sql = equivalent_table_sql(sql, database, schema)
            except (sqlglot.errors.SqlglotError, ValueError):
                # Optional display translation must not prevent the native answer.
                table_sql = None
            with conn.cursor() as cur:
                cur.execute(sql)
                columns = [column[0] for column in cur.description]
                rows = [[_value(value) for value in row] for row in cur.fetchmany(50)]
        return {"text": text, "sql": sql, "table_sql": table_sql, "columns": columns, "rows": rows,
                "suggestions": suggestions, "analyst_message": {"role": "analyst", "content": content},
                "sample_rows": 2500, "semantic_view": semantic_view}
