-- Row-Level Security Policies for AnySchool
-- Phase 1: Core Data Architecture

-- Enable RLS on all tenant-scoped tables
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationship_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationship_records ENABLE ROW LEVEL SECURITY;

-- Create policy function to get current school ID from session
CREATE OR REPLACE FUNCTION current_school_id()
RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.current_school_id', true), '')::UUID;
$$ LANGUAGE sql STABLE;

-- Schools: users can only see their own school
CREATE POLICY schools_isolation ON schools
  FOR ALL
  USING (id = current_school_id());

-- Entity Types: scoped to school
CREATE POLICY entity_types_isolation ON entity_types
  FOR ALL
  USING (school_id = current_school_id());

-- Sections: scoped to school
CREATE POLICY sections_isolation ON sections
  FOR ALL
  USING (school_id = current_school_id());

-- Field Definitions: scoped to school
CREATE POLICY field_definitions_isolation ON field_definitions
  FOR ALL
  USING (school_id = current_school_id());

-- Relationship Definitions: scoped to school
CREATE POLICY relationship_definitions_isolation ON relationship_definitions
  FOR ALL
  USING (school_id = current_school_id());

-- Entity Records: scoped to school
CREATE POLICY entity_records_isolation ON entity_records
  FOR ALL
  USING (school_id = current_school_id());

-- Field Values: scoped to school
CREATE POLICY field_values_isolation ON field_values
  FOR ALL
  USING (school_id = current_school_id());

-- Relationship Records: scoped to school
CREATE POLICY relationship_records_isolation ON relationship_records
  FOR ALL
  USING (school_id = current_school_id());

-- Function to set school context for database connection
CREATE OR REPLACE FUNCTION set_school_context(school_uuid UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_school_id', school_uuid::TEXT, true);
END;
$$ LANGUAGE plpgsql;