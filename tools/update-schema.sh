#!/bin/bash

echo "UPDATING DATABASE SCHEMA..."

DATABASE_NAME=`node -e "console.log(require('./local-config.js').database.name);"`
DATABASE_USERNAME=`node -e "console.log(require('./local-config.js').database.username);"`
DATABASE_PASSWORD=`node -e "console.log(require('./local-config.js').database.password);"`

PGPASSWORD=${DATABASE_PASSWORD} psql -d ${DATABASE_NAME} -U ${DATABASE_USERNAME} < ./database/schema/changelog-v01.sql
PGPASSWORD=${DATABASE_PASSWORD} psql -d ${DATABASE_NAME} -U ${DATABASE_USERNAME} < ./database/schema/changelog-v02.sql