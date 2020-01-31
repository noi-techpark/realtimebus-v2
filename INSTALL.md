# Table of contents

* [Platforms](#platforms)
* [Get the source code](#get-the-source-code)
* [Dependencies](#dependencies)
    * [Node dependencies](#node-dependencies)
* [Running the project](#running-the-project)
  * [Troubleshooting](#troubleshooting)

<br/>

# Platforms

You should be able to compile RealtimeServer successfully on the following
platforms:

* Linux with at least 8GB of RAM

<br/>

# Get the source code

You can clone the repository and all its submodules using the
following command:

    git clone https://github.com/noi-techpark/realtimebus-v2.git
To update an existing clone you can use the following commands:

    cd realtimebus
    git pull
    git submodule update --init --recursive

<br/>

# Quickstart

This section explains the quickest and automatic way to setup the project. First of all, you have to configure a `local-config.js` file in the project's folder by using the following snippet as a starting point:

    exports.database = {
        // database name and credentials
        name: 'realtimebus',
        username: 'realtimebus',
        password: 's3cret'
    }

    exports.application = {
        // publicly accessible url of the server
        baseUrl: 'http://127.0.0.1'
    }

    exports.vdv = {
        // credentials used for the remote update of VDV
        username: 'vdv',
        password: 's3cret'
    }

If you use a Debian-based system, you can use the provided script `tools/setup.sh` from the folder to quickly bootstrap the project and automate most of the required steps. This script will

* Install and configure required software packages
* Download and update the project's dependencies
* Configure the database and database user
* Setup the initial state and data of the database
* Create and configure a system service called `realtimebus`

You can fully update the data based on the latest VDV and CSV/KML assets by using the following script from the server directly (which of course requires that the service is running):

    bash ./tools/import-vdv-and-geometries.sh \
        <vdv file or url> \
        <csv file or url> \
        <kml file or url>

If you just want to import the VDV data (without the complete route geometries) you can use

    bash ./tools/import-vdv.sh <vdv file or url>

That's it, after these steps you can start or stop the service using the system command

* `sudo service realtimebus start`
* `sudo service realtimebus stop`
* `sudo service realtimebus status`

<br/>

# Setup

In the following sections you'll find more in-depth details about the required setup. Refer to the [Quickstart](#Quickstart) section for setting the server up quickly.

## Dependencies

To run RealtimeServer you will need:

* The latest version of [NodeJs](https://nodejs.org/en/) (Tested on v4.2.6)
* The latest version of [PostgreSQL](https://www.postgresql.org) (9.5 or greater)
* The latest version of [PostGIS](http://postgis.net) (2.2 or greater)
* The latest version of [MapServer](mapserver) (2.2 or greater) (optional)

You can install all needed dependencies using the following command:

    sudo apt install nodejs npm postgresql postgresql-server-dev-9.5 postgis recode

If you want to serve bus path overlays to use on a map (OSM, Google Maps), you need to install MapServer.
Please refer to the [official installation guide](http://www.mapserver.org/installation/index.html) for help.

<br/>

## Node dependencies

To install all needed NodeJs dependencies run the following command in your project directory:

    npm install

<br/>

## Importing data

To run this server you need to import the VDV data first. This is done in three steps:

1. Make sure that the schemas `data` and `beacons` do not exist. If they do, drop them:

        DROP SCHEMA data CASCADE;
        DROP SCHEMA beacons CASCADE;

2. Import the database schemas `beacons.sql` and `data.sql`, including all `changelog-*` scripts:

        psql database_name < schema.sql
        psql database_name < changelog-v01.sql
        psql database_name < changelog-v02.sql

3. Import the VDV data. Download the latest version of the VDV data from [here](http://open.sasabz.it/files/vdv.zip).
Upload the data by executing a POST request to the VDV-endpoint or command tool/script like follows:

        curl --header "Content-Type:application/octet-stream"\
             --data-binary @/path/to/vdv.zip \
             --user USR:PWD \
             http://HOST/vdv/import

        bash ./tools/import-vdv.sh <vdv file or url>

The import may take a while, please be patient. After the import is completed, the server will respond to your request with the validity dates for the uploaded VDV data. The credentials used for this command have to match with the ones defined in `local-config.js`.

To re-import the VDV data you only need to perform step 3. The existing tables will be truncated automatically. You can also perform this step from the server directly, by running the `tools/update-vdv.sh` script.

If you want also to import the paths/geometries, you can use a different endpoint or one of the tools located in the server's tools folder

    curl --header "Content-Type:application/octet-stream" \
         --data-binary @/path/to/payload.json \
         --user USR:PWD \
         http://HOST/v2/import

    bash ./tools/import-vdv.sh \
            <vdv file or url> \
            <csv file or url> \
            <kml file or url>

<br/>

# Running the project

1. Enter the project directory and execute `node`:

        cd ~/RealtimeServer
        node app.js

2. The server should now be running on port 80 and can be accessed using:

        curl http://localhost/geojson/realtime

<br/>

# Troubleshooting

The Server runs on port 80 by default. On some Linux distros listening on port 80 requires elevated permissions.

To fix this error you can either:

- Run this project using elevated permissions (Unrecommended)

        sudo node app.js serve --port=80

- Give node permission to use port 80 (Recommended)

        sudo apt-get install libcap2-bin
        sudo setcap cap_net_bind_service=+ep `readlink -f \`which node\``

    You can now launch the server using:

        node app.js serve --port=80

- Change the port to a number over 1024

    To change the port number, pass a different port when launching `app.js`

        node app.js serve --port=80