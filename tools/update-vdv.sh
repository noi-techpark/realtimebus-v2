#!/bin/bash

USERNAME=${1}
PASSWORD=${2}

echo "IMPORTING CURRENT VDV..."

rm -f ./latest.zip*

wget http://realtimetest.opensasa.info/vdv/list/latest.zip

curl --header "Content-Type:application/octet-stream" --data-binary @./latest.zip --user ${USERNAME}:${PASSWORD} -X POST http://$(curl http://169.254.169.254/latest/meta-data/public-ipv4)/vdv/import

rm -f ./latest.zip*