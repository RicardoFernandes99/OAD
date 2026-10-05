# OAD — PostgreSQL vs Snowflake

Uma demo para comparar a execução da mesma análise industrial no PostgreSQL e no Snowflake. A interface tem três separadores: estado geral das ligações e dos dados, análise PostgreSQL e análise Snowflake.

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

## Fonte e atribuição

O CSV incluído é o [AI4I 2020 Predictive Maintenance Dataset](https://doi.org/10.24432/C5HS5C), do UCI Machine Learning Repository, licenciado sob CC BY 4.0. A UCI descreve-o como um conjunto sintético de 10 000 observações de sensores industriais com rótulos de falha. O dashboard compara a taxa de falhas por tipo de produto (L, M, H), condições médias de operação e contagem dos cinco modos de falha.

## Ficheiros principais

- `data/ai4i2020.csv`: observações de origem, com atribuição UCI.
- `db/init/001_schema.sql` e `002_seed.sql`: tabelas e importação/expansão PostgreSQL.
- `snowflake/001_setup.sql` e `002_expand.sql`: tabelas Snowflake e expansão após upload do CSV.
- `sql/benchmark.sql`: consulta analítica de referência.
- `frontend/`: dashboard React, Vite, Recharts e componentes Radix/CVA.

Para recriar a base PostgreSQL desde o início: `docker compose down -v` e depois `docker compose up --build`. **Isto apaga o volume local de demonstração.**

`.env` é ignorado pelo Git. Nunca publiques credenciais reais.

