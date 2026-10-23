-- Migration: Add is_multiple to field_definitions
-- Enables multi-value text fields (Add another button in edit form)

ALTER TABLE field_definitions ADD COLUMN IF NOT EXISTS is_multiple BOOLEAN NOT NULL DEFAULT false;
