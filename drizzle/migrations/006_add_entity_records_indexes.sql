-- Add indexes for entity_records to speed up list queries
CREATE INDEX IF NOT EXISTS idx_entity_records_school_type_deleted ON entity_records (school_id, entity_type_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_entity_records_parent ON entity_records (parent_class_id) WHERE parent_class_id IS NOT NULL;
