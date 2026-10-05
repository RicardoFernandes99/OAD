-- Deterministic factory readings: each line contributes one reading every
-- 24 seconds over roughly one year. The same arithmetic is used by Snowflake.
INSERT INTO production_events (event_id, event_ts, line_id, units_produced, units_defective)
WITH generated AS (
    SELECT
        event_id,
        ((event_id - 1) % 4 + 1)::INTEGER AS line_number,
        ((event_id - 1) * 6 / 604800)::BIGINT AS week_number
    FROM GENERATE_SERIES(1::BIGINT, 5000000::BIGINT) AS source(event_id)
), scored AS (
    SELECT
        event_id,
        line_number,
        week_number,
        ROUND(
            (75 + line_number * 15 + MOD(event_id * 48271, 51))
            * (0.88 + MOD(week_number * 7, 25) / 100.0)
        )::INTEGER AS units_produced,
        CASE line_number
            WHEN 1 THEN 0.012
            WHEN 2 THEN 0.018
            WHEN 3 THEN 0.030
            ELSE 0.015
        END
          + MOD(event_id * 40699, 900) / 100000.0
          + MOD(week_number * 13 + line_number, 5) / 1000.0 AS defect_rate
    FROM generated
)
SELECT
    event_id,
    TIMESTAMP '2025-01-06 06:00:00' + (event_id - 1) * INTERVAL '6 seconds',
    'LINE-' || LPAD(line_number::TEXT, 2, '0'),
    units_produced,
    ROUND(units_produced * defect_rate)::INTEGER
FROM scored;

ANALYZE production_events;
