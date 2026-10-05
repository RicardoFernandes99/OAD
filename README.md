# OAD — PostgreSQL vs Snowflake

A small Dockerized web app for comparing the same weekly production and defect-rate query on PostgreSQL and Snowflake. It is a classroom demonstration, not a general benchmark: timings depend on warehouse size, data volume, cache state, network, and configuration.

## Run PostgreSQL locally

1. Copy `.env.example` to `.env`.
2. Run `docker compose up --build`.
3. Open <http://localhost:8000>.

PostgreSQL starts in its own container. On its first start, the SQL files in `db/init/` create the schema and load `data/production_events.csv`. To reseed after changing the CSV, run `docker compose down -v` and then `docker compose up --build` (this deletes the local PostgreSQL volume).

## Add Snowflake

1. In `.env`, fill in the Snowflake connection fields. Credentials stay local and `.env` is ignored by Git.
2. Run `snowflake/001_setup.sql` in a Snowflake worksheet.
3. In Snowsight, use **Load Data** to load `data/production_events.csv` into `OAD_DEMO.PUBLIC.PRODUCTION_EVENTS`, matching the column order and types in the setup SQL. Choose comma delimiter, header row enabled, and timestamp format `YYYY-MM-DD HH24:MI:SS`.
4. Select Snowflake in the app.

The same CSV is used for both engines. The included `scripts/generate_mock_data.py` regenerates a deterministic 10,000-row fixture.

## What the app measures

It aggregates units produced and defect rate per week and production line. The timer covers query execution and fetching the result rows; it excludes opening the database connection. PostgreSQL and Snowflake run sequentially when comparing both. This makes the demonstration easy to explain, but it is not a controlled performance study. Snowflake timings also include the configured virtual warehouse behavior and may reflect cache effects.

## Files

- `db/init/001_schema.sql`: PostgreSQL schema migration.
- `db/init/002_seed.sql`: loads the CSV fixture into PostgreSQL on first initialization.
- `snowflake/001_setup.sql`: creates the Snowflake database, schema, and table.
- `sql/benchmark.sql`: reference aggregation query.
- `data/production_events.csv`: shared import fixture.

## Configuration

See `.env.example`. Use a dedicated Snowflake demo user and a small warehouse. Set auto-suspend in Snowflake to control idle compute costs. Do not commit `.env` or real credentials.

