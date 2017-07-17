'use strict';

const Utils = require("../../util/utils");

module.exports = class FeatureList {

    constructor() {
        this.features = []
    }

    add(properties, geometry) {
        let feature = {
            geometry: Utils.sortObject(geometry),
            properties: Utils.sortObject(properties),
            type: "Feature"
        };

        this.features.push(feature);
    }

    getFeatures() {
        return this.features;
    }

    getFeatureCollection() {
        return {
            type: "FeatureCollection",
            features: this.features,
        };
    }

    static createFromArray(array) {
        if (!array.hasOwnProperty("features")) {
            throw("Supplied JSON does not contain required property 'features'");
        }

        let instance = new FeatureList();
        let features = array.features;

        for (let i in features) {
            instance.add(features[i].properties, features[i].geometry)
        }

        return instance;
    }
};
