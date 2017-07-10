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

CREATE FUNCTION vdv_extrapolate_frt_position(teq_nummer_arg bigint) RETURNS integer
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
    SELECT vehicle_position_act.*,
        ST_X(vehicle_position_act.the_geom) x_act,
        ST_Y(vehicle_position_act.the_geom) y_act,
        lid_verlauf.ort_nr ort_nr,
        next_verlauf.ort_nr next_ort_nr,
        ort_edges.id ort_edge_id,
        ST_X(vehicle_position_act.the_geom) - ST_X(ST_LineInterpolatePoint(ort_edges.the_geom, interpolation_linear_ref)) dx,
        ST_Y(vehicle_position_act.the_geom) - ST_Y(ST_LineInterpolatePoint(ort_edges.the_geom, interpolation_linear_ref)) dy
    INTO pos_record
    FROM vdv.vehicle_position_act
    LEFT JOIN vdv.lid_verlauf
        ON lid_verlauf.li_nr=vehicle_position_act.li_nr
        AND lid_verlauf.str_li_var=vehicle_position_act.str_li_var
        AND lid_verlauf.li_lfd_nr = vehicle_position_act.li_lfd_nr
    LEFT JOIN vdv.lid_verlauf AS next_verlauf
        ON next_verlauf.li_nr=lid_verlauf.li_nr
        AND next_verlauf.str_li_var=lid_verlauf.str_li_var
        AND next_verlauf.li_lfd_nr = lid_verlauf.li_lfd_nr + 1
    LEFT JOIN vdv.ort_edges
        ON lid_verlauf.ort_nr=ort_edges.start_ort_nr
        AND lid_verlauf.onr_typ_nr=ort_edges.start_onr_typ_nr
        AND next_verlauf.ort_nr=ort_edges.end_ort_nr
        AND next_verlauf.onr_typ_nr=ort_edges.end_onr_typ_nr
    WHERE frt_fid=teq_nummer_arg;

    -- Calc elapsed time
    elapsed_time = EXTRACT('epoch' FROM current_timestamp-pos_record.gps_date);

    SELECT frt_fid, frt_start INTO frt
    FROM vdv.rec_frt
    WHERE teq_nummer=teq_nummer_arg;

    IF EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - CURRENT_DATE)) < frt.frt_start - 10
       AND pos_record.delay_sec = 0 THEN

        -- Bus is waiting at departure
       UPDATE vdv.vehicle_position_act
       SET status = 'w'
       WHERE frt_fid=teq_nummer_arg;
       RETURN 0;
    END IF;


    SELECT MAX(travel_time) INTO complete_travel_time
    FROM vdv.travel_times
    WHERE frt_fid=frt.frt_fid;

    IF EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - CURRENT_DATE)) > frt.frt_start +
                                                                complete_travel_time +
                                                                pos_record.delay_sec + 120
       THEN
       RAISE DEBUG 'now: %, start: %, travel_time: %, delay: %, sum: %',
         EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - CURRENT_DATE)),
           frt.frt_start,
           complete_travel_time,
           pos_record.delay_sec,
           frt.frt_start + complete_travel_time + pos_record.delay_sec + 120;

        -- Bus is waiting at departure
       UPDATE vdv.vehicle_position_act
       SET status = 'f'
       WHERE frt_fid=teq_nummer_arg;
       RETURN 0;
    END IF;

-- -- > EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - CURRENT_DATE))
--     -- get departure and arrival time
--
--     RAISE INFO 'Already at segment end';
--     SELECT MAX(li_lfd_nr) INTO max_li_lfd_nr
--     FROM vdv.lid_verlauf
--     WHERE lid_verlauf.li_nr=pos_record.li_nr
--     AND lid_verlauf.str_li_var=pos_record.str_li_var;
--
--     RAISE INFO 'li_lfd_nr=%, MAX(li_lfd_nr)=%', pos_record.li_lfd_nr, max_li_lfd_nr;
--
--     SELECT St_Distance(pos_record.the_geom, rec_ort.the_geom) INTO distance_to_end
--     FROM vdv.lid_verlauf
--     INNER JOIN vdv.rec_ort
--         ON lid_verlauf.ort_nr=rec_ort.ort_nr
--         AND lid_verlauf.onr_typ_nr=rec_ort.onr_typ_nr
--     WHERE vdv.lid_verlauf.li_nr=pos_record.li_nr
--     AND lid_verlauf.str_li_var=pos_record.str_li_var
--     AND lid_verlauf.li_lfd_nr=max_li_lfd_nr;
--
--     RAISE INFO 'Distance to end is %', distance_to_end;
--
--     IF distance_to_end < 30 AND pos_record.arrival_time IS NULL THEN
--         UPDATE vdv.vehicle_position_act
--         SET arrival_time=pos_record.gps_date,
--             status='f'
--         WHERE frt_fid=teq_nummer_arg;
--         RETURN 0;
--     END IF;

    RAISE DEBUG 'x_act: %, y_act: %, ort_nr: %, next_ort_nr: %, ort_edge_id: %, dx: %, dy: %',
    pos_record.x_act, pos_record.y_act,
    pos_record.ort_nr, pos_record.next_ort_nr, pos_record.ort_edge_id,
    pos_record.dx, pos_record.dy;

    IF pos_record.frt_fid IS NULL THEN
        RAISE WARNING 'No record found with frt_fid: %', pos_record.frt_fid;
        UPDATE vdv.vehicle_position_act
        SET extrapolation_linear_ref=NULL,
            extrapolation_geom=NULL,
            status='e'
        WHERE frt_fid=teq_nummer_arg;
        RETURN NULL;
    END IF;

    SELECT COUNT(*) INTO cnt_lfd
    FROM vdv.rec_frt
    INNER JOIN vdv.lid_verlauf
        ON lid_verlauf.li_nr=rec_frt.li_nr
        AND lid_verlauf.str_li_var=rec_frt.str_li_var
    WHERE teq_nummer=teq_nummer_arg;

    IF cnt_lfd=0 THEN
        RAISE WARNING 'teq_nummer % has no entries in lid_verlauf', pos_record.frt_fid;
        UPDATE vdv.vehicle_position_act
        SET extrapolation_linear_ref=NULL,
            extrapolation_geom=NULL,
            status='e'
        WHERE frt_fid=teq_nummer_arg;
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
    FROM vdv.lid_verlauf verlauf_start
    LEFT JOIN vdv.lid_verlauf verlauf_end
        ON verlauf_start.li_nr=verlauf_end.li_nr
        AND verlauf_start.str_li_var=verlauf_end.str_li_var
        AND verlauf_start.li_lfd_nr + 1 = verlauf_end.li_lfd_nr
    LEFT JOIN vdv.rec_ort ort_start
        ON verlauf_start.onr_typ_nr=ort_start.onr_typ_nr
        AND verlauf_start.ort_nr=ort_start.ort_nr
    LEFT JOIN vdv.rec_ort ort_end
        ON verlauf_end.onr_typ_nr=ort_end.onr_typ_nr
        AND verlauf_end.ort_nr=ort_end.ort_nr
    LEFT JOIN vdv.sel_fzt_feld
        ON ort_start.onr_typ_nr=sel_fzt_feld.onr_typ_nr
        AND ort_start.ort_nr=sel_fzt_feld.ort_nr
        AND ort_end.onr_typ_nr=sel_fzt_feld.sel_ziel_typ
        AND ort_end.ort_nr=sel_fzt_feld.sel_ziel
    WHERE verlauf_start.li_nr=pos_record.li_nr
        AND verlauf_start.str_li_var=pos_record.str_li_var
        AND verlauf_start.li_lfd_nr=pos_record.li_lfd_nr;

    RAISE DEBUG 'lfd_start: %, lfd_end: % s, ort_start %, ort_end: %, sel_fzt: %', rec_sel_fzt.lfd_start, rec_sel_fzt.lfd_end, rec_sel_fzt.ort_start, rec_sel_fzt.ort_end, rec_sel_fzt.sel_fzt;

    IF rec_sel_fzt.sel_fzt IS NULL THEN
        RAISE WARNING 'Could not find any travel time information in vdv.sel_fzt_feld for teq_nummer=%', pos_record.frt_fid;
        UPDATE vdv.vehicle_position_act
        SET extrapolation_linear_ref=NULL,
            extrapolation_geom=NULL,
            status='e'
        WHERE frt_fid=teq_nummer_arg;
        RETURN NULL;
    END IF;


    IF elapsed_time <= 0 THEN
        IF pos_record.status <> 'e' THEN
            UPDATE vdv.vehicle_position_act
            SET status='e'
            WHERE frt_fid=teq_nummer_arg;
        END IF;
        RETURN 0;
    END IF;

    -- Extrapolate only, if the bus has not already arrived
    -- at the end position
    IF pos_record.interpolation_linear_ref >= 1 THEN
        IF pos_record.status <> 'e' THEN
            UPDATE vdv.vehicle_position_act
            SET status='e'
            WHERE frt_fid=teq_nummer_arg;
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
    FROM vdv.lid_verlauf
    WHERE lid_verlauf.li_nr=pos_record.li_nr
        AND lid_verlauf.str_li_var=pos_record.str_li_var
        AND lid_verlauf.li_lfd_nr = pos_record.li_lfd_nr;


    RAISE DEBUG 'extra_pos: %, distance to last extra_pos is % and last GPS value is %',
                ST_AsText(extrapolated_position_var),
               ST_Distance(extrapolated_position_var, pos_record.extrapolation_geom),
               ST_Distance(extrapolated_position_var, pos_record.the_geom);

     -- write to database
    UPDATE vdv.vehicle_position_act
    SET extrapolation_linear_ref=extrapolated_linear_ref_var,
        extrapolation_geom=extrapolated_position_var,
        status='r'
    WHERE frt_fid=teq_nummer_arg;

    RETURN 1;
END;
$$;