-- Migration number: 0000 	 2023-07-09T09:49:35.518Z

CREATE TABLE IF NOT EXISTS source_image (
  id TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  file TEXT NOT NULL UNIQUE,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  dummy INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_source_updated_at
AFTER UPDATE OF id, hash, file, width, height ON source_image
FOR EACH ROW
BEGIN
  UPDATE source_image SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS task (
  id TEXT PRIMARY_KEY,
  source_image_id TEXT NOT NULL,
  target_language INTEGER NOT NULL,
  detector INTEGER NOT NULL,
  direction INTEGER NOT NULL,
  translator INTEGER NOT NULL,
  size INTEGER NOT NULL,
  state INTEGER NOT NULL DEFAULT 1,
  last_attempted_at DATETIME,
  worker_revision INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  translation_mask TEXT,
  dummy INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_task_updated_at
AFTER UPDATE OF id, source_image_id, target_language, detector, direction, translator, size, state, last_attempted_at, worker_revision, failed_count, translation_mask ON task
FOR EACH ROW
BEGIN
  UPDATE task SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE UNIQUE INDEX ix_task_source_params_revision ON task (source_image_id, target_language, detector, direction, translator, size, worker_revision);
