'use strict';

module.exports = class NewFeatureList {

    constructor() {
        this.features = []
    }

    add(feature) {
        this.features.push(feature);
    }

    getBuses() {
        return this.features;
    }

    getBusCollection() {
        return {
            buses: this.features,
        };
    }
};
