SET @add_session_column = IF(
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'games' AND column_name = 'session_id') = 0,
    'ALTER TABLE games ADD COLUMN session_id CHAR(36) NULL',
    'SELECT 1'
);
PREPARE migration_statement FROM @add_session_column;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @add_session_index = IF(
    (SELECT COUNT(*) FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = 'games' AND index_name = 'unique_game_session') = 1
    AND
    (SELECT COUNT(*) FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = 'games' AND index_name = 'unique_game_session'
       AND column_name = 'session_id' AND seq_in_index = 1 AND non_unique = 0) = 1,
    'SELECT 1',
    'ALTER TABLE games ADD UNIQUE KEY unique_game_session (session_id)'
);
PREPARE migration_statement FROM @add_session_index;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;
