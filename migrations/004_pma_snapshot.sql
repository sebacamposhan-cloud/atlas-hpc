-- Documentary snapshot in its OWN derived database; never applied to original Atlas files.
CREATE TABLE pma_sources(sha256 TEXT PRIMARY KEY, metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)));
CREATE TABLE pma_observations(
 id TEXT PRIMARY KEY, source_sha256 TEXT NOT NULL REFERENCES pma_sources(sha256),
 sheet TEXT NOT NULL, source_row INTEGER NOT NULL, code TEXT, level TEXT,
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)), UNIQUE(source_sha256,sheet,source_row)
);
CREATE INDEX pma_code_level ON pma_observations(code,level);
CREATE TABLE pma_legends(source_sha256 TEXT NOT NULL REFERENCES pma_sources(sha256),
 sheet TEXT NOT NULL, source_row INTEGER NOT NULL, payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 PRIMARY KEY(source_sha256,sheet,source_row));
