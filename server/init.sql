-- Database Initialization Script for Auto-Tauri

-- Organizations Table (must be created before Users due to foreign key)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    balance BIGINT NOT NULL DEFAULT 0,
    billing_admin_id UUID,     -- Will add constraint after users table is created
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    balance BIGINT NOT NULL DEFAULT 0,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'user',
    is_blacklisted BOOLEAN NOT NULL DEFAULT false,
    llm_provider VARCHAR(64) DEFAULT 'TaskMaster',
    llm_model VARCHAR(64) DEFAULT 'auto',
    llm_api_key VARCHAR(255),
    llm_base_url VARCHAR(255) DEFAULT 'https://openrouter.ai/api/v1',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key constraint for billing_admin_id after users table exists
-- Note: Use DO block to prevent error if constraint already exists
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_organizations_billing_admin') THEN
        ALTER TABLE organizations ADD CONSTRAINT fk_organizations_billing_admin 
            FOREIGN KEY (billing_admin_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    amount BIGINT NOT NULL,
    type VARCHAR(32) NOT NULL,
    description VARCHAR(512),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_transactions FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Projects Table (New Core Table)
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    url TEXT,
    prompt TEXT NOT NULL,
    type VARCHAR(32) NOT NULL DEFAULT 'workflow',
    screenshot BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_projects FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Tasks Table (Execution Records)
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL,
    user_id UUID NOT NULL,
    prompt TEXT NOT NULL,
    type VARCHAR(32) NOT NULL DEFAULT 'workflow',
    status VARCHAR(32) NOT NULL,
    cost BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_tasks FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_projects_tasks FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);

-- Materials Table
CREATE TABLE IF NOT EXISTS materials (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    project_id UUID,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(32) NOT NULL DEFAULT 'text',
    content TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_materials FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_projects_materials FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_materials_user_id ON materials(user_id);
CREATE INDEX IF NOT EXISTS idx_materials_project_id ON materials(project_id);

-- Organization User Blacklist Table
CREATE TABLE IF NOT EXISTS org_user_blacklist (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_by UUID NOT NULL REFERENCES users(id),
    reason VARCHAR(512),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_blacklist_org_id ON org_user_blacklist(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_blacklist_user_id ON org_user_blacklist(user_id);
