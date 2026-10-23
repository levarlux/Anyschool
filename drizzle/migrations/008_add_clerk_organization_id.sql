-- Maps a Clerk Organization to exactly one AnySchool tenant.
-- Nullable for existing installations until each existing school is claimed.
ALTER TABLE schools ADD COLUMN IF NOT EXISTS clerk_organization_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_schools_clerk_organization_id
  ON schools(clerk_organization_id)
  WHERE clerk_organization_id IS NOT NULL;
