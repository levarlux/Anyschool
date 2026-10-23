-- Migration: Add unique constraint on field_values for upsert
-- Allows onConflictDoUpdate in upsertFieldValues to work correctly

CREATE UNIQUE INDEX IF NOT EXISTS idx_field_values_entity_record_field_def
  ON field_values(entity_record_id, field_definition_id);
