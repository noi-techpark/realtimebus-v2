# TODO

- [X] Separate data server from mobility.meran.eu - Patrick B.
- [ ] PostgreSQL, PostGIS, ~~PHP~~, MapServer upgrade 
- [~] Set up new database, import dumped data from original realtimebus
- [X] Implement new receiver classes
- [ ] Update drawn bus lines and add missing one
- [X] ~~Convert stored procedures to business logic in code~~


### Automation

- [ ] Automate VDV upload & import
- [ ] Dynamic bus lines attributes


#### API /v1

- [X] Implement substitution of old controllers (/positions, /stops, ...) as API /v1


#### API /v2

- [ ] Create API /v2
    - [ ] implement new APIs for planned data in gtfs
    - [ ] implement new APIs for realtime data in gtfs-r
    
    
#### API /app

- [ ] Create API /app
    - [ ] implement new APIs for planned data in data-overhead-friendly format
    - [ ] implement new APIs for realtime data in data-overhead-friendly format