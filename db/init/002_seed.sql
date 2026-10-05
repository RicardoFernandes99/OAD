COPY ai4i_source
    (udi, product_id, product_type, air_temperature_k, process_temperature_k,
     rotational_speed_rpm, torque_nm, tool_wear_min, machine_failure,
     twf, hdf, pwf, osf, rnf)
FROM '/tmp/ai4i2020.csv'
WITH (FORMAT CSV, HEADER TRUE);

ANALYZE ai4i_source;

-- AI4I has 10,000 source rows. Repeat each source row 500 times to create
-- a five-million-row analytical workload. The source values are unchanged.
INSERT INTO ai4i_readings
    (reading_id, repetition_number, udi, product_id, product_type,
     air_temperature_k, process_temperature_k, rotational_speed_rpm,
     torque_nm, tool_wear_min, machine_failure, twf, hdf, pwf, osf, rnf)
SELECT
    ((repetition_number - 1) * 10000 + source.udi)::BIGINT,
    repetition_number,
    source.udi,
    source.product_id,
    source.product_type,
    source.air_temperature_k,
    source.process_temperature_k,
    source.rotational_speed_rpm,
    source.torque_nm,
    source.tool_wear_min,
    source.machine_failure,
    source.twf,
    source.hdf,
    source.pwf,
    source.osf,
    source.rnf
FROM GENERATE_SERIES(1, 500) AS repetitions(repetition_number)
CROSS JOIN ai4i_source AS source;

ANALYZE ai4i_readings;

