-- Migration Script: Add organization and blacklist features to existing database
-- Run this script if you have an existing database

-- Step 1: Create organizations table
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    balance BIGINT NOT NULL DEFAULT 0,
    billing_admin_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Add new columns to users table (using IF NOT EXISTS pattern for PostgreSQL)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'organization_id') THEN
        ALTER TABLE users ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role') THEN
        ALTER TABLE users ADD COLUMN role VARCHAR(32) NOT NULL DEFAULT 'user';
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_blacklisted') THEN
        ALTER TABLE users ADD COLUMN is_blacklisted BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;

-- Step 3: Add foreign key for billing_admin_id
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_organizations_billing_admin') THEN
        ALTER TABLE organizations ADD CONSTRAINT fk_organizations_billing_admin 
            FOREIGN KEY (billing_admin_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Step 4: Create organization blacklist table
CREATE TABLE IF NOT EXISTS org_user_blacklist (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_by UUID NOT NULL REFERENCES users(id),
    reason VARCHAR(512),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organization_id, user_id)
);

-- Step 5: Create indexes
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_blacklist_org_id ON org_user_blacklist(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_blacklist_user_id ON org_user_blacklist(user_id);

-- Done!
SELECT 'Migration completed successfully!' AS status;
