SELECT
    DATE_TRUNC('WEEK', event_ts) AS week_start,
    line_id,
    SUM(units_produced) AS units_produced,
    SUM(units_defective) AS units_defective,
    100.0 * SUM(units_defective) / NULLIF(SUM(units_produced), 0) AS defect_rate_pct
FROM production_events
GROUP BY 1, 2
ORDER BY 1, 2;
