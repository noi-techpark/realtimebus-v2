#!/bin/bash

URL_REGEX='^(https?|ftp|file)://[-A-Za-z0-9\+&@#/%?=~_|!:,.;]*[-A-Za-z0-9\+&@#/%=~_|]$'

BASE_URL=`node -e "console.log(require('./local-config.js').application.baseUrl);"`
VDV_USERNAME=`node -e "console.log(require('./local-config.js').vdv.username);"`
VDV_PASSWORD=`node -e "console.log(require('./local-config.js').vdv.password);"`

rm -f ./tmp-vdv.zip*

VDV_FILE='./tmp-vdv.zip'

echo "Preparing files and assets..."

if [ $# -eq 0 ]; then
    wget --quiet -O ./tmp-vdv.zip http://realtimetest.opensasa.info/vdv/list/latest.zip
fi

if [ $# -eq 1 ]; then
    VDV_FILE=${1}
fi

if [[ ${VDV_FILE} =~ ${URL_REGEX} ]]; then
    wget -O ./tmp-vdv.zip ${VDV_FILE}
    VDV_FILE='./tmp-vdv.zip'
fi

echo "Importing data..."

curl --header "Content-Type:application/octet-stream" --data-binary @${VDV_FILE} --user ${VDV_USERNAME}:${VDV_PASSWORD} -X POST ${BASE_URL}/vdv/import

rm -f ./tmp-vdv.zip*

echo "All done!"