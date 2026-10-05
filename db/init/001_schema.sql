CREATE TABLE IF NOT EXISTS production_events (
    event_id BIGINT PRIMARY KEY,
    event_ts TIMESTAMP NOT NULL,
    line_id VARCHAR(16) NOT NULL,
    units_produced INTEGER NOT NULL CHECK (units_produced >= 0),
    units_defective INTEGER NOT NULL CHECK (units_defective >= 0)
);

CREATE INDEX IF NOT EXISTS idx_production_events_ts_line
    ON production_events (event_ts, line_id);

