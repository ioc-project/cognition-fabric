-- Add name and version columns to cognition_engine for version-based registration
-- This enables the upgrade flow where same (cfn_id, name, version) returns 409,
-- but same name with different version creates a new CE record.

-- Add name and version columns (nullable first for backfill)
ALTER TABLE cognition_engine ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE cognition_engine ADD COLUMN IF NOT EXISTS version VARCHAR(50);

-- Backfill existing records: name = ce_type, version = "1.0.0"
UPDATE cognition_engine SET name = ce_type WHERE name IS NULL;
UPDATE cognition_engine SET version = '1.0.0' WHERE version IS NULL;

-- Make columns NOT NULL after backfill
ALTER TABLE cognition_engine ALTER COLUMN name SET NOT NULL;
ALTER TABLE cognition_engine ALTER COLUMN version SET NOT NULL;

-- Add unique constraint on (cfn_id, name, version) for non-deleted records
-- This enforces that POST with same (name, version) returns 409
CREATE UNIQUE INDEX IF NOT EXISTS uq_ce_cfn_name_version
ON cognition_engine (cfn_id, name, version)
WHERE deleted_at IS NULL;
