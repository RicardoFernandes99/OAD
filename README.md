# OAD — PostgreSQL vs Snowflake

An industrial analytics comparison app. A React dashboard runs the same weekly production and defect-rate aggregation against a local PostgreSQL container or Snowflake.

## Run locally

1. Copy `.env.example` to `.env`.
2. Run `docker compose up --build`.
3. Open <http://localhost:8000>.

The first PostgreSQL start creates the schema and generates five million deterministic production readings. The React UI shows weekly production and defect-rate trends, engine status, query duration, and a paged result table. Snowflake can be left unconfigured while using PostgreSQL.

## Add Snowflake

1. Fill the `SNOWFLAKE_*` variables in `.env`.
2. Run `snowflake/001_setup.sql` in a Snowflake worksheet. It creates the table and generates the same five million rows using the matching deterministic formula in `db/init/002_seed.sql`.
3. Select Snowflake or both engines in the dashboard.

Use a small virtual warehouse and configure auto-suspend. Snowflake result caching is disabled for the demonstration query. The timer starts after connecting and includes query execution and result fetching. PostgreSQL and Snowflake run sequentially. This is a classroom demonstration, not a controlled benchmark: hardware, caching, warehouse size, network and concurrent work affect the results, and neither system is guaranteed to be faster.

## Dataset and SQL

- `db/init/001_schema.sql`: PostgreSQL schema migration.
- `db/init/002_seed.sql`: generates five million readings at first database initialization.
- `snowflake/001_setup.sql`: Snowflake schema, table and matching data generation.
- `sql/benchmark.sql`: reference aggregation query.

The generated data covers four factory lines over roughly one year. Each line contributes a reading every 24 seconds. Event IDs drive the same timestamps, line assignment, production counts and defect-rate variation in each database; line 03 has a higher defect rate to make quality comparisons visible.

If you change the seed SQL or row count, recreate the local demo database volume so init scripts run again: `docker compose down -v`, then `docker compose up --build`. This deletes the local PostgreSQL demo data.

## Configuration

See `.env.example`. `.env` is ignored by Git. Never commit real credentials.
