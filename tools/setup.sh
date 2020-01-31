#!/bin/bash

CURRENT_DIRECTORY=`pwd`

echo "CONFIGURING INSTANCE..."

sudo apt update
sudo apt install -y nodejs npm default-jre postgresql-10 postgresql-server-dev-10 postgis recode zip wget git

echo "SETTING UP PROJECT..."

npm install

echo "CONFIGURING DATABASE..."

DATABASE_NAME=`node -e "console.log(require('./local-config.js').database.name);"`
DATABASE_USERNAME=`node -e "console.log(require('./local-config.js').database.username);"`
DATABASE_PASSWORD=`node -e "console.log(require('./local-config.js').database.password);"`

if ! [[ `sudo -u postgres psql -tc "SELECT 1 FROM pg_user WHERE usename = '${DATABASE_USERNAME}'"` ]]; then
    sudo -u postgres psql -c "CREATE USER ${DATABASE_USERNAME};"
fi

sudo -u postgres psql -c "ALTER USER ${DATABASE_USERNAME} WITH SUPERUSER;"

sudo -u postgres psql -c "ALTER USER ${DATABASE_USERNAME} PASSWORD '${DATABASE_PASSWORD}';"

sudo -u postgres psql -c "DROP DATABASE IF EXISTS ${DATABASE_NAME};"

sudo -u postgres psql -c "CREATE DATABASE ${DATABASE_NAME} OWNER ${DATABASE_USERNAME};"

sudo -u postgres psql -d ${DATABASE_NAME} -c "CREATE EXTENSION postgis;"

CONF_LINE="local all ${DATABASE_USERNAME} md5"
if ! [[ `sudo grep -Fxq "${CONF_LINE}" /etc/postgresql/10/main/pg_hba.conf` ]]; then
    DEFAULT_LINE="local   all             postgres                                peer"
    sudo sed -i "s/${DEFAULT_LINE}/${DEFAULT_LINE}\n\n${CONF_LINE}/g" /etc/postgresql/10/main/pg_hba.conf
    sudo service postgresql restart
fi

PGPASSWORD=${DATABASE_PASSWORD} psql -d ${DATABASE_NAME} -U ${DATABASE_USERNAME} < ./database/schema/data.sql
PGPASSWORD=${DATABASE_PASSWORD} psql -d ${DATABASE_NAME} -U ${DATABASE_USERNAME} < ./database/schema/beacons.sql
PGPASSWORD=${DATABASE_PASSWORD} psql -d ${DATABASE_NAME} -U ${DATABASE_USERNAME} < ./database/schema/changelog-v01.sql
PGPASSWORD=${DATABASE_PASSWORD} psql -d ${DATABASE_NAME} -U ${DATABASE_USERNAME} < ./database/schema/changelog-v02.sql

echo "SETTING UP SERVICE..."

if [[ -f /etc/systemd/system/realtimebus.service ]]; then
    sudo rm -f /etc/systemd/system/realtimebus.service
fi

sudo touch /etc/systemd/system/realtimebus.service

cat << EOF | sudo tee -a /etc/systemd/system/realtimebus.service
[Unit]
Description="Realtimebus Server"

[Service]
ExecStart=/usr/bin/node app.js serve
WorkingDirectory=${CURRENT_DIRECTORY}
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=realtimebus

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable realtimebus.service