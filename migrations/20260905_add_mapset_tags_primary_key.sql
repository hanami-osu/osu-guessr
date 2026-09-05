DROP TABLE IF EXISTS mapset_tags_migration_20260905;

CREATE TABLE mapset_tags_migration_20260905 (
    mapset_id INT PRIMARY KEY,
    image_filename VARCHAR(255),
    audio_filename VARCHAR(255)
);

INSERT INTO mapset_tags_migration_20260905 (mapset_id, image_filename, audio_filename)
SELECT DISTINCT mapset_id, image_filename, audio_filename
FROM mapset_tags;

RENAME TABLE mapset_tags TO mapset_tags_before_20260905,
    mapset_tags_migration_20260905 TO mapset_tags;
