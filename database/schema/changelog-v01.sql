CREATE TABLE IF NOT EXISTS data.rec_srv (
    service_id INTEGER PRIMARY KEY,
    on_mondays BOOL NOT NULL,
    on_tuesdays BOOL NOT NULL,
    on_wednesdays BOOL NOT NULL,
    on_thursdays BOOL NOT NULL,
    on_fridays BOOL NOT NULL,
    on_saturdays BOOL NOT NULL,
    on_sundays BOOL NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS data.rec_srv_date (
    service_id INTEGER NOT NULL,
    the_date DATE NOT NULL,
    is_added BOOL NOT NULL
);

CREATE TABLE IF NOT EXISTS data.rec_srv_route (
    service_id INTEGER NOT NULL,
    line_id INTEGER NOT NULL,
    the_geom GEOMETRY
);

CREATE TABLE IF NOT EXISTS data.rec_srv_variant (
    service_id INTEGER NOT NULL,
    line_id INTEGER NOT NULL,
    variant_id INTEGER NOT NULL
);