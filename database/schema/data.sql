--
-- PostgreSQL database dump
--

-- Dumped from database version 9.1.7
-- Dumped by pg_dump version 9.1.7
-- Started on 2014-03-09 22:38:21 CET

SET statement_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;

--
-- TOC entry 7 (class 2615 OID 591656)
-- Name: data; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA data;


SET search_path = data, public, pg_catalog;

--
-- TOC entry 989 (class 1255 OID 591657)
-- Dependencies: 7 1412
-- Name: data_bigint_2_degree(bigint); Type: FUNCTION; Schema: data; Owner: -
--

CREATE FUNCTION data_bigint_2_degree(data_bigint bigint) RETURNS double precision
    LANGUAGE plpgsql IMMUTABLE COST 10
    AS $$
        BEGIN
		RETURN 
		data_bigint/10000000::bigint + --degrees
		((data_bigint % 10000000::bigint) /  100000) * (1::float / 60::float) +  -- minutes
		((data_bigint % 100000::bigint) /  1000)  * (1::float / 3600::float) + -- seconds
		(data_bigint % 1000::bigint)  * (1::float / 3600::float/1000::float); -- fraction of seconds
        END;
$$;


--
-- TOC entry 3809 (class 0 OID 0)
-- Dependencies: 989
-- Name: FUNCTION data_bigint_2_degree(data_bigint bigint); Type: COMMENT; Schema: data; Owner: -
--

COMMENT ON FUNCTION data_bigint_2_degree(data_bigint bigint) IS 'Convert bigints formatted as DDMMSSNNN into decimal degrees
Beware, works only for positive arguments';


--
-- TOC entry 993 (class 1255 OID 986654)
-- Dependencies: 1412 7
-- Name: data_extrapolate_frt_position(bigint); Type: FUNCTION; Schema: data; Owner: -
--

CREATE FUNCTION data_extrapolate_frt_position(teq_arg bigint) RETURNS INTEGER
    LANGUAGE plpgsql
    AS $$
DECLARE
    pos_record RECORD;
    elapsed_time FLOAT;
    var_sel_fzt INTEGER;
    rec_sel_fzt RECORD;
    cnt_lfd INTEGER DEFAULT 0;
    underrelaxation DOUBLE PRECISION DEFAULT 0.8;
    time_to_complete_travel DOUBLE PRECISION DEFAULT 0;
    extrapolated_completion DOUBLE PRECISION DEFAULT 0;
    extrapolated_linear_ref_var DOUBLE PRECISION DEFAULT 0;
    extrapolated_position_var geometry;
    max_li_lfd_nr INTEGER;
    distance_to_end DOUBLE PRECISION;
    frt RECORD;
    complete_travel_time INTEGER;
BEGIN

    -- Get all known data
    SELECT vehicle_positions.*,
        ST_X(vehicle_positions.the_geom) x_act,
        ST_Y(vehicle_positions.the_geom) y_act,
        lid_verlauf.ort_nr ort_nr,
        next_verlauf.ort_nr next_ort_nr,
        ort_edges.id ort_edge_id,
        ST_X(vehicle_positions.the_geom) - ST_X(ST_LineInterpolatePoint(ort_edges.the_geom, interpolation_linear_ref)) dx,
        ST_Y(vehicle_positions.the_geom) - ST_Y(ST_LineInterpolatePoint(ort_edges.the_geom, interpolation_linear_ref)) dy
    INTO pos_record
    FROM data.vehicle_positions
    LEFT JOIN data.lid_verlauf
        ON lid_verlauf.line=vehicle_positions.line
        AND lid_verlauf.variant = vehicle_positions.variant
        AND lid_verlauf.li_lfd_nr = vehicle_positions.li_lfd_nr
    LEFT JOIN data.lid_verlauf AS next_verlauf
        ON next_verlauf.line=lid_verlauf.line
        AND next_verlauf.variant=lid_verlauf.variant
        AND next_verlauf.li_lfd_nr = lid_verlauf.li_lfd_nr + 1
    LEFT JOIN data.ort_edges
        ON lid_verlauf.ort_nr=ort_edges.start_ort_nr
        AND lid_verlauf.onr_typ_nr=ort_edges.start_onr_typ_nr
        AND next_verlauf.ort_nr=ort_edges.end_ort_nr
        AND next_verlauf.onr_typ_nr=ort_edges.end_onr_typ_nr
    WHERE trip=teq_arg;

    -- Calc elapsed time
    elapsed_time = EXTRACT('epoch' FROM current_timestamp - pos_record.gps_date);

    SELECT trip, departure INTO frt
    FROM data.rec_frt
    WHERE teq = teq_arg;
  
    IF EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - CURRENT_DATE)) < frt.departure - 10
       AND pos_record.delay_sec = 0 THEN

        -- Bus is waiting at departure
       UPDATE data.vehicle_positions
       SET status = 'w'
       WHERE trip=teq_arg;
       RETURN 0;
    END IF;


    SELECT MAX(travel_time) INTO complete_travel_time
    FROM data.travel_times
    WHERE trip=frt.trip;

    IF EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - CURRENT_DATE)) > frt.departure +
                                                                complete_travel_time +
                                                                pos_record.delay_sec + 120
       THEN
       RAISE DEBUG 'now: %, start: %, travel_time: %, delay: %, sum: %',
         EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - CURRENT_DATE)),
           frt.departure,
           complete_travel_time,
           pos_record.delay_sec,
           frt.departure + complete_travel_time + pos_record.delay_sec + 120;

        -- Bus is waiting at departure
       UPDATE data.vehicle_positions
       SET status = 'f'
       WHERE trip = teq_arg;
       RETURN 0;
    END IF;

    RAISE DEBUG 'x_act: %, y_act: %, ort_nr: %, next_ort_nr: %, ort_edge_id: %, dx: %, dy: %',
    pos_record.x_act, pos_record.y_act,
    pos_record.ort_nr, pos_record.next_ort_nr, pos_record.ort_edge_id,
    pos_record.dx, pos_record.dy;
    
    IF pos_record.trip IS NULL THEN
        RAISE WARNING 'No record found with trip: %', pos_record.trip;
        UPDATE data.vehicle_positions
        SET extrapolation_linear_ref=NULL,
            extrapolation_geom=NULL,
            status='e'
        WHERE trip=teq_arg;
        RETURN NULL;
    END IF;
    
    SELECT COUNT(*) INTO cnt_lfd
    FROM data.rec_frt
    INNER JOIN data.lid_verlauf
        ON lid_verlauf.line=rec_frt.line
        AND lid_verlauf.variant=rec_frt.variant
    WHERE teq=teq_arg;
    
    IF cnt_lfd=0 THEN
        RAISE WARNING 'teq % has no entries in lid_verlauf', pos_record.trip;
        UPDATE data.vehicle_positions
        SET extrapolation_linear_ref=NULL,
            extrapolation_geom=NULL,
            status='e'
        WHERE trip=teq_arg;
        RETURN NULL;
    END IF;

    -- Get travel time
    SELECT verlauf_start.li_lfd_nr lfd_start,
        verlauf_end.li_lfd_nr lfd_end,
        ort_start.ort_nr ort_start,
        ort_end.ort_nr ort_end,
        sel_fzt,
        ort_end.ort_nr ort_end
        INTO rec_sel_fzt
    FROM data.lid_verlauf verlauf_start
    LEFT JOIN data.lid_verlauf verlauf_end
        ON verlauf_start.line=verlauf_end.line
        AND verlauf_start.variant=verlauf_end.variant
        AND verlauf_start.li_lfd_nr + 1 = verlauf_end.li_lfd_nr
    LEFT JOIN data.rec_ort ort_start
        ON verlauf_start.onr_typ_nr=ort_start.onr_typ_nr
        AND verlauf_start.ort_nr=ort_start.ort_nr
    LEFT JOIN data.rec_ort ort_end
        ON verlauf_end.onr_typ_nr=ort_end.onr_typ_nr
        AND verlauf_end.ort_nr=ort_end.ort_nr
    LEFT JOIN data.sel_fzt_feld
        ON ort_start.onr_typ_nr=sel_fzt_feld.onr_typ_nr
        AND ort_start.ort_nr=sel_fzt_feld.ort_nr
        AND ort_end.onr_typ_nr=sel_fzt_feld.sel_ziel_typ
        AND ort_end.ort_nr=sel_fzt_feld.sel_ziel
    WHERE verlauf_start.line=pos_record.line
        AND verlauf_start.variant=pos_record.variant
        AND verlauf_start.li_lfd_nr=pos_record.li_lfd_nr;
        
    RAISE DEBUG 'lfd_start: %, lfd_end: % s, ort_start %, ort_end: %, sel_fzt: %', rec_sel_fzt.lfd_start, rec_sel_fzt.lfd_end, rec_sel_fzt.ort_start, rec_sel_fzt.ort_end, rec_sel_fzt.sel_fzt;

    IF rec_sel_fzt.sel_fzt IS NULL THEN
        RAISE WARNING 'Could not find any travel time information in data.sel_fzt_feld for teq=%', pos_record.trip;
        UPDATE data.vehicle_positions
        SET extrapolation_linear_ref=NULL,
            extrapolation_geom=NULL,
            status='e'
        WHERE trip=teq_arg;
        RETURN NULL;
    END IF;
        
    
    IF elapsed_time <= 0 THEN
        IF pos_record.status <> 'e' THEN
            UPDATE data.vehicle_positions
            SET status='e'
            WHERE trip=teq_arg;
        END IF;
        RETURN 0;
    END IF;

    -- Extrapolate only, if the bus has not already arrived
    -- at the end position
    IF pos_record.interpolation_linear_ref >= 1 THEN
        IF pos_record.status <> 'e' THEN
            UPDATE data.vehicle_positions
            SET status='e'
            WHERE trip=teq_arg;
        END IF;
        RETURN 0;
    END IF;

    -- estimated plan time to complete the travel
    time_to_complete_travel = (1 - pos_record.interpolation_linear_ref) * rec_sel_fzt.sel_fzt;
    RAISE DEBUG 'elapsed_time: %, time needed to complete travel: %', elapsed_time, time_to_complete_travel;
    if time_to_complete_travel > 0 THEN
        extrapolated_completion = underrelaxation * elapsed_time/time_to_complete_travel;
    ELSE
        extrapolated_completion = 1;
    END IF;

    extrapolated_linear_ref_var = LEAST(1, pos_record.interpolation_linear_ref +
                                         (1 - pos_record.interpolation_linear_ref) * extrapolated_completion);

    RAISE DEBUG 'completed: %, interpolation_linear_ref: %, extrapolation_linear_ref: %, weighting factor: %, weighted dx: %, weighted dy: %',
            extrapolated_completion,
            pos_record.interpolation_linear_ref,
            extrapolated_linear_ref_var, (1 - extrapolated_completion), 
            (1 - extrapolated_completion) * pos_record.dx,
            (1 - extrapolated_completion) * pos_record.dy;

    SELECT ST_LineInterpolatePoint(the_geom, extrapolated_linear_ref_var) INTO extrapolated_position_var
    FROM data.lid_verlauf
    WHERE lid_verlauf.line=pos_record.line
        AND lid_verlauf.variant=pos_record.variant
        AND lid_verlauf.li_lfd_nr = pos_record.li_lfd_nr;


    RAISE DEBUG 'extra_pos: %, distance to last extra_pos is % and last GPS value is %',
                ST_AsText(extrapolated_position_var),
               ST_Distance(extrapolated_position_var, pos_record.extrapolation_geom),
               ST_Distance(extrapolated_position_var, pos_record.the_geom);

     -- write to database
    UPDATE data.vehicle_positions
    SET extrapolation_linear_ref=extrapolated_linear_ref_var,
        extrapolation_geom=extrapolated_position_var,
        status='r'
    WHERE trip=teq_arg;

    RETURN 1;
END;
$$;


--
-- TOC entry 994 (class 1255 OID 992818)
-- Dependencies: 7 1412
-- Name: data_extrapolate_positions(); Type: FUNCTION; Schema: data; Owner: -
--

CREATE FUNCTION data_extrapolate_positions() RETURNS INTEGER
    LANGUAGE plpgsql
    AS $$
    --
    -- Create a subblock
    --
    DECLARE
        frt_cur CURSOR FOR
            SELECT vehicle_positions.trip
            FROM data.vehicle_positions
            LEFT JOIN data.rec_frt ON vehicle_positions.trip=rec_frt.teq
            WHERE rec_frt.trip IS NULL   -- not found in rec_frt
                OR departure < EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - CURRENT_DATE)) -- should have already started
                OR delay_sec < 0   -- anticipated start 
            ORDER BY trip;
        num_frts INTEGER;
        num_insert INTEGER DEFAULT 0;
        num_extrapolations INTEGER DEFAULT 0;
        
    BEGIN
    num_frts := 0;

    DELETE FROM data.vehicle_positions
        WHERE gps_date < NOW() - INTERVAL '2 minute';

    FOR recordvar IN frt_cur LOOP
        SELECT data.data_extrapolate_frt_position(recordvar.trip) INTO num_insert;
        num_frts := num_frts+1;
        IF num_insert IS NOT NULL THEN
            num_extrapolations = num_extrapolations + 1;
        END IF;
    END LOOP;

    -- RAISE INFO 'inserted % records processed, extrapolated % new positions',
    --         num_frts, num_extrapolations;
    
    RETURN num_extrapolations;
END;
$$;


--
-- TOC entry 992 (class 1255 OID 771507)
-- Dependencies: 1412 7
-- Name: data_fill_frt_travel_times(bigint); Type: FUNCTION; Schema: data; Owner: -
--

CREATE FUNCTION data_fill_frt_travel_times(trip_arg bigint) RETURNS INTEGER
    LANGUAGE plpgsql
    AS $$
    DECLARE
        this_line INTEGER;
        this_variant SMALLINT;
        this_trip_time_group INTEGER;
        
        outer_lfd_cursor refcursor;
        from_to_stop record;
        from_stop INTEGER;
        to_stop INTEGER;
        
        num_inserts INTEGER;

        departure_lfd INTEGER;
        frt_max_lfd INTEGER;
        frt_cnt INTEGER;
        
        travel_time_seconds INTEGER;
        
        inner_lfd_cursor CURSOR (this_line INTEGER, this_variant SMALLINT, this_trip_time_group INTEGER, from_stop INTEGER, to_stop INTEGER) FOR
            SELECT SUM(COALESCE(sel_fzt))
            FROM data.lid_verlauf lid_verlauf_start
            INNER JOIN data.lid_verlauf lid_verlauf_end
                ON lid_verlauf_end.line=this_line
                AND lid_verlauf_end.variant=this_variant
                AND lid_verlauf_start.li_lfd_nr+1=lid_verlauf_end.li_lfd_nr
                AND lid_verlauf_end.li_lfd_nr <= to_stop
            LEFT JOIN data.sel_fzt_feld sff
                ON lid_verlauf_start.ort_nr=sff.ort_nr
                AND lid_verlauf_start.onr_typ_nr=sff.onr_typ_nr
                AND lid_verlauf_end.ort_nr=sff.sel_ziel
                AND lid_verlauf_end.onr_typ_nr=sff.sel_ziel_typ
                AND sff.trip_time_group=this_trip_time_group
            WHERE lid_verlauf_start.line=this_line
                AND lid_verlauf_start.variant=this_variant
                AND lid_verlauf_start.li_lfd_nr >= from_stop;
        
    BEGIN
    num_inserts := 0;
    
    DELETE FROM data.travel_times WHERE trip=trip_arg;

    SELECT COUNT(*), MAX(li_lfd_nr) INTO frt_cnt, frt_max_lfd
    FROM data.rec_frt
    LEFT JOIN data.lid_verlauf
        ON rec_frt.line=lid_verlauf.line
        AND rec_frt.variant=lid_verlauf.variant
    WHERE
        trip=trip_arg;

    IF frt_cnt = 0 THEN
        RAISE NOTICE 'trip % has no lid_verlauf', trip_arg;
        RETURN 0;
    END IF;
    
    -- get line attributes
    SELECT rec_lid.line, rec_lid.variant, rec_frt.trip_time_group
        INTO this_line, this_variant, this_trip_time_group
    FROM data.rec_frt
    INNER JOIN data.rec_lid
        ON rec_lid.line=rec_frt.line
        AND rec_lid.variant=rec_frt.variant
    WHERE rec_frt.trip=trip_arg;

    departure_lfd = 1;

    OPEN outer_lfd_cursor FOR
        SELECT
            lvsp.li_lfd_nr AS start_lfd,
            lvep.li_lfd_nr AS stop_lfd
        FROM data.rec_frt
        INNER JOIN data.rec_lid
            ON rec_lid.line=rec_frt.line
            AND rec_lid.variant=rec_frt.variant
        INNER JOIN data.lid_verlauf lvsp
            ON rec_frt.line=lvsp.line
            AND rec_frt.variant=lvsp.variant
            AND li_lfd_nr=departure_lfd
        INNER JOIN data.lid_verlauf lvep
            ON rec_frt.line=lvep.line
            AND rec_frt.variant=lvep.variant
            AND lvsp.li_lfd_nr < lvep.li_lfd_nr
        WHERE rec_frt.trip=trip_arg
        ORDER BY lvsp.li_lfd_nr, lvep.li_lfd_nr;
    
    RAISE INFO 'line %, variant %', this_line, this_variant;
        
    LOOP
        FETCH outer_lfd_cursor INTO from_stop, to_stop;
        
        IF from_stop IS NULL THEN
            -- exit loop
            EXIT;
        END IF;
        
        -- RAISE INFO 'line % variant % trip_time_group % from % to %', this_line, this_variant, this_trip_time_group, from_stop, to_stop;
        OPEN inner_lfd_cursor(this_line, this_variant, this_trip_time_group, from_stop, to_stop);
        LOOP
            FETCH inner_lfd_cursor INTO travel_time_seconds;
            
            -- RAISE INFO 'seconds %', travel_time_seconds;
            IF travel_time_seconds IS NULL THEN
                EXIT;
            END IF;
            -- RAISE NOTICE 'seconds %', travel_time_seconds;
            
            -- write into the table with the travel times
            INSERT INTO data.travel_times (trip, li_lfd_nr_start, li_lfd_nr_end, travel_time)
            VALUES (trip_arg, from_stop, to_stop, travel_time_seconds);
            
        END LOOP;
        
        CLOSE inner_lfd_cursor;
        num_inserts := num_inserts+1;

    END LOOP;
    
    RETURN num_inserts;
END;
$$;


--
-- TOC entry 990 (class 1255 OID 771540)
-- Dependencies: 1412 7
-- Name: data_fill_travel_times(); Type: FUNCTION; Schema: data; Owner: -
--

CREATE FUNCTION data_fill_travel_times() RETURNS INTEGER
    LANGUAGE plpgsql
    AS $$
    DECLARE
        frt_cur CURSOR FOR
            SELECT trip
            FROM data.rec_frt
            ORDER BY trip;
        num_frts INTEGER DEFAULT 0; -- processed frts
        tot_frts INTEGER DEFAULT 0; -- total number of frts 
        num_insert INTEGER DEFAULT 0;
        
    BEGIN

    SELECT COUNT(*) INTO tot_frts FROM data.rec_frt;
    FOR recordvar IN frt_cur LOOP

        SELECT data.data_fill_frt_travel_times(recordvar.trip::bigint) INTO num_insert;
        num_frts := num_frts+1;
	    RAISE NOTICE 'inserted % records for trip %, %/% records processed',
            num_insert, recordvar.trip, num_frts, tot_frts;
    END LOOP;
    
    RETURN num_frts;
END;
$$;


SET default_with_oids = false;

--
-- TOC entry 167 (class 1259 OID 591690)
-- Dependencies: 7
-- Name: firmenkalender; Type: TABLE; Schema: data; Owner: -
--

CREATE TABLE firmenkalender (
    version INTEGER NOT NULL,
    betriebstag INTEGER NOT NULL,
    betriebstag_text VARCHAR(40),
    day_type INTEGER
);


--
-- TOC entry 177 (class 1259 OID 768010)
-- Dependencies: 7
-- Name: frt_ort_last; Type: TABLE; Schema: data; Owner: -
--

CREATE TABLE frt_ort_last (
    trip bigint NOT NULL,
    onr_typ_nr SMALLINT,
    ort_nr INTEGER
);


--
-- TOC entry 180 (class 1259 OID 919788)
-- Dependencies: 7
-- Name: frt_teq_mapping; Type: TABLE; Schema: data; Owner: -
--

CREATE TABLE frt_teq_mapping (
    teq_trip bigint NOT NULL,
    trip bigint
);


--
-- TOC entry 168 (class 1259 OID 591693)
-- Dependencies: 3706 3707 3708 1306 7
-- Name: lid_verlauf; Type: TABLE; Schema: data; Owner: -
--

CREATE TABLE lid_verlauf (
    version INTEGER NOT NULL,
    li_lfd_nr SMALLINT NOT NULL,
    line INTEGER NOT NULL,
    variant SMALLINT NOT NULL,
    onr_typ_nr SMALLINT,
    ort_nr INTEGER,
    display INTEGER,
    announcement INTEGER,
    bus_stop_radius SMALLINT,
    time_relevant SMALLINT,
    entrance SMALLINT,
    exit SMALLINT,
    area SMALLINT,
    kurzstrecke SMALLINT,
    halte_typ SMALLINT
);

SELECT AddGeometryColumn('data', 'lid_verlauf', 'the_geom', 25832, 'LINESTRING', 2);

--
-- TOC entry 170 (class 1259 OID 591705)
-- Dependencies: 7
-- Name: menge_fgr; Type: TABLE; Schema: data; Owner: -
--

CREATE TABLE menge_fgr (
    version INTEGER NOT NULL,
    trip_time_group INTEGER NOT NULL,
    trip_time_group_text VARCHAR(40)
);


--
-- TOC entry 171 (class 1259 OID 591708)
-- Dependencies: 7
-- Name: menge_tagesart; Type: TABLE; Schema: data; Owner: -
--

CREATE TABLE menge_tagesart (
    version INTEGER NOT NULL,
    day_type INTEGER NOT NULL,
    tagesart_text VARCHAR(40)
);


--
-- TOC entry 181 (class 1259 OID 985330)
-- Dependencies: 3716 3717 3718 1306 7
-- Name: ort_edges; Type: TABLE; Schema: data; Owner: -
--

CREATE TABLE ort_edges (
    id INTEGER NOT NULL,
    start_onr_typ_nr INTEGER,
    start_ort_nr INTEGER,
    end_onr_typ_nr INTEGER,
    end_ort_nr INTEGER
);

SELECT AddGeometryColumn('data', 'ort_edges', 'the_geom', 25832, 'LINESTRING', 2); 
--
-- TOC entry 182 (class 1259 OID 985339)
-- Dependencies: 7 181
-- Name: ort_edges_id_seq; Type: SEQUENCE; Schema: data; Owner: -
--

CREATE SEQUENCE ort_edges_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3811 (class 0 OID 0)
-- Dependencies: 182
-- Name: ort_edges_id_seq; Type: SEQUENCE OWNED BY; Schema: data; Owner: -
--

ALTER SEQUENCE ort_edges_id_seq OWNED BY ort_edges.id;


--
-- TOC entry 172 (class 1259 OID 591711)
-- Dependencies: 7
-- Name: rec_frt; Type: TABLE; Schema: data; Owner: -
--

CREATE TABLE rec_frt (
    version INTEGER NOT NULL,
    trip bigint NOT NULL,
    departure INTEGER,
    line INTEGER,
    day_type INTEGER,
    course INTEGER,
    trip_type SMALLINT,
    trip_time_group INTEGER,
    variant SMALLINT,
    journey INTEGER,
    service INTEGER,
    trip_external INTEGER,
    display INTEGER,
    licensee INTEGER,
    client INTEGER,
    foreign_company INTEGER,
    vehicle_type SMALLINT,
    remark VARCHAR(1000),
    blank1 VARCHAR(10),
    blank2 VARCHAR(10),
    teq BIGINT
);


--
-- TOC entry 179 (class 1259 OID 916616)
-- Dependencies: 7
-- Name: rec_frt_fzt; Type: TABLE; Schema: data; Owner: -
--

CREATE TABLE rec_frt_fzt (
    version INTEGER,
    trip bigint NOT NULL,
    onr_typ_nr SMALLINT NOT NULL,
    ort_nr INTEGER NOT NULL,
    frt_fzt_zeit INTEGER
);


--
-- TOC entry 178 (class 1259 OID 916613)
-- Dependencies: 7
-- Name: rec_frt_hzt; Type: TABLE; Schema: data; Owner: -
--

CREATE TABLE rec_frt_hzt (
    version INTEGER,
    trip bigint NOT NULL,
    onr_typ_nr SMALLINT NOT NULL,
    ort_nr INTEGER NOT NULL,
    frt_hzt_zeit INTEGER
);


--
-- TOC entry 173 (class 1259 OID 591717)
-- Dependencies: 3709 3710 3711 7 1306
-- Name: rec_lid; Type: TABLE; Schema: data; Owner: -
--

CREATE TABLE rec_lid (
    version INTEGER NOT NULL,
    line INTEGER NOT NULL,
    variant SMALLINT NOT NULL,
    routen_nr SMALLINT,
    direction SMALLINT,
    bereich_nr SMALLINT,
    li_kuerzel VARCHAR(6),
    line_name VARCHAR(40),
    routen_art SMALLINT,
    linien_code SMALLINT,
    licensee INTEGER,
    client INTEGER,
    foreign_company INTEGER
);

SELECT AddGeometryColumn('data', 'rec_lid', 'the_geom', 25832, 'LINESTRING', 2); 

--
-- TOC entry 174 (class 1259 OID 591726)
-- Dependencies: 3712 3713 3714 7 1306
-- Name: rec_ort; Type: TABLE; Schema: data; Owner: -
--

CREATE TABLE rec_ort (
    version INTEGER NOT NULL,
    onr_typ_nr SMALLINT NOT NULL,
    ort_nr INTEGER NOT NULL,
    ort_name VARCHAR(40),
    ort_ref_ort INTEGER,
    ort_ref_ort_typ SMALLINT,
    ort_ref_ort_langnr INTEGER,
    ort_ref_ort_kuerzel VARCHAR(8),
    ort_ref_ort_name VARCHAR(40),
    area SMALLINT,
    ort_pos_laenge bigint,
    ort_pos_breite bigint,
    ort_pos_hoehe bigint,
    ort_richtung SMALLINT,
    ort_druckname VARCHAR(40),
    richtungswechsel SMALLINT
);

SELECT AddGeometryColumn('data', 'rec_ort', 'the_geom', 25832, 'POINT', 2); 

--
-- TOC entry 175 (class 1259 OID 591735)
-- Dependencies: 7
-- Name: sel_fzt_feld; Type: TABLE; Schema: data; Owner: -
--

CREATE TABLE sel_fzt_feld (
    version INTEGER NOT NULL,
    bereich_nr SMALLINT NOT NULL,
    trip_time_group INTEGER NOT NULL,
    onr_typ_nr SMALLINT NOT NULL,
    ort_nr INTEGER NOT NULL,
    sel_ziel INTEGER NOT NULL,
    sel_ziel_typ SMALLINT NOT NULL,
    sel_fzt INTEGER
);


--
-- TOC entry 176 (class 1259 OID 712987)
-- Dependencies: 7
-- Name: travel_times; Type: TABLE; Schema: data; Owner: -
--

CREATE TABLE travel_times (
    trip bigint NOT NULL,
    li_lfd_nr_start SMALLINT NOT NULL,
    li_lfd_nr_end SMALLINT NOT NULL,
    travel_time INTEGER
);


--
-- TOC entry 183 (class 1259 OID 1091561)
-- Dependencies: 3719 3720 3721 3722 3723 3724 3725 1306 7 1306
-- Name: vehicle_positions; Type: TABLE; Schema: data; Owner: -
--

CREATE UNLOGGED TABLE vehicle_positions (
    gps_date timestamp(0) with time zone NOT NULL,
    delay_sec INTEGER NOT NULL,
    insert_date timestamp(0) without time zone DEFAULT now() NOT NULL,
    trip bigint NOT NULL,
    li_lfd_nr SMALLINT,
    line INTEGER,
    variant SMALLINT,
    interpolation_linear_ref double precision,
    interpolation_distance double precision,
    extrapolation_linear_ref double precision,
    arrival_time timestamp without time zone,
    status VARCHAR(1),
    vehicle SMALLINT NOT NULL,
    depot VARCHAR(2)
);


SELECT AddGeometryColumn('data', 'vehicle_positions', 'the_geom', 25832, 'POINT', 2); 
SELECT AddGeometryColumn('data', 'vehicle_positions', 'extrapolation_geom', 25832, 'POINT', 2); 
--
-- TOC entry 3812 (class 0 OID 0)
-- Dependencies: 183
-- Name: COLUMN vehicle_positions.status; Type: COMMENT; Schema: data; Owner: -
--

COMMENT ON COLUMN vehicle_positions.status IS 'r=run, w=waiting, t=terminated';


--
-- TOC entry 3715 (class 2604 OID 985341)
-- Dependencies: 182 181
-- Name: id; Type: DEFAULT; Schema: data; Owner: -
--

ALTER TABLE ONLY ort_edges ALTER COLUMN id SET DEFAULT nextval('ort_edges_id_seq'::regclass);


--
-- TOC entry 3736 (class 2606 OID 591774)
-- Dependencies: 167 167 3806
-- Name: firmenkalender_pkey; Type: CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY firmenkalender
    ADD CONSTRAINT firmenkalender_pkey PRIMARY KEY (betriebstag);


--
-- TOC entry 3767 (class 2606 OID 768014)
-- Dependencies: 177 177 3806
-- Name: frt_ort_last_pkey; Type: CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY frt_ort_last
    ADD CONSTRAINT frt_ort_last_pkey PRIMARY KEY (trip);


--
-- TOC entry 3773 (class 2606 OID 919794)
-- Dependencies: 180 180 3806
-- Name: frt_teq_mapping_trip_key; Type: CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY frt_teq_mapping
    ADD CONSTRAINT frt_teq_mapping_trip_key UNIQUE (trip);


--
-- TOC entry 3775 (class 2606 OID 919792)
-- Dependencies: 180 180 3806
-- Name: frt_teq_mapping_pkey; Type: CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY frt_teq_mapping
    ADD CONSTRAINT frt_teq_mapping_pkey PRIMARY KEY (teq_trip);


--
-- TOC entry 3741 (class 2606 OID 1124261)
-- Dependencies: 168 168 168 168 3806
-- Name: lid_verlauf_pkey; Type: CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY lid_verlauf
    ADD CONSTRAINT lid_verlauf_pkey PRIMARY KEY (li_lfd_nr, line, variant);


--
-- TOC entry 3745 (class 2606 OID 591780)
-- Dependencies: 170 170 3806
-- Name: menge_fgr_pkey; Type: CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY menge_fgr
    ADD CONSTRAINT menge_fgr_pkey PRIMARY KEY (trip_time_group);


--
-- TOC entry 3747 (class 2606 OID 591782)
-- Dependencies: 171 171 3806
-- Name: menge_tagesart_pkey; Type: CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY menge_tagesart
    ADD CONSTRAINT menge_tagesart_pkey PRIMARY KEY (day_type);



--
-- TOC entry 3778 (class 2606 OID 985348)
-- Dependencies: 181 181 181 181 181 3806
-- Name: ort_edges_start_ort_nr_start_onr_typ_nr_end_ort_nr_end_onr__key; Type: CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY ort_edges
    ADD CONSTRAINT ort_edges_start_ort_nr_start_onr_typ_nr_end_ort_nr_end_onr__key UNIQUE (start_ort_nr, start_onr_typ_nr, end_ort_nr, end_onr_typ_nr);


--
-- TOC entry 3781 (class 2606 OID 985343)
-- Dependencies: 181 181 3806
-- Name: ort_segments_pkey; Type: CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY ort_edges
    ADD CONSTRAINT ort_segments_pkey PRIMARY KEY (id);


--
-- TOC entry 3771 (class 2606 OID 916684)
-- Dependencies: 179 179 179 179 3806
-- Name: rec_frt_fzt_pkey; Type: CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY rec_frt_fzt
    ADD CONSTRAINT rec_frt_fzt_pkey PRIMARY KEY (trip, onr_typ_nr, ort_nr);


--
-- TOC entry 3769 (class 2606 OID 916682)
-- Dependencies: 178 178 178 178 3806
-- Name: rec_frt_hzt_pkey; Type: CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY rec_frt_hzt
    ADD CONSTRAINT rec_frt_hzt_pkey PRIMARY KEY (trip, onr_typ_nr, ort_nr);


--
-- TOC entry 3751 (class 2606 OID 591784)
-- Dependencies: 172 172 3806
-- Name: rec_frt_pkey; Type: CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY rec_frt
    ADD CONSTRAINT rec_frt_pkey PRIMARY KEY (trip);


--
-- TOC entry 3756 (class 2606 OID 1124278)
-- Dependencies: 173 173 173 3806
-- Name: rec_lid_pkey; Type: CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY rec_lid
    ADD CONSTRAINT rec_lid_pkey PRIMARY KEY (line, variant);


--
-- TOC entry 3758 (class 2606 OID 591788)
-- Dependencies: 174 174 174 3806
-- Name: rec_ort_pkey; Type: CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY rec_ort
    ADD CONSTRAINT rec_ort_pkey PRIMARY KEY (onr_typ_nr, ort_nr);


--
-- TOC entry 3762 (class 2606 OID 591790)
-- Dependencies: 175 175 175 175 175 175 175 3806
-- Name: sel_fzt_feld_pkey; Type: CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY sel_fzt_feld
    ADD CONSTRAINT sel_fzt_feld_pkey PRIMARY KEY (bereich_nr, trip_time_group, onr_typ_nr, ort_nr, sel_ziel_typ, sel_ziel);


--
-- TOC entry 3765 (class 2606 OID 712991)
-- Dependencies: 176 176 176 176 3806
-- Name: travel_times_pkey; Type: CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY travel_times
    ADD CONSTRAINT travel_times_pkey PRIMARY KEY (trip, li_lfd_nr_start, li_lfd_nr_end);


--
-- TOC entry 3783 (class 2606 OID 1125697)
-- Dependencies: 183 183 3806
-- Name: vehicle_positions_pkey; Type: CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY vehicle_positions
    ADD CONSTRAINT vehicle_positions_pkey PRIMARY KEY (trip);




--
-- TOC entry 3737 (class 1259 OID 768025)
-- Dependencies: 168 3806
-- Name: lid_verlauf_li_lfd_nr_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX lid_verlauf_li_lfd_nr_idx ON lid_verlauf USING btree (li_lfd_nr);


--
-- TOC entry 3738 (class 1259 OID 1124259)
-- Dependencies: 168 168 3806
-- Name: lid_verlauf_line_variant_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX lid_verlauf_line_variant_idx ON lid_verlauf USING btree (line, variant);


--
-- TOC entry 3739 (class 1259 OID 591815)
-- Dependencies: 168 168 3806
-- Name: lid_verlauf_onr_typ_nr_ort_nr_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX lid_verlauf_onr_typ_nr_ort_nr_idx ON lid_verlauf USING btree (onr_typ_nr, ort_nr);


--
-- TOC entry 3776 (class 1259 OID 985346)
-- Dependencies: 181 181 3806
-- Name: ort_edges_end_ort_nr_end_onr_typ_nr_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX ort_edges_end_ort_nr_end_onr_typ_nr_idx ON ort_edges USING btree (end_ort_nr, end_onr_typ_nr);


--
-- TOC entry 3779 (class 1259 OID 985345)
-- Dependencies: 181 181 3806
-- Name: ort_edges_start_ort_nr_start_onr_typ_nr_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX ort_edges_start_ort_nr_start_onr_typ_nr_idx ON ort_edges USING btree (start_ort_nr, start_onr_typ_nr);


--
-- TOC entry 3748 (class 1259 OID 591817)
-- Dependencies: 172 3806
-- Name: rec_frt_trip_time_group_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX rec_frt_trip_time_group_idx ON rec_frt USING btree (trip_time_group);


--
-- TOC entry 3749 (class 1259 OID 1124297)
-- Dependencies: 172 172 3806
-- Name: rec_frt_line_variant_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX rec_frt_line_variant_idx ON rec_frt USING btree (line, variant);


--
-- TOC entry 3752 (class 1259 OID 591819)
-- Dependencies: 172 3806
-- Name: rec_frt_day_typex; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX rec_frt_day_type_idx ON rec_frt USING btree (day_type);


--
-- TOC entry 3753 (class 1259 OID 768004)
-- Dependencies: 172 172 172 3806
-- Name: rec_frt_day_journey_departure_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE UNIQUE INDEX rec_frt_day_type_journey_departure_idx ON rec_frt USING btree (day_type, journey, departure);


--
-- TOC entry 3754 (class 1259 OID 591820)
-- Dependencies: 173 173 173 3806
-- Name: rec_lid_version_line_routen_nr_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE UNIQUE INDEX rec_lid_version_line_routen_nr_idx ON rec_lid USING btree (version, line, routen_nr);


--
-- TOC entry 3759 (class 1259 OID 591821)
-- Dependencies: 175 3806
-- Name: sel_fzt_feld_trip_time_group_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX sel_fzt_feld_trip_time_group_idx ON sel_fzt_feld USING btree (trip_time_group);


--
-- TOC entry 3760 (class 1259 OID 591822)
-- Dependencies: 175 175 3806
-- Name: sel_fzt_feld_onr_typ_nr_ort_nr_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX sel_fzt_feld_onr_typ_nr_ort_nr_idx ON sel_fzt_feld USING btree (onr_typ_nr, ort_nr);


--
-- TOC entry 3763 (class 1259 OID 591823)
-- Dependencies: 175 175 3806
-- Name: sel_fzt_feld_sel_ziel_typ_sel_ziel_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX sel_fzt_feld_sel_ziel_typ_sel_ziel_idx ON sel_fzt_feld USING btree (sel_ziel_typ, sel_ziel);


--
-- TOC entry 3790 (class 2606 OID 591829)
-- Dependencies: 171 167 3746 3806
-- Name: firmenkalender_day_fkey; Type: FK CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY firmenkalender
    ADD CONSTRAINT firmenkalender_day_type_fkey FOREIGN KEY (day_type) REFERENCES menge_tagesart(day_type) DEFERRABLE;


--
-- TOC entry 3799 (class 2606 OID 768015)
-- Dependencies: 3750 172 177 3806
-- Name: frt_ort_last_trip_fkey; Type: FK CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY frt_ort_last
    ADD CONSTRAINT frt_ort_last_trip_fkey FOREIGN KEY (trip) REFERENCES rec_frt(trip) DEFERRABLE INITIALLY DEFERRED;


--
-- TOC entry 3800 (class 2606 OID 768020)
-- Dependencies: 177 177 174 174 3757 3806
-- Name: frt_ort_last_onr_typ_nr_fkey; Type: FK CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY frt_ort_last
    ADD CONSTRAINT frt_ort_last_onr_typ_nr_fkey FOREIGN KEY (onr_typ_nr, ort_nr) REFERENCES rec_ort(onr_typ_nr, ort_nr) DEFERRABLE INITIALLY DEFERRED;


--
-- TOC entry 3792 (class 2606 OID 1124284)
-- Dependencies: 168 168 3755 173 173 3806
-- Name: lid_verlauf_line_fkey; Type: FK CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY lid_verlauf
    ADD CONSTRAINT lid_verlauf_line_fkey FOREIGN KEY (line, variant) REFERENCES rec_lid(line, variant) DEFERRABLE;


--
-- TOC entry 3791 (class 2606 OID 591839)
-- Dependencies: 3757 174 174 168 168 3806
-- Name: lid_verlauf_onr_typ_nr_fkey; Type: FK CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY lid_verlauf
    ADD CONSTRAINT lid_verlauf_onr_typ_nr_fkey FOREIGN KEY (onr_typ_nr, ort_nr) REFERENCES rec_ort(onr_typ_nr, ort_nr) DEFERRABLE;


--
-- TOC entry 3794 (class 2606 OID 767994)
-- Dependencies: 170 3744 172 3806
-- Name: rec_frt_trip_time_group_fkey; Type: FK CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY rec_frt
    ADD CONSTRAINT rec_frt_trip_time_group_fkey FOREIGN KEY (trip_time_group) REFERENCES menge_fgr(trip_time_group) DEFERRABLE INITIALLY DEFERRED;


--
-- TOC entry 3803 (class 2606 OID 916671)
-- Dependencies: 172 3750 179 3806
-- Name: rec_frt_fzt_trip_fkey; Type: FK CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY rec_frt_fzt
    ADD CONSTRAINT rec_frt_fzt_trip_fkey FOREIGN KEY (trip) REFERENCES rec_frt(trip) DEFERRABLE;


--
-- TOC entry 3804 (class 2606 OID 916676)
-- Dependencies: 174 3757 174 179 179 3806
-- Name: rec_frt_fzt_ort_nr_fkey; Type: FK CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY rec_frt_fzt
    ADD CONSTRAINT rec_frt_fzt_ort_nr_fkey FOREIGN KEY (ort_nr, onr_typ_nr) REFERENCES rec_ort(ort_nr, onr_typ_nr) DEFERRABLE;


--
-- TOC entry 3801 (class 2606 OID 916661)
-- Dependencies: 3750 172 178 3806
-- Name: rec_frt_hzt_trip_fkey; Type: FK CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY rec_frt_hzt
    ADD CONSTRAINT rec_frt_hzt_trip_fkey FOREIGN KEY (trip) REFERENCES rec_frt(trip) DEFERRABLE;


--
-- TOC entry 3802 (class 2606 OID 916666)
-- Dependencies: 174 3757 174 178 178 3806
-- Name: rec_frt_hzt_ort_nr_fkey; Type: FK CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY rec_frt_hzt
    ADD CONSTRAINT rec_frt_hzt_ort_nr_fkey FOREIGN KEY (ort_nr, onr_typ_nr) REFERENCES rec_ort(ort_nr, onr_typ_nr) DEFERRABLE;


--
-- TOC entry 3795 (class 2606 OID 1124298)
-- Dependencies: 172 172 173 173 3755 3806
-- Name: rec_frt_line_fkey; Type: FK CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY rec_frt
    ADD CONSTRAINT rec_frt_line_fkey FOREIGN KEY (line, variant) REFERENCES rec_lid(line, variant) DEFERRABLE INITIALLY DEFERRED;


--
-- TOC entry 3793 (class 2606 OID 591854)
-- Dependencies: 172 3746 171 3806
-- Name: rec_frt_day_fkey; Type: FK CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY rec_frt
    ADD CONSTRAINT rec_frt_day_type_fkey FOREIGN KEY (day_type) REFERENCES menge_tagesart(day_type) DEFERRABLE;


--
-- TOC entry 3796 (class 2606 OID 591859)
-- Dependencies: 175 3744 170 3806
-- Name: sel_fzt_feld_trip_time_group_fkey; Type: FK CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY sel_fzt_feld
    ADD CONSTRAINT sel_fzt_feld_trip_time_group_fkey FOREIGN KEY (trip_time_group) REFERENCES menge_fgr(trip_time_group) DEFERRABLE;


--
-- TOC entry 3797 (class 2606 OID 591864)
-- Dependencies: 175 175 174 3757 174 3806
-- Name: sel_fzt_feld_onr_typ_nr_fkey; Type: FK CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY sel_fzt_feld
    ADD CONSTRAINT sel_fzt_feld_onr_typ_nr_fkey FOREIGN KEY (onr_typ_nr, ort_nr) REFERENCES rec_ort(onr_typ_nr, ort_nr) DEFERRABLE;


--
-- TOC entry 3798 (class 2606 OID 591869)
-- Dependencies: 175 175 3757 174 174 3806
-- Name: sel_fzt_feld_sel_ziel_typ_fkey; Type: FK CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY sel_fzt_feld
    ADD CONSTRAINT sel_fzt_feld_sel_ziel_typ_fkey FOREIGN KEY (sel_ziel_typ, sel_ziel) REFERENCES rec_ort(onr_typ_nr, ort_nr) DEFERRABLE;


-- Completed on 2014-03-09 22:38:22 CET

--
-- PostgreSQL database dump complete
--

CREATE INDEX ON data.ort_edges USING GIST(the_geom);
CREATE INDEX ON data.lid_verlauf USING GIST(the_geom);
CREATE INDEX ON data.ort_edges USING GIST(the_geom);
CREATE INDEX ON data.rec_lid USING GIST(the_geom);
CREATE INDEX ON data.rec_ort USING GIST(the_geom);


--
-- Name: line_colors; Type: TABLE; Schema: data; Owner: postgres
--

CREATE TABLE line_colors (
    line INTEGER NOT NULL,
    red SMALLINT NOT NULL,
    green SMALLINT NOT NULL,
    blue SMALLINT NOT NULL,
    hex VARCHAR(6),
    hue SMALLINT NOT NULL
);


ALTER TABLE line_colors OWNER TO postgres;

--
-- Data for Name: line_colors; Type: TABLE DATA; Schema: data; Owner: postgres
--

INSERT INTO line_colors (line, red, green, blue, hex, hue) VALUES
    (116, 0, 73, 107, '3f51b5', 240),
    (117, 0, 73, 107, '3f51b5', 240),
    (1, 231, 120, 23, 'ff9800', 35),
    (2, 68, 145, 108, '4caf50', 160),
    (3, 3, 163, 251, '2196f3', 205),
    (4, 248, 195, 0, 'ffd600', 60),
    (6, 153, 97, 136, 'e91e63', 330),
    (13, 77, 72, 91, '9c27b0', 280),
    (110, 3, 163, 215, '2196f3', 200),
    (111, 89, 93, 156, '2962ff', 215),
    (211, 218, 37, 29, 'f44336', 0),
    (212, 89, 93, 156, '9c27b0', 280),
    (213, 0, 116, 133, '009688', 175),
    (215, 231, 176, 0, 'ffd600', 60),
    (183, 255, 162, 0, '3f51b5', 240),
    (201, 0, 73, 107, '3f51b5', 240),
    (214, 0, 73, 107, '3f51b5', 240),
    (222, 0, 73, 107, '3f51b5', 240),
    (223, 0, 73, 107, '3f51b5', 240),
    (224, 0, 73, 107, '3f51b5', 240),
    (225, 0, 73, 107, '3f51b5', 240),
    (5000, 0, 73, 107, '3f51b5', 240),
    (248, 0, 73, 107, '3f51b5', 240),
    (221, 0, 73, 107, '8bc34a', 100),
    (1001, 178, 62, 62, 'f44336', 0),
    (1003, 142, 132, 183, 'e91e63', 330),
    (1005, 149, 127, 102, '795548', 25),
    (1006, 0, 116, 133, '009688', 175),
    (1008, 123, 196, 160, '8bc34a', 140),
    (1009, 184, 219, 124, 'cddc39', 80),
    (1011, 248, 195, 0, 'ffd600', 60),
    (1012, 105, 64, 110, '9c27b0', 280),
    (1014, 0, 146, 63, '4caf50', 120),
    (1071, 231, 120, 23, 'ff9800', 45),
    (1072, 231, 120, 23, 'ff9800', 45),
    (1101, 218, 37, 29, 'f44336', 10),
    (1102, 218, 37, 29, 'f44336', 10),
    (1153, 77, 72, 91, '9c27b0', 280),
    (112, 105, 64, 110, '9c27b0', 280),
    (202, 0, 73, 107, '3f51b5', 240);

--
-- Name: line_colors_pkey; Type: CONSTRAINT; Schema: data; Owner: postgres
--

ALTER TABLE ONLY line_colors
    ADD CONSTRAINT line_colors_pkey PRIMARY KEY (line);