#!/bin/bash

URL_REGEX='^(https?|ftp|file)://[-A-Za-z0-9\+&@#/%?=~_|!:,.;]*[-A-Za-z0-9\+&@#/%=~_|]$'

BASE_URL=`node -e "console.log(require('./local-config.js').application.baseUrl);"`
VDV_USERNAME=`node -e "console.log(require('./local-config.js').vdv.username);"`
VDV_PASSWORD=`node -e "console.log(require('./local-config.js').vdv.password);"`

rm -f ./tmp-vdv.zip*
rm -f ./tmp-mapping.csv*
rm -f ./tmp-paths.kml*

VDV_FILE='./tmp-vdv.zip'
MAPPINGS_FILE='./tmp-mapping.csv'
PATHS_FILE='./tmp-paths.kml'

echo "Preparing files and assets..."

if [ $# -eq 0 ]; then
    wget --quiet -O ./tmp-vdv.zip http://realtimetest.opensasa.info/vdv/list/latest.zip
    wget --quiet -O ./tmp-mapping.csv http://www.sasabz.it/fileadmin/files/varianti.csv
    wget --quiet -O ./tmp-paths.kml http://www.sasabz.it/fileadmin/files/sasa_ge_routesdata.kml
fi

if [ $# -eq 3 ]; then
    VDV_FILE=${1}
    MAPPINGS_FILE=${2}
    PATHS_FILE=${3}
fi

if [[ ${VDV_FILE} =~ ${URL_REGEX} ]]; then
    wget --quiet -O ./tmp-vdv.zip ${VDV_FILE}
    VDV_FILE='./tmp-vdv.zip'
fi

if [[ ${MAPPINGS_FILE} =~ ${URL_REGEX} ]]; then
    wget --quiet -O ./tmp-mapping.csv ${MAPPINGS_FILE}
    MAPPINGS_FILE='./tmp-mapping.csv'
fi

if [[ ${PATHS_FILE} =~ ${URL_REGEX} ]]; then
    wget --quiet -O ./tmp-paths.kml ${PATHS_FILE}
    PATHS_FILE='./tmp-paths.kml'
fi

VDV=`base64 ${VDV_FILE}`
MAPPINGS=`base64 ${MAPPINGS_FILE}`
PATHS=`base64 ${PATHS_FILE}`

echo "Creating payload..."

echo "{ \"data\": \"${VDV}\", \"geometries\": { \"mapping\": \"${MAPPINGS}\", \"paths\": \"${PATHS}\" } }" > ./tmp-payload.json

echo "Importing data..."

curl -X POST -H "Content-Type: application/json" --user ${VDV_USERNAME}:${VDV_PASSWORD} -d @./tmp-payload.json "${BASE_URL}/v2/import"

rm -f ./tmp-vdv.zip*
rm -f ./tmp-mapping.csv*
rm -f ./tmp-paths.kml*
rm -f ./tmp-payload.json*

echo "All done!"