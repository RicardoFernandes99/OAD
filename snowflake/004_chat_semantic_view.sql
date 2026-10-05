-- Run with the same database and schema as AI4I_SOURCE selected.
-- Chat queries are limited to 2,500 original observations.
CREATE VIEW IF NOT EXISTS AI4I_CHAT_SOURCE AS
SELECT * FROM AI4I_SOURCE WHERE UDI <= 2500;

CREATE SEMANTIC VIEW IF NOT EXISTS AI4I_MAINTENANCE
TABLES (
    readings AS AI4I_CHAT_SOURCE PRIMARY KEY (UDI)
    COMMENT = 'AI4I industrial sensor sample: 2500 original synthetic observations, not the repeated benchmark data. No time column.'
)
FACTS (
    readings.air_temperature_k AS AIR_TEMPERATURE_K COMMENT = 'Air temperature in kelvin',
    readings.process_temperature_k AS PROCESS_TEMPERATURE_K COMMENT = 'Process temperature in kelvin',
    readings.rotational_speed_rpm AS ROTATIONAL_SPEED_RPM COMMENT = 'Rotational speed in revolutions per minute',
    readings.torque_nm AS TORQUE_NM COMMENT = 'Torque in newton metres',
    readings.tool_wear_min AS TOOL_WEAR_MIN COMMENT = 'Tool wear in minutes',
    readings.machine_failure AS MACHINE_FAILURE COMMENT = '1 for a recorded machine failure, otherwise 0'
)
DIMENSIONS (
    readings.product_type AS PRODUCT_TYPE WITH SYNONYMS = ('quality type')
        COMMENT = 'Product quality: L is low, M is medium, H is high',
    readings.temperature_band_k AS FLOOR(AIR_TEMPERATURE_K) COMMENT = 'Air temperature grouped into one-kelvin bands',
    readings.tool_wear_range AS CASE
        WHEN TOOL_WEAR_MIN < 50 THEN '0-49 min'
        WHEN TOOL_WEAR_MIN < 100 THEN '50-99 min'
        WHEN TOOL_WEAR_MIN < 150 THEN '100-149 min'
        WHEN TOOL_WEAR_MIN < 200 THEN '150-199 min'
        ELSE '200+ min' END,
    readings.failed AS MACHINE_FAILURE = 1 COMMENT = 'Whether a machine failure was recorded'
)
METRICS (
    readings.record_count AS COUNT(UDI) WITH SYNONYMS = ('observations', 'sample size'),
    readings.machine_failures AS SUM(MACHINE_FAILURE) WITH SYNONYMS = ('failure count'),
    readings.failure_rate_pct AS 100.0 * AVG(MACHINE_FAILURE) COMMENT = 'Recorded machine failures as a percentage of observations',
    readings.avg_air_temperature_k AS AVG(AIR_TEMPERATURE_K),
    readings.avg_process_temperature_k AS AVG(PROCESS_TEMPERATURE_K),
    readings.avg_rotational_speed_rpm AS AVG(ROTATIONAL_SPEED_RPM),
    readings.avg_torque_nm AS AVG(TORQUE_NM),
    readings.avg_tool_wear_min AS AVG(TOOL_WEAR_MIN),
    readings.tool_wear_failures AS SUM(TWF),
    readings.heat_dissipation_failures AS SUM(HDF),
    readings.power_failures AS SUM(PWF),
    readings.overstrain_failures AS SUM(OSF),
    readings.random_failures AS SUM(RNF)
)
COMMENT = 'Failure rates and sensor measurements for a 2500-row AI4I demonstration sample.'
AI_SQL_GENERATION 'Answer only questions supported by these observations. Query AI4I_CHAT_SOURCE using the metrics and dimensions defined here. Return at most 50 rows. Failure modes can overlap and must not be summed to calculate machine failures. There are no timestamps, costs, maintenance actions or causal evidence. Product types are quality categories. Temperature is measured in kelvin. Do not query AI4I_SOURCE or AI4I_READINGS.';
