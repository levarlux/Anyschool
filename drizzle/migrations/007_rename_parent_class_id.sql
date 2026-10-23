-- Migration: Rename parent_class_id → parent_record_id
-- The column is a generic self-referencing hierarchy column (any entity type can
-- nest under any record of the same type). The old name was a historical artifact
-- from when only classes used it. Renaming before Doc 19 §2's shared hierarchy
-- utility is built on top of it.

ALTER TABLE entity_records RENAME COLUMN parent_class_id TO parent_record_id;

-- Rename the indexes that referenced the old column name
ALTER INDEX IF EXISTS idx_entity_records_parent_class_id RENAME TO idx_entity_records_parent_record;
ALTER INDEX IF EXISTS idx_entity_records_parent RENAME TO idx_entity_records_parent_record_v2;

-- Rebuild the index with the correct column name in case the old one was dropped
DROP INDEX IF EXISTS idx_entity_records_parent_record;
DROP INDEX IF EXISTS idx_entity_records_parent_record_v2;
CREATE INDEX idx_entity_records_parent_record ON entity_records(parent_record_id) WHERE parent_record_id IS NOT NULL;
