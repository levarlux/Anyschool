-- Add indexes for field_values and relationship_records to speed up list queries
CREATE INDEX IF NOT EXISTS idx_field_values_school_record ON field_values (school_id, entity_record_id);
CREATE INDEX IF NOT EXISTS idx_field_values_field_record ON field_values (field_definition_id, entity_record_id);
CREATE INDEX IF NOT EXISTS idx_relationship_records_def_ids ON relationship_records (relationship_definition_id, from_entity_record_id);
CREATE INDEX IF NOT EXISTS idx_relationship_records_def_to ON relationship_records (relationship_definition_id, to_entity_record_id);
CREATE INDEX IF NOT EXISTS idx_relationship_records_school ON relationship_records (school_id);
