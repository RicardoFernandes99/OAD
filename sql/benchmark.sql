SELECT product_type,
       COUNT(*) AS record_count,
       SUM(machine_failure) AS machine_failures,
       ROUND(100.0 * SUM(machine_failure) / NULLIF(COUNT(*), 0), 3) AS failure_rate_pct,
       ROUND(AVG(air_temperature_k)::NUMERIC, 2) AS avg_air_temperature_k,
       ROUND(AVG(process_temperature_k)::NUMERIC, 2) AS avg_process_temperature_k,
       ROUND(AVG(rotational_speed_rpm)::NUMERIC, 1) AS avg_rotational_speed_rpm,
       ROUND(AVG(torque_nm)::NUMERIC, 2) AS avg_torque_nm,
       ROUND(AVG(tool_wear_min)::NUMERIC, 1) AS avg_tool_wear_min,
       ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY tool_wear_min)::NUMERIC, 1) AS p95_tool_wear_min,
       SUM(twf) AS twf_failures,
       SUM(hdf) AS hdf_failures,
       SUM(pwf) AS pwf_failures,
       SUM(osf) AS osf_failures,
       SUM(rnf) AS rnf_failures
FROM ai4i_readings
GROUP BY product_type
ORDER BY CASE product_type WHEN 'L' THEN 1 WHEN 'M' THEN 2 WHEN 'H' THEN 3 ELSE 4 END;
