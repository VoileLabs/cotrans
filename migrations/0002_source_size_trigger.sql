-- Migration number: 0002 	 2023-07-14T20:52:24.994Z

DROP TRIGGER IF EXISTS update_source_updated_at;

CREATE TRIGGER update_source_updated_at
AFTER UPDATE OF id, hash, file, size, width, height ON source_image
FOR EACH ROW
BEGIN
  UPDATE source_image SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
