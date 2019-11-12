#!/bin/bash

BASE_URL=`node -e "console.log(require('./local-config.js').application.baseUrl);"`
VDV_USERNAME=`node -e "console.log(require('./local-config.js').vdv.username);"`
VDV_PASSWORD=`node -e "console.log(require('./local-config.js').vdv.password);"`

rm -f ./latest.zip*

wget http://realtimetest.opensasa.info/vdv/list/latest.zip

curl --header "Content-Type:application/octet-stream" --data-binary @./latest.zip --user ${VDV_USERNAME}:${VDV_PASSWORD} -X POST ${BASE_URL}/vdv/import

rm -f ./latest.zip*