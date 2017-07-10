'use strict';

const connection = require("../../../database/connection");

class ActualPositionLineReference {

    getLineReference(feature) {
        let retVal = {
            li_nr: 'null',
            str_li_var: null,
            li_lfd_nr: 'null',
            interpolation_distance: 'null',
            interpolation_linear_ref: 'null',
        };

        if ("geometry_sql" in feature) {
            let getLineSegmentSql = `
                SELECT
                lid_verlauf.li_nr,
                    lid_verlauf.str_li_var,
                    lid_verlauf.li_lfd_nr,
                ST_Distance(lid_verlauf.the_geom, ${feature.geometry_sql} ) as interpolation_distance,
                ST_Line_Locate_Point(lid_verlauf.the_geom, ${feature.geometry_sql}) as interpolation_linear_ref
                FROM vdv.rec_frt
                INNER JOIN vdv.lid_verlauf
                ON rec_frt.li_nr = lid_verlauf.li_nr
                AND rec_frt.str_li_var = lid_verlauf.str_li_var
                WHERE rec_frt.teq_nummer = ${feature.properties.frt_fid}
                ORDER BY ST_Distance(lid_verlauf.the_geom, ${feature.geometry_sql})
                LIMIT 1
            `;

            connection.query(getLineSegmentSql, function (err, res) {
                if (err) {
                    throw new Error(`Could not run query ${err}`);
                }

                retVal = res.rows[0];
            });
        }

        return retVal;
    }

    execute(featureId, feature, filterValue) {
        /*if (filterValue != DataFilter::IS_OK) {
            return;
        }*/

        // TODO: Why is there a return here? (Also found in original code 🤔)

        return;

        /*$getLineSegmentSql =
    <<<
        EOQ
        SELECT
        vehicle_position_act.frt_fid,
            lid_verlauf.li_nr,
            lid_verlauf.str_li_var,
            lid_verlauf.li_lfd_nr,
        ST_Distance(lid_verlauf.the_geom, vehicle_position_act.the_geom) as interpolation_distance,
        ST_Line_Locate_Point(lid_verlauf.the_geom, vehicle_position_act.the_geom) as interpolation_linear_ref
        FROM
        vdv.vehicle_position_act
        INNER
        JOIN
        vdv.rec_frt
        ON
        vehicle_position_act.frt_fid = rec_frt.teq_nummer
        INNER
        JOIN
        vdv.lid_verlauf
        ON
        rec_frt.li_nr = lid_verlauf.li_nr
        AND
        rec_frt.str_li_var = lid_verlauf.str_li_var
        WHERE
        vehicle_position_act.frt_fid = {$feature['properties']['frt_fid']}
        ORDER
        BY
        ST_Distance(lid_verlauf.the_geom, vehicle_position_act.the_geom)
        LIMIT
        1
        EOQ;
        // echo $getLineSegmentSql;
        $data = $this->db->query($getLineSegmentSql)
    ->
        fetchAll(\PDO::FETCH_ASSOC
    )
        ;

        if (count($data) > 0) {
            if (is_null($data[0]['interpolation_linear_ref'])) {
                $data[0]['interpolation_linear_ref'] = 'NULL';
            }
            $setLineSegmentSql =
        <<<
            EOQ
            UPDATE
            vdv.vehicle_position_act
            SET
            li_nr = {$data[0]['li_nr']},
                str_li_var = '{$data[0]['
            str_li_var
            ']}',
                li_lfd_nr = {$data[0]['li_lfd_nr']},
                interpolation_distance = {$data[0]['interpolation_distance']},
                interpolation_linear_ref = {$data[0]['interpolation_linear_ref']}
            WHERE
            frt_fid = {$data[0]['frt_fid']}
            EOQ;
            $this->db->exec($setLineSegmentSql);
        }*/
    }
}