-- Reviewed geometry is append-only; original observations and their payloads stay intact.
CREATE TABLE IF NOT EXISTS atlas_geometry_revisions(
 id TEXT PRIMARY KEY,
 observation_id TEXT NOT NULL REFERENCES atlas_room_observations(id),
 source_id TEXT NOT NULL REFERENCES atlas_sources(id),
 source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
 page INTEGER NOT NULL CHECK(page>0),
 coordinate_system TEXT NOT NULL CHECK(coordinate_system='rotated PDF page points'),
 geometry_json TEXT NOT NULL CHECK(json_valid(geometry_json) AND coalesce(json_extract(geometry_json,'$.type') IN ('Polygon','MultiPolygon'),0)),
 status TEXT NOT NULL CHECK(status IN ('pending','verified','rejected')),
 at TEXT NOT NULL,
 responsible TEXT NOT NULL CHECK(length(trim(responsible))>0),
 reason TEXT NOT NULL CHECK(length(trim(reason))>0),
 payload_hash TEXT NOT NULL,
 previous_revision_id TEXT REFERENCES atlas_geometry_revisions(id)
);
CREATE INDEX IF NOT EXISTS atlas_geometry_observation_time ON atlas_geometry_revisions(observation_id,at);
CREATE TRIGGER IF NOT EXISTS atlas_geometry_source_match BEFORE INSERT ON atlas_geometry_revisions
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM atlas_room_observations o JOIN atlas_sources s ON s.id=o.source_id WHERE o.id=NEW.observation_id AND o.source_id=NEW.source_id AND s.sha256=NEW.source_sha256) THEN RAISE(ABORT,'Geometry source/observation/hash mismatch') END;
 SELECT CASE WHEN NEW.previous_revision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM atlas_geometry_revisions r WHERE r.id=NEW.previous_revision_id AND r.observation_id=NEW.observation_id) THEN RAISE(ABORT,'Geometry predecessor mismatch') END;
END;
CREATE TRIGGER IF NOT EXISTS atlas_geometry_no_update BEFORE UPDATE ON atlas_geometry_revisions BEGIN SELECT RAISE(ABORT,'Geometry revisions are append-only'); END;
CREATE TRIGGER IF NOT EXISTS atlas_geometry_no_delete BEFORE DELETE ON atlas_geometry_revisions BEGIN SELECT RAISE(ABORT,'Geometry revisions are append-only'); END;
INSERT OR IGNORE INTO atlas_schema_migrations VALUES(3,strftime('%Y-%m-%dT%H:%M:%SZ','now'));
