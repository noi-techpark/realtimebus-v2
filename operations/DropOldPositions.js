'use strict';

const connection = require("../database/connection");
const logger = require("../util/logger");

module.exports = class DropOldPositions {

    constructor(age) {
        this.age = age || 600;
    }

    run() {
        logger.warn("Dropping old bus positions");

        return Promise.resolve()
            .then(connection.query("SET search_path=vdv,public;"))
            .then(() => connection.query(`DELETE FROM vdv.vehicle_position_act WHERE gps_date < NOW() - interval '10 minute' RETURNING *`))
            .then(result => {
                logger.warn(`Dropped ${result.rowCount} old bus positions`);
            })
    }

    /*protected function configure() {
        $this->setName('vdv:drop_old_positions')
                ->setDescription('Drop positions older then from the database')
                ->addArgument('seconds', InputArgument::OPTIONAL, 'maximum data age');
    }*/
};