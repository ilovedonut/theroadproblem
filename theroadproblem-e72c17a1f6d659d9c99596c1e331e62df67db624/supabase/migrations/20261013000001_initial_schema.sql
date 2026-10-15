-- ====================================================================
-- Migration: 001_initial_schema.sql
-- Project: theroadproblem.quest
-- Description: Core schema, PostGIS types, RLS, indexes, and atomic domain RPC functions
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- --------------------------------------------------------------------
-- 1. DATA SOURCES & AUDIT REGISTRY
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    publisher TEXT NOT NULL,
    base_uri TEXT NOT NULL,
    license TEXT NOT NULL,
    retrieval_method TEXT NOT NULL,
    update_frequency TEXT NOT NULL,
    terms_reviewed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS source_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
    external_key TEXT NOT NULL,
    source_uri TEXT NOT NULL,
    raw_content JSONB NOT NULL,
    checksum_sha256 TEXT NOT NULL,
    parse_version TEXT NOT NULL,
    retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_source_record_version UNIQUE (source_id, external_key, checksum_sha256)
);

-- --------------------------------------------------------------------
-- 2. ROADS, SEGMENTS & LINEAGE
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    ref TEXT,
    road_class TEXT NOT NULL,
    authority_name TEXT,
    state TEXT NOT NULL,
    district TEXT,
    source_id UUID REFERENCES data_sources(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS road_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    road_id UUID NOT NULL REFERENCES roads(id) ON DELETE CASCADE,
    geom GEOMETRY(LineString, 4326) NOT NULL,
    chainage_from NUMERIC,
    chainage_to NUMERIC,
    state TEXT NOT NULL,
    district TEXT NOT NULL,
    local_body TEXT,
    osm_ids BIGINT[] DEFAULT '{}',
    length_m NUMERIC NOT NULL,
    version INT NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS road_segment_lineage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    segment_id UUID NOT NULL REFERENCES road_segments(id) ON DELETE CASCADE,
    parent_segment_id UUID REFERENCES road_segments(id) ON DELETE SET NULL,
    transition_type TEXT NOT NULL, -- 'initial', 'split', 'merge', 'geometry_update'
    reason TEXT,
    source_version TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --------------------------------------------------------------------
-- 3. LOCALITIES (Administrative Directory)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS localities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    name_hi TEXT,
    state TEXT NOT NULL,
    district TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('city', 'ward', 'town', 'village', 'junction')),
    center GEOMETRY(Point, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --------------------------------------------------------------------
-- 4. USERS & PROFILES (Privacy-safe civic profile)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    display_name TEXT,
    email_private TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'citizen' CHECK (role IN ('citizen', 'verifier', 'moderator', 'admin')),
    is_anonymous_public BOOLEAN NOT NULL DEFAULT FALSE,
    reputation INT NOT NULL DEFAULT 0,
    locale TEXT NOT NULL DEFAULT 'en',
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --------------------------------------------------------------------
-- 5. INCIDENTS (Shared civic problem episodes)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    road_segment_id UUID REFERENCES road_segments(id) ON DELETE SET NULL,
    category TEXT NOT NULL CHECK (category IN ('pothole', 'dug_open', 'damaged_surface', 'flooded', 'unsafe_workzone', 'debris_blockage', 'collapsed_culvert', 'other')),
    lifecycle_status TEXT NOT NULL DEFAULT 'active' CHECK (lifecycle_status IN ('active', 'repair_reported', 'resolved')),
    verification_state TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_state IN ('unverified', 'corroborated', 'field_reviewed', 'disputed', 'resolved', 'stale')),
    predecessor_incident_id UUID REFERENCES incidents(id) ON DELETE SET NULL,
    first_observed_at TIMESTAMPTZ NOT NULL,
    last_observed_at TIMESTAMPTZ NOT NULL,
    resolved_at TIMESTAMPTZ,
    centroid GEOMETRY(Point, 4326) NOT NULL,
    merged_into_incident_id UUID REFERENCES incidents(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --------------------------------------------------------------------
-- 6. REPORTS (Citizen observations)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    road_segment_id UUID REFERENCES road_segments(id) ON DELETE SET NULL,
    observed_point GEOMETRY(Point, 4326) NOT NULL,
    snap_distance_m NUMERIC,
    category TEXT NOT NULL,
    observed_status TEXT NOT NULL CHECK (observed_status IN ('dug_open', 'partially_blocked', 'damaged', 'pothole', 'flooded', 'unsafe_workzone', 'temporary_restoration', 'repaired', 'deteriorated', 'normal', 'unknown')),
    description TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    idempotency_key TEXT,
    publication_status TEXT NOT NULL DEFAULT 'published' CHECK (publication_status IN ('pending_checks', 'published', 'held', 'rejected', 'removed')),
    moderation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_idempotency 
ON reports (reporter_id, idempotency_key) 
WHERE idempotency_key IS NOT NULL;

-- --------------------------------------------------------------------
-- 7. REPORT MEDIA (Quarantine, review & derivative storage)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    storage_key_quarantine TEXT NOT NULL,
    storage_key_derivative TEXT,
    mime_type TEXT NOT NULL,
    file_size_bytes INT NOT NULL,
    sha256 TEXT NOT NULL,
    width INT,
    height INT,
    review_status TEXT NOT NULL DEFAULT 'quarantined' CHECK (review_status IN ('quarantined', 'approved', 'rejected', 'redacted', 'removed')),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --------------------------------------------------------------------
-- 8. CORROBORATIONS (Anti-inflation evidence confirmations)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS corroborations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    observation_time TIMESTAMPTZ NOT NULL,
    verdict TEXT NOT NULL CHECK (verdict IN ('confirms_problem', 'confirms_repair', 'disputes_problem')),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_actor_incident_corroboration UNIQUE (incident_id, actor_id)
);

-- --------------------------------------------------------------------
-- 9. CONTRACTORS & PUBLIC WORKS (Official records)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contractors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    vendor_identifier TEXT,
    cin TEXT,
    gstin TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS works (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    authority_name TEXT NOT NULL,
    tender_id TEXT,
    contract_id TEXT,
    package_name TEXT NOT NULL,
    work_type TEXT NOT NULL,
    official_status TEXT NOT NULL CHECK (official_status IN ('planned', 'tendered', 'awarded', 'mobilized', 'in_progress', 'officially_completed', 'maintenance', 'cancelled', 'unknown')),
    start_date DATE,
    target_completion_date DATE,
    actual_completion_date DATE,
    contract_value_inr NUMERIC,
    defect_liability_end_date DATE,
    source_record_id UUID REFERENCES source_records(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS work_segments (
    work_id UUID NOT NULL REFERENCES works(id) ON DELETE CASCADE,
    road_segment_id UUID NOT NULL REFERENCES road_segments(id) ON DELETE CASCADE,
    chainage_start_km NUMERIC,
    chainage_end_km NUMERIC,
    PRIMARY KEY (work_id, road_segment_id)
);

CREATE TABLE IF NOT EXISTS work_contractors (
    work_id UUID NOT NULL REFERENCES works(id) ON DELETE CASCADE,
    contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'primary_contractor' CHECK (role IN ('primary_contractor', 'subcontractor', 'maintenance_concessionaire', 'supervision_consultant')),
    confidence TEXT NOT NULL DEFAULT 'verified_contract' CHECK (confidence IN ('verified_contract', 'letter_of_award', 'provisional_match')),
    source_record_id UUID REFERENCES source_records(id),
    PRIMARY KEY (work_id, contractor_id)
);

-- --------------------------------------------------------------------
-- 10. EVENTS (Append-only Civic Audit History)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL CHECK (entity_type IN ('incident', 'report', 'work', 'road_segment', 'contractor', 'corroboration')),
    entity_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    old_state JSONB,
    new_state JSONB,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_record_id UUID REFERENCES source_records(id) ON DELETE SET NULL,
    reason TEXT
);

-- --------------------------------------------------------------------
-- 11. MODERATION & DISPUTES
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS moderation_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type TEXT NOT NULL CHECK (target_type IN ('report', 'incident', 'media', 'contractor_link')),
    target_id UUID NOT NULL,
    moderator_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action TEXT NOT NULL CHECK (action IN ('approve', 'hold', 'reject', 'remove', 'merge', 'split', 'resolve', 'reopen')),
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL CHECK (entity_type IN ('report', 'work_contractor', 'incident')),
    entity_id UUID NOT NULL,
    claimant_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    claimant_role TEXT NOT NULL CHECK (claimant_role IN ('citizen', 'contractor', 'authority')),
    dispute_reason TEXT NOT NULL,
    evidence_text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'upheld', 'rejected')),
    reviewed_by UUID REFERENCES users(id),
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- --------------------------------------------------------------------
-- 12. INDEXES
-- --------------------------------------------------------------------
-- Spatial GiST
CREATE INDEX IF NOT EXISTS idx_road_segments_geom ON road_segments USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_incidents_centroid ON incidents USING GIST (centroid);
CREATE INDEX IF NOT EXISTS idx_reports_observed_point ON reports USING GIST (observed_point);
CREATE INDEX IF NOT EXISTS idx_localities_center ON localities USING GIST (center);

-- Trigram Text Search
CREATE INDEX IF NOT EXISTS idx_roads_name_trgm ON roads USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_roads_ref ON roads (ref);
CREATE INDEX IF NOT EXISTS idx_localities_name_trgm ON localities USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contractors_name_trgm ON contractors USING GIN (normalized_name gin_trgm_ops);

-- Performance & Foreign Keys
CREATE INDEX IF NOT EXISTS idx_road_segments_road_id ON road_segments (road_id);
CREATE INDEX IF NOT EXISTS idx_incidents_road_segment ON incidents (road_segment_id);
CREATE INDEX IF NOT EXISTS idx_incidents_lifecycle ON incidents (lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_reports_incident_id ON reports (incident_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter_id ON reports (reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_observed_at ON reports (observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_entity ON events (entity_type, entity_id, effective_at DESC);
CREATE INDEX IF NOT EXISTS idx_corroborations_incident ON corroborations (incident_id);
CREATE INDEX IF NOT EXISTS idx_works_status ON works (official_status);

-- --------------------------------------------------------------------
-- 13. ROW LEVEL SECURITY (RLS) POLICIES
-- --------------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports FORCE ROW LEVEL SECURITY;

ALTER TABLE report_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_media FORCE ROW LEVEL SECURITY;

ALTER TABLE moderation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_actions FORCE ROW LEVEL SECURITY;

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

-- Users: Anyone can view public profile details
CREATE POLICY users_public_read ON users
    FOR SELECT
    USING (deleted_at IS NULL);

-- Users can only update their own non-privileged fields (cannot change role)
CREATE POLICY users_self_update ON users
    FOR UPDATE
    USING (id = NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid)
    WITH CHECK (
        id = NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
        AND role = (SELECT u.role FROM users u WHERE u.id = id)
    );

-- Incidents: Publicly readable; mutations via server functions
CREATE POLICY incidents_public_read ON incidents
    FOR SELECT
    USING (TRUE);

-- Reports: Public can see 'published'; author can see own even if held; moderators see all
CREATE POLICY reports_public_read ON reports
    FOR SELECT
    USING (
        publication_status = 'published'
        OR reporter_id = NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
        OR EXISTS (
            SELECT 1 FROM users 
            WHERE id = NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid 
            AND role IN ('moderator', 'admin')
        )
    );

CREATE POLICY reports_insert_self ON reports
    FOR INSERT
    WITH CHECK (
        reporter_id = NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
    );

-- Media: Public only sees approved derivatives; raw quarantine only for author or mod
CREATE POLICY report_media_public_read ON report_media
    FOR SELECT
    USING (
        review_status = 'approved'
        OR EXISTS (
            SELECT 1 FROM reports r
            WHERE r.id = report_media.report_id
            AND (
                r.reporter_id = NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
                OR EXISTS (
                    SELECT 1 FROM users u
                    WHERE u.id = NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
                    AND u.role IN ('moderator', 'admin')
                )
            )
        )
    );

-- Moderation actions: Read and write strictly for moderators and admins
CREATE POLICY mod_actions_auth ON moderation_actions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE id = NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
            AND role IN ('moderator', 'admin')
        )
    );

-- --------------------------------------------------------------------
-- 14. NONPRIVILEGED APPLICATION ROLE (FOR GENUINE RLS TESTING)
-- --------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user WITH LOGIN PASSWORD 'app_user' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_user;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO app_user;


