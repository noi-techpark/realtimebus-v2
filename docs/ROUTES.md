## Guidelines for the definition of bus routes using CSV+KML

The following document contains the complete guideline for ensuring the consistency and the correct import/association of bus routes via a combination of CSV (also called "mapping") and KML (also referred to as "paths") files.

### Files

The structure of the CSV file has to be as follows

    ID;Abbreviazione;Teilstuecke
    1;1 BZ;1 BZ / andata, 1 BZ / ritorno
    2;3 BZ;3 BZ / route

where `Abbreviazione` contains the exact name/encoding of the bus route, `Teilstuecke` on the other hand contains a comma-separated list of path names/references.

The KML file has to be a valid XML file and needs to adhere to the respective schemas. The path name needs to be encoded using the `<name/>` element/tag and the actual path needs to be encoded using a single `<LineString/>`.

### Checks/Constraints

During the import procedure the following checks and constraints will be performed/enforced

* All path names referenced in the mapping file (CSV) must exist in the paths file (KML)
* All lines/routes (with respect to the VDV) need to have at least one entry in the mapping file (CSV)
* Each path in the paths file (KML) referened in the mapping file (CSV) has to be complete from beginning to end
* Each line in the mapping file (CSV) needs at least one path and can contain at most two paths (in case of going/return variants)
* Paths can also be drawn/defined before the first stop or after the last stop of the route - the beginning and end of the path don't have to coincide with the route's stops
* The defined path has to be sufficiently close (determined by a heuristic distance check) to the stop's coordinate