## SASA SpA-AG Realtime Server

RealtimeServer is the backend code of [http://realtime.opensasa.info](http://realtime.opensasa.info). 
It provides real time positions of the public transport vehicles managed by SASA SpA-AG in South Tyrol. 

<br>

### Architecture

The Server is written in [NodeJs](https://nodejs.org/) and is backed by a [PostgreSQL](https://www.postgresql.org) database.
The RESTful interface is done using [Express.js](https://expressjs.com)

It uses Open Data provided by SASA. The documentation about it can be found [here](http://opensasa.info)

### Install

If you want to install this project, please refer to our [installation instructions](INSTALL.md)

### Built With

- [NodeJs](https://nodejs.org/) - The web framework used
- [Express.js](https://expressjs.com) - RESTful interface
- [PostgreSQL](https://www.postgresql.org) - Database
- [PostGIS](http://postgis.net) - Spatial database extender for PostgreSQL

### Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests to us.

### Versioning

We use [SemVer](http://semver.org) for versioning. For the versions available, see the tags on this repository.

### Team Members

- "Markus Windegger" - <windegger@sasabz.it>
- "Patrick Bertolla" - <patrick.bertolla@idm-suedtirol.com>
- "David Dejori" - <dejoridavid@gmail.com>
- "Alex Lardschneider" - <alex.lardschneider@gmail.com>

### License

This project is licensed under the Apache 2.0 License - see the [LICENSE.md](LICENSE.md) file for details.