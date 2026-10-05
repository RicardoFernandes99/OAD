COPY production_events (event_id, event_ts, line_id, units_produced, units_defective)
FROM '/seed/production_events.csv'
WITH (FORMAT csv, HEADER true);

