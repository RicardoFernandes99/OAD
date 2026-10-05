# Run OAD

## Requirements

- Docker with Docker Compose.
- A Snowflake account and warehouse for Snowflake analytics, AI/ML and chat (optional).

## Start the app

1. Clone the repository and open its folder:

   ```sh
   git clone https://github.com/RicardoFernandes99/OAD.git
   cd OAD
   ```

2. Copy `.env.example` to `.env`.

   On Windows PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

   On macOS or Linux:

   ```sh
   cp .env.example .env
   ```

3. Start the app:

   ```sh
   docker compose up --build -d
   ```

4. Open [http://localhost:8000](http://localhost:8000). The first startup loads the PostgreSQL data; allow it to finish before running an analysis.

## Enable Snowflake

1. Fill in `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USER`, `SNOWFLAKE_PASSWORD` and `SNOWFLAKE_WAREHOUSE` in `.env`. Set `SNOWFLAKE_ROLE` if required. Keep the default database, schema and table for the supplied setup scripts.
2. Run `snowflake/001_setup.sql` in a Snowflake worksheet.
3. In Snowsight, upload `data/ai4i2020.csv` into `OAD_DEMO.PUBLIC.AI4I_SOURCE`. Skip the CSV header and map the columns in file order.
4. Run `snowflake/002_expand.sql` once to populate the analytics table.
5. Recreate the app container to load the environment settings:

   ```sh
   docker compose up --build -d web
   ```

6. Open **Snowflake** to run analytics, or **Snowflake AI/ML** to load the model sample and use the chat. The app creates the model and chat views automatically when needed. The configured role must be able to read the source table, create views and ML models, and use Cortex Analyst.

## Stop the app

```sh
docker compose down
```

The PostgreSQL data is retained for the next startup.

## View logs

```sh
docker compose logs -f web postgres
```
