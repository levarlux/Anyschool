-- Migration: Add parent_class_id to entity_records
-- This is an additive-only, nullable column — safe to run on existing data.

ALTER TABLE entity_records ADD COLUMN IF NOT EXISTS parent_class_id UUID REFERENCES entity_records(id);
CREATE INDEX IF NOT EXISTS idx_entity_records_parent_class_id ON entity_records(parent_class_id) WHERE parent_class_id IS NOT NULL;
