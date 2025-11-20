-- Authentication and Authorization Schema
-- Supports users, roles, permissions, API keys, sessions, MFA, and audit logs

-- Users table
CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    password_hash VARCHAR(255), -- NULL for OAuth-only users
    name VARCHAR(255),
    picture_url VARCHAR(500),
    organization_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    is_locked BOOLEAN DEFAULT FALSE,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMPTZ,
    CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_org ON users(organization_id);
CREATE INDEX idx_users_active ON users(is_active) WHERE is_active = TRUE;

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
    organization_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    plan VARCHAR(50) DEFAULT 'free', -- free, pro, enterprise
    settings JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_organizations_slug ON organizations(slug);

-- Roles table
CREATE TABLE IF NOT EXISTS roles (
    role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT FALSE, -- System roles cannot be deleted
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Permissions table
CREATE TABLE IF NOT EXISTS permissions (
    permission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    resource VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_resource_action UNIQUE (resource, action)
);

-- Role-Permission mapping
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id UUID REFERENCES roles(role_id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(permission_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (role_id, permission_id)
);

-- User-Role mapping
CREATE TABLE IF NOT EXISTS user_roles (
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(role_id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(organization_id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    granted_by UUID REFERENCES users(user_id),
    expires_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, role_id, organization_id)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_org ON user_roles(organization_id);

-- API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
    key_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(organization_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    hashed_key VARCHAR(64) UNIQUE NOT NULL,
    prefix VARCHAR(10) NOT NULL,
    scopes TEXT[] DEFAULT ARRAY[]::TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES users(user_id),
    revocation_reason TEXT,
    CONSTRAINT valid_expiry CHECK (expires_at IS NULL OR expires_at > created_at)
);

CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_hash ON api_keys(hashed_key);
CREATE INDEX idx_api_keys_prefix ON api_keys(prefix);
CREATE INDEX idx_api_keys_active ON api_keys(user_id, revoked_at) WHERE revoked_at IS NULL;

-- MFA Settings table
CREATE TABLE IF NOT EXISTS mfa_settings (
    user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    mfa_enabled BOOLEAN DEFAULT FALSE,
    totp_secret VARCHAR(255),
    backup_codes TEXT[], -- Encrypted backup codes
    created_at TIMESTAMPTZ DEFAULT NOW(),
    enabled_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    mfa_verified BOOLEAN DEFAULT FALSE,
    CONSTRAINT valid_session_expiry CHECK (expires_at > created_at)
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_active ON sessions(user_id, revoked_at, expires_at)
    WHERE revoked_at IS NULL AND expires_at > NOW();

-- OAuth Providers table
CREATE TABLE IF NOT EXISTS oauth_providers (
    provider_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_name VARCHAR(50) NOT NULL, -- keycloak, auth0, google, github
    provider_user_id VARCHAR(255) NOT NULL,
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    profile_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_provider_user UNIQUE (provider_name, provider_user_id)
);

CREATE INDEX idx_oauth_providers_user ON oauth_providers(user_id);

-- User Consents (GDPR)
CREATE TABLE IF NOT EXISTS user_consents (
    consent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    consent_type VARCHAR(100) NOT NULL, -- marketing, analytics, data_processing
    granted BOOLEAN NOT NULL,
    granted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    ip_address INET,
    user_agent TEXT,
    version VARCHAR(50),
    CONSTRAINT valid_consent_dates CHECK (
        (granted = TRUE AND granted_at IS NOT NULL) OR
        (granted = FALSE AND revoked_at IS NOT NULL)
    )
);

CREATE INDEX idx_user_consents_user ON user_consents(user_id);
CREATE INDEX idx_user_consents_type ON user_consents(user_id, consent_type);

-- Audit Logs table (using TimescaleDB hypertable)
CREATE TABLE IF NOT EXISTS audit_logs (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    action VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    user_id UUID,
    user_email VARCHAR(255),
    organization_id UUID,
    resource_type VARCHAR(100),
    resource_id UUID,
    ip_address INET,
    user_agent TEXT,
    session_id UUID,
    details JSONB,
    result VARCHAR(20), -- success, failure
    error_message TEXT
);

-- Convert to hypertable for time-series optimization
SELECT create_hypertable('audit_logs', 'timestamp', if_not_exists => TRUE);

-- Create indexes for audit logs
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, timestamp DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action, timestamp DESC);
CREATE INDEX idx_audit_logs_org ON audit_logs(organization_id, timestamp DESC);
CREATE INDEX idx_audit_logs_severity ON audit_logs(severity) WHERE severity IN ('warning', 'critical');

-- Insert default roles
INSERT INTO roles (name, description, is_system) VALUES
    ('super_admin', 'Super Administrator with full system access', TRUE),
    ('admin', 'Administrator with organization-level access', TRUE),
    ('analyst', 'Data Analyst with read/write access to analytics', TRUE),
    ('developer', 'Developer with API access', TRUE),
    ('viewer', 'Read-only access to dashboards', TRUE),
    ('api_client', 'Programmatic API access', TRUE)
ON CONFLICT (name) DO NOTHING;

-- Insert default permissions
INSERT INTO permissions (name, resource, action, description) VALUES
    ('event:read', 'event', 'read', 'Read events'),
    ('event:write', 'event', 'write', 'Create/update events'),
    ('event:delete', 'event', 'delete', 'Delete events'),
    ('metrics:read', 'metrics', 'read', 'Read metrics'),
    ('metrics:write', 'metrics', 'write', 'Create/update metrics'),
    ('metrics:delete', 'metrics', 'delete', 'Delete metrics'),
    ('dashboard:read', 'dashboard', 'read', 'View dashboards'),
    ('dashboard:write', 'dashboard', 'write', 'Create/update dashboards'),
    ('dashboard:delete', 'dashboard', 'delete', 'Delete dashboards'),
    ('user:read', 'user', 'read', 'View users'),
    ('user:write', 'user', 'write', 'Create/update users'),
    ('user:delete', 'user', 'delete', 'Delete users'),
    ('org:read', 'org', 'read', 'View organization'),
    ('org:write', 'org', 'write', 'Update organization'),
    ('org:delete', 'org', 'delete', 'Delete organization'),
    ('api_key:read', 'api_key', 'read', 'View API keys'),
    ('api_key:write', 'api_key', 'write', 'Create/update API keys'),
    ('api_key:delete', 'api_key', 'delete', 'Revoke API keys'),
    ('system:config', 'system', 'config', 'Configure system settings'),
    ('system:audit', 'system', 'audit', 'View audit logs')
ON CONFLICT (resource, action) DO NOTHING;

-- Assign permissions to roles
DO $$
DECLARE
    super_admin_id UUID;
    admin_id UUID;
    analyst_id UUID;
    developer_id UUID;
    viewer_id UUID;
    api_client_id UUID;
BEGIN
    -- Get role IDs
    SELECT role_id INTO super_admin_id FROM roles WHERE name = 'super_admin';
    SELECT role_id INTO admin_id FROM roles WHERE name = 'admin';
    SELECT role_id INTO analyst_id FROM roles WHERE name = 'analyst';
    SELECT role_id INTO developer_id FROM roles WHERE name = 'developer';
    SELECT role_id INTO viewer_id FROM roles WHERE name = 'viewer';
    SELECT role_id INTO api_client_id FROM roles WHERE name = 'api_client';

    -- Super admin gets all permissions
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT super_admin_id, permission_id FROM permissions
    ON CONFLICT DO NOTHING;

    -- Admin permissions
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT admin_id, permission_id FROM permissions
    WHERE name IN (
        'event:read', 'event:write', 'event:delete',
        'metrics:read', 'metrics:write',
        'dashboard:read', 'dashboard:write', 'dashboard:delete',
        'user:read', 'user:write',
        'org:read', 'org:write',
        'api_key:read', 'api_key:write',
        'system:audit'
    )
    ON CONFLICT DO NOTHING;

    -- Analyst permissions
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT analyst_id, permission_id FROM permissions
    WHERE name IN (
        'event:read', 'event:write',
        'metrics:read', 'metrics:write',
        'dashboard:read', 'dashboard:write'
    )
    ON CONFLICT DO NOTHING;

    -- Developer permissions
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT developer_id, permission_id FROM permissions
    WHERE name IN (
        'event:read', 'event:write',
        'metrics:read',
        'dashboard:read',
        'api_key:read', 'api_key:write'
    )
    ON CONFLICT DO NOTHING;

    -- Viewer permissions
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT viewer_id, permission_id FROM permissions
    WHERE name IN (
        'event:read',
        'metrics:read',
        'dashboard:read'
    )
    ON CONFLICT DO NOTHING;

    -- API client permissions
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT api_client_id, permission_id FROM permissions
    WHERE name IN (
        'event:read', 'event:write',
        'metrics:read'
    )
    ON CONFLICT DO NOTHING;
END $$;

-- Create retention policy for audit logs (keep 7 years for compliance)
SELECT add_retention_policy('audit_logs', INTERVAL '7 years', if_not_exists => TRUE);

-- Create continuous aggregate for audit log summary (hourly)
CREATE MATERIALIZED VIEW IF NOT EXISTS audit_logs_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', timestamp) AS hour,
    action,
    severity,
    result,
    COUNT(*) AS count
FROM audit_logs
GROUP BY hour, action, severity, result
WITH NO DATA;

-- Refresh policy for continuous aggregate
SELECT add_continuous_aggregate_policy('audit_logs_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE users IS 'User accounts with authentication details';
COMMENT ON TABLE organizations IS 'Multi-tenant organizations';
COMMENT ON TABLE roles IS 'RBAC roles';
COMMENT ON TABLE permissions IS 'Granular permissions';
COMMENT ON TABLE api_keys IS 'API key authentication';
COMMENT ON TABLE mfa_settings IS 'Multi-factor authentication settings';
COMMENT ON TABLE sessions IS 'Active user sessions';
COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail for compliance (SOC 2, GDPR, HIPAA)';
COMMENT ON TABLE user_consents IS 'GDPR consent management';
