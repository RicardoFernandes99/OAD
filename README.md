# OAD — PostgreSQL vs Snowflake

Uma demo para comparar a execução da mesma análise industrial no PostgreSQL e no Snowflake. A interface tem quatro separadores: estado geral das ligações e dos dados, análise PostgreSQL, análise Snowflake e Snowflake AI/ML.

## Executar localmente

1. Copia `.env.example` para `.env`.
2. Executa `docker compose up --build`.
3. Abre <http://localhost:8000>.

O primeiro arranque importa o CSV para PostgreSQL e cria `ai4i_readings`, com cinco milhões de linhas. São os 10 000 registos AI4I originais repetidos 500 vezes sem alterar os valores. Esta expansão aumenta o volume para uma demonstração de escala, mas não cria novas observações independentes. A página Geral mostra a contagem efetiva em cada base de dados.

## Ativar Snowflake

1. Preenche as variáveis `SNOWFLAKE_*` em `.env`; usa um warehouse pequeno com auto-suspend.
2. Executa `snowflake/001_setup.sql` numa worksheet. Cria a base, o schema e as tabelas de origem e destino.
3. Em Snowsight, carrega `data/ai4i2020.csv` para `OAD_DEMO.PUBLIC.AI4I_SOURCE`, mantendo os cabeçalhos e associando as colunas pela ordem do CSV.
4. Executa `snowflake/002_expand.sql`. Cria os cinco milhões de registos expandidos.
5. Reinicia a app com `docker compose up --build -d` e abre o separador Snowflake.

`SNOWFLAKE_TABLE` aponta por omissão para `AI4I_READINGS`. O benchmark desativa a cache de resultados do Snowflake. O cronómetro começa depois da ligação e mede execução e leitura dos resultados. As consultas decorrem uma de cada vez; os tempos dependem do hardware, cache, rede e warehouse e não garantem que uma plataforma seja sempre mais rápida.

## AI sample

The Snowflake AI/ML tab automatically runs a small failure-risk sample. It uses 2,000 original records for training and 500 separate records for evaluation. The five-million-row repeated table is excluded.

The training and prediction SQL is in `snowflake/003_failure_model_sample.sql`. After loading `AI4I_SOURCE`, select its database and schema in a Snowflake worksheet and run the script. It creates the training view and native `SNOWFLAKE.ML.CLASSIFICATION` model if they are missing, then predicts only the 500 evaluation records. Existing models are reused.

The app executes this same script through `/api/model/sample` and caches the returned metrics and predictions for the lifetime of the server process. Opening the tab, refreshing analytics, and reloading the page do not retrain an existing model. Restarting the server clears the result cache and scores the sample again.

## Semantic chatbot

The Snowflake AI/ML tab includes **Ask the data**, powered by Cortex Analyst. It uses `AI4I_MAINTENANCE`, a semantic view describing product quality, sensor readings, failure counts and rates. Its backing view contains only the first 2,500 original observations. The Snowflake tab contains the analytics charts and query results.

`snowflake/004_chat_semantic_view.sql` is the setup script. The app creates these views if missing on the first question, using the existing Snowflake connection and role. The role needs permission to create the views, read `AI4I_SOURCE`, and use Cortex Analyst. You can also run the script in a worksheet with the configured database and schema selected.

Questions and recent conversation history go to Snowflake's Cortex Analyst REST API. Analyst generates SQL; the app validates a single read-only query against `AI4I_CHAT_SOURCE` or native `SEMANTIC_VIEW(AI4I_MAINTENANCE ...)`, executes it in Snowflake, and displays a result table plus expandable SQL. Results are capped at 50 rows, with a 30-second SQL timeout. The chat supports follow-up questions and keeps the last five completed exchanges for context. It does not train another model.

The SQL panel shows only plain table SQL. For native semantic queries, it expands this demo's metric and dimension definitions from `004_chat_semantic_view.sql`. This is a readable equivalent, not Snowflake's compiled execution plan. The native semantic query is still executed internally, but is hidden in the interface. SQL previews are omitted for unsupported semantic constructs. Queries are formatted without generated request comments.

The sample is synthetic and has no timestamps. It supports comparisons and descriptive statistics, not time forecasts or causal conclusions. Failed requests remain visible with an error and can be retried.

## Fonte e atribuição

O CSV incluído é o [AI4I 2020 Predictive Maintenance Dataset](https://doi.org/10.24432/C5HS5C), do UCI Machine Learning Repository, licenciado sob CC BY 4.0. A UCI descreve-o como um conjunto sintético de 10 000 observações de sensores industriais com rótulos de falha. O dashboard compara a taxa de falhas por tipo de produto (L, M, H), condições médias de operação e contagem dos cinco modos de falha.

## Ficheiros principais

- `data/ai4i2020.csv`: observações de origem, com atribuição UCI.
- `db/init/001_schema.sql` e `002_seed.sql`: tabelas e importação/expansão PostgreSQL.
- `snowflake/001_setup.sql` e `002_expand.sql`: tabelas Snowflake e expansão após upload do CSV.
- `snowflake/003_failure_model_sample.sql`: model training and prediction on the small original-data sample.
- `snowflake/004_chat_semantic_view.sql`: sample view and semantic metrics for Cortex Analyst.
- `chatbot.py`: Cortex Analyst integration and read-only SQL validation.
- `sql/benchmark.sql`: consulta analítica de referência.
- `frontend/`: dashboard React, Vite, Recharts e componentes Radix/CVA.

Para recriar a base PostgreSQL desde o início: `docker compose down -v` e depois `docker compose up --build`. **Isto apaga o volume local de demonstração.**

`.env` é ignorado pelo Git. Nunca publiques credenciais reais.
