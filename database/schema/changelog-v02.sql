DROP TABLE IF EXISTS data.rec_srv_route;
DROP TABLE IF EXISTS data.rec_srv_variant;

CREATE TABLE IF NOT EXISTS data.rec_path (
    id SERIAL PRIMARY KEY,
    hash VARCHAR(32) NOT NULL UNIQUE,
    the_geom GEOMETRY NOT NULL
);

CREATE TABLE IF NOT EXISTS data.rec_vnt (
    id SERIAL PRIMARY KEY,
    service_id INTEGER NOT NULL,
    line_id INTEGER NOT NULL,
    variant_id INTEGER NOT NULL,
    path_id INTEGER
);