CREATE TABLE ai4i_source (
    udi INTEGER PRIMARY KEY,
    product_id VARCHAR(16) NOT NULL,
    product_type CHAR(1) NOT NULL,
    air_temperature_k DOUBLE PRECISION NOT NULL,
    process_temperature_k DOUBLE PRECISION NOT NULL,
    rotational_speed_rpm INTEGER NOT NULL,
    torque_nm DOUBLE PRECISION NOT NULL,
    tool_wear_min INTEGER NOT NULL,
    machine_failure SMALLINT NOT NULL,
    twf SMALLINT NOT NULL,
    hdf SMALLINT NOT NULL,
    pwf SMALLINT NOT NULL,
    osf SMALLINT NOT NULL,
    rnf SMALLINT NOT NULL
);

CREATE TABLE ai4i_readings (
    reading_id BIGINT PRIMARY KEY,
    repetition_number SMALLINT NOT NULL,
    udi INTEGER NOT NULL,
    product_id VARCHAR(16) NOT NULL,
    product_type CHAR(1) NOT NULL,
    air_temperature_k DOUBLE PRECISION NOT NULL,
    process_temperature_k DOUBLE PRECISION NOT NULL,
    rotational_speed_rpm INTEGER NOT NULL,
    torque_nm DOUBLE PRECISION NOT NULL,
    tool_wear_min INTEGER NOT NULL,
    machine_failure SMALLINT NOT NULL,
    twf SMALLINT NOT NULL,
    hdf SMALLINT NOT NULL,
    pwf SMALLINT NOT NULL,
    osf SMALLINT NOT NULL,
    rnf SMALLINT NOT NULL
);
