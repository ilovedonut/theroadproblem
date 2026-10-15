-- ====================================================================
-- Migration: 20261014000001_osm_road_index_and_boundary.sql
-- Description: Real administrative district boundaries, OSM source feature tracking,
--              tags/bridge/layer/service attributes, and unmatched reporting preservation.
-- ====================================================================

-- 1. Official Administrative District Boundaries
CREATE TABLE IF NOT EXISTS district_boundaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    district TEXT NOT NULL UNIQUE,
    state TEXT NOT NULL,
    osm_relation_id BIGINT,
    boundary_geom GEOMETRY(Geometry, 4326) NOT NULL,
    source TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_district_boundaries_geom ON district_boundaries USING GIST(boundary_geom);

-- 2. OSM Import Execution & Lineage Audit Ledger
CREATE TABLE IF NOT EXISTS osm_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    district TEXT NOT NULL,
    source_url TEXT NOT NULL,
    source_license TEXT NOT NULL DEFAULT 'ODbL 1.0',
    checksum_sha256 TEXT NOT NULL,
    ways_count INT NOT NULL DEFAULT 0,
    inserted_count INT NOT NULL DEFAULT 0,
    updated_count INT NOT NULL DEFAULT 0,
    skipped_count INT NOT NULL DEFAULT 0,
    coverage_status TEXT NOT NULL DEFAULT 'pilot_bounded' CHECK (coverage_status IN ('pilot_bounded', 'partial_failed', 'complete_district')),
    status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
    error_details TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_osm_imports_district ON osm_imports (district, started_at DESC);

-- 3. Detailed Source Feature & Layer Attributes on road_segments
ALTER TABLE road_segments
    ADD COLUMN IF NOT EXISTS osm_way_id BIGINT,
    ADD COLUMN IF NOT EXISTS osm_version INT DEFAULT 1,
    ADD COLUMN IF NOT EXISTS osm_tags JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS road_class TEXT,
    ADD COLUMN IF NOT EXISTS bridge TEXT,
    ADD COLUMN IF NOT EXISTS tunnel TEXT,
    ADD COLUMN IF NOT EXISTS layer INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS access TEXT DEFAULT 'yes',
    ADD COLUMN IF NOT EXISTS service TEXT,
    ADD COLUMN IF NOT EXISTS is_service BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS source_checksum TEXT,
    ADD COLUMN IF NOT EXISTS source_feature_id TEXT;

CREATE INDEX IF NOT EXISTS idx_road_segments_osm_way_id ON road_segments (osm_way_id, osm_version);
CREATE INDEX IF NOT EXISTS idx_road_segments_source_feature ON road_segments (source_feature_id);
CREATE INDEX IF NOT EXISTS idx_road_segments_active_layer ON road_segments (is_active, layer);
CREATE INDEX IF NOT EXISTS idx_road_segments_geom_gist ON road_segments USING GIST (geom);

-- 4. Preserve Unmatched Reporting in submit_report_atomic (Zero Forced Auto-Snapping)
CREATE OR REPLACE FUNCTION submit_report_atomic(
    p_reporter_id UUID,
    p_lon DOUBLE PRECISION,
    p_lat DOUBLE PRECISION,
    p_category TEXT,
    p_observed_status TEXT,
    p_description TEXT,
    p_observed_at TIMESTAMPTZ,
    p_idempotency_key TEXT DEFAULT NULL,
    p_target_incident_id UUID DEFAULT NULL,
    p_target_segment_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_existing_report RECORD;
    v_point GEOMETRY;
    v_segment_id UUID := p_target_segment_id;
    v_snap_dist NUMERIC := NULL;
    v_incident_id UUID := p_target_incident_id;
    v_new_report_id UUID;
    v_is_idempotent BOOLEAN := FALSE;
    v_is_new_incident BOOLEAN := FALSE;
    v_old_incident_state JSONB := NULL;
    v_inc_lifecycle TEXT;
    v_is_reopened BOOLEAN := FALSE;
BEGIN
    -- 1. Check Payload-bound Idempotency with Advisory Transaction Lock
    IF p_idempotency_key IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext(p_reporter_id::text || ':' || p_idempotency_key));

        SELECT r.id, r.incident_id, r.road_segment_id
        INTO v_existing_report
        FROM reports r
        WHERE r.reporter_id = p_reporter_id 
          AND r.idempotency_key = p_idempotency_key;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'report_id', v_existing_report.id,
                'incident_id', v_existing_report.incident_id,
                'road_segment_id', v_existing_report.road_segment_id,
                'is_idempotent_replay', TRUE
            );
        END IF;
    END IF;

    -- 2. Build PostGIS Point (WGS84 4326)
    v_point := ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326);

    -- 3. Snap Distance only if explicit road segment was chosen by user.
    -- INVARIANT: Preserve unmatched reporting! Do NOT auto-assign closest road!
    IF v_segment_id IS NOT NULL THEN
        SELECT ST_Distance(rs.geom::geography, v_point::geography)
        INTO v_snap_dist
        FROM road_segments rs
        WHERE rs.id = v_segment_id;
    END IF;

    -- 4. Incident Association or Creation
    IF v_incident_id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'id', id, 
            'last_observed_at', last_observed_at, 
            'lifecycle_status', lifecycle_status,
            'verification_state', verification_state
        ), lifecycle_status
        INTO v_old_incident_state, v_inc_lifecycle
        FROM incidents
        WHERE id = v_incident_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Target incident % not found', v_incident_id;
        END IF;

        -- Check Reopening Safeguard: If incident was resolved or repair_reported,
        -- and new report notes fresh damage, reopen to active!
        IF v_inc_lifecycle IN ('repair_reported', 'resolved') AND 
           p_observed_status IN ('damaged', 'pothole', 'dug_open', 'flooded', 'unsafe_workzone') THEN
            v_is_reopened := TRUE;
            UPDATE incidents
            SET lifecycle_status = 'active',
                reopened_count = reopened_count + 1,
                reopened_at = NOW(),
                last_observed_at = GREATEST(last_observed_at, p_observed_at),
                updated_at = NOW()
            WHERE id = v_incident_id;
        ELSE
            UPDATE incidents
            SET last_observed_at = GREATEST(last_observed_at, p_observed_at),
                updated_at = NOW()
            WHERE id = v_incident_id;
        END IF;
    ELSE
        v_is_new_incident := TRUE;
        INSERT INTO incidents (
            road_segment_id, category, lifecycle_status, verification_state,
            first_observed_at, last_observed_at, centroid
        ) VALUES (
            v_segment_id, p_category, 'active', 'unverified',
            p_observed_at, p_observed_at, v_point
        ) RETURNING id INTO v_incident_id;
    END IF;

    -- 5. Insert Report
    INSERT INTO reports (
        incident_id, reporter_id, road_segment_id, observed_point, snap_distance_m,
        category, observed_status, description, observed_at, idempotency_key
    ) VALUES (
        v_incident_id, p_reporter_id, v_segment_id, v_point, v_snap_dist,
        p_category, p_observed_status, p_description, p_observed_at, p_idempotency_key
    ) RETURNING id INTO v_new_report_id;

    -- 6. Log Audit Event if reopened or newly created
    IF v_is_reopened THEN
        INSERT INTO audit_events (
            incident_id, actor_id, event_type, old_state, new_state, reason
        ) VALUES (
            v_incident_id, p_reporter_id, 'incident_reopened_due_to_new_damage',
            v_old_incident_state,
            jsonb_build_object('lifecycle_status', 'active', 'reopened_count', 1),
            'Automated reopening triggered by fresh damage report'
        );
    ELSIF v_is_new_incident THEN
        INSERT INTO audit_events (
            incident_id, actor_id, event_type, old_state, new_state, reason
        ) VALUES (
            v_incident_id, p_reporter_id, 'incident_created',
            NULL,
            jsonb_build_object('id', v_incident_id, 'status', 'active'),
            'Initial citizen observation registered'
        );
    END IF;

    RETURN jsonb_build_object(
        'report_id', v_new_report_id,
        'incident_id', v_incident_id,
        'road_segment_id', v_segment_id,
        'is_idempotent_replay', FALSE,
        'is_reopened', v_is_reopened,
        'is_new_incident', v_is_new_incident
    );
END;
$$;
