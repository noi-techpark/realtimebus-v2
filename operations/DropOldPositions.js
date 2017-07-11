'use strict';

const connection = require("../database/connection");
const logger = require("../util/logger");

module.exports = class DropOldPositions {

    constructor(age) {
        this.age = age || 600;
    }

    run() {
        return Promise.resolve()
            .then(connection.query("SET search_path=vdv,public;"))
            .then(connection.query(`DELETE FROM vdv.vehicle_track WHERE age(insert_date) > interval '${this.age} seconds'`))
    }

    /*protected function configure() {
        $this->setName('vdv:drop_old_positions')
                ->setDescription('Drop positions older then from the database')
                ->addArgument('seconds', InputArgument::OPTIONAL, 'maximum data age');
    }*/
};