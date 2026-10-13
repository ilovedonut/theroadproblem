-- ====================================================================
-- Migration: 004_ingestion_ledger_and_matching.sql
-- Description: Ingestion runs audit ledger, multi-criteria road matching confidence,
--              ambiguous match review queue, and incident reopening on fresh damage.
-- ====================================================================

-- 1. Ingestion Execution Ledger (Recoverability & Visibility)
CREATE TABLE IF NOT EXISTS ingestion_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_name TEXT NOT NULL,
    district TEXT,
    run_status TEXT NOT NULL CHECK (run_status IN ('running', 'completed', 'failed', 'retrying')),
    cursor_state TEXT,
    records_discovered INT NOT NULL DEFAULT 0,
    records_inserted INT NOT NULL DEFAULT 0,
    records_updated INT NOT NULL DEFAULT 0,
    records_skipped INT NOT NULL DEFAULT 0,
    failures_count INT NOT NULL DEFAULT 0,
    failed_records JSONB NOT NULL DEFAULT '[]'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    last_successful_refresh TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_source ON ingestion_runs (source_name, started_at DESC);

-- 2. Precision Matching Enhancements on work_segments
ALTER TABLE work_segments 
    ADD COLUMN IF NOT EXISTS matching_confidence TEXT NOT NULL DEFAULT 'high_exact_ref_chainage' 
        CHECK (matching_confidence IN ('high_exact_ref_chainage', 'medium_corridor_chainage', 'low_ambiguous', 'manual_verified')),
    ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'approved'
        CHECK (review_status IN ('approved', 'needs_review', 'rejected')),
    ADD COLUMN IF NOT EXISTS review_notes TEXT;

-- 3. Ambiguous Matches Queue (Human-in-the-Loop Review)
CREATE TABLE IF NOT EXISTS ambiguous_matches_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_record_id UUID REFERENCES source_records(id) ON DELETE SET NULL,
    work_id UUID REFERENCES works(id) ON DELETE CASCADE,
    tender_id TEXT NOT NULL,
    district TEXT,
    authority_name TEXT,
    road_name_hint TEXT,
    chainage_start_km NUMERIC,
    chainage_end_km NUMERIC,
    candidate_segment_ids JSONB,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ambiguous_matches_status ON ambiguous_matches_queue (status, created_at DESC);

-- 4. Incident Fresh-Damage Reopening & Lifecycle Safeguards
ALTER TABLE incidents
    ADD COLUMN IF NOT EXISTS reopened_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ;

-- 5. Updated submit_report_atomic with Reopening Support
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

    -- 3. Snap to Nearest Road Segment if not explicitly provided
    IF v_segment_id IS NULL THEN
        SELECT rs.id, ST_Distance(rs.geom::geography, v_point::geography)
        INTO v_segment_id, v_snap_dist
        FROM road_segments rs
        WHERE rs.is_active = TRUE
          AND ST_DWithin(rs.geom::geography, v_point::geography, 100)
        ORDER BY ST_Distance(rs.geom::geography, v_point::geography) ASC
        LIMIT 1;
    ELSE
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
        -- Create new incident
        v_is_new_incident := TRUE;
        INSERT INTO incidents (
            road_segment_id,
            category,
            lifecycle_status,
            verification_state,
            first_observed_at,
            last_observed_at,
            centroid
        ) VALUES (
            v_segment_id,
            p_category,
            'active',
            'unverified',
            p_observed_at,
            p_observed_at,
            v_point
        )
        RETURNING id INTO v_incident_id;
    END IF;

    -- 5. Insert Citizen Report
    BEGIN
        INSERT INTO reports (
            incident_id,
            reporter_id,
            road_segment_id,
            observed_point,
            snap_distance_m,
            category,
            observed_status,
            description,
            observed_at,
            idempotency_key,
            publication_status
        ) VALUES (
            v_incident_id,
            p_reporter_id,
            v_segment_id,
            v_point,
            v_snap_dist,
            p_category,
            p_observed_status,
            p_description,
            p_observed_at,
            p_idempotency_key,
            'published'
        )
        RETURNING id INTO v_new_report_id;
    EXCEPTION WHEN unique_violation THEN
        SELECT r.id, r.incident_id, r.road_segment_id
        INTO v_existing_report
        FROM reports r
        WHERE r.reporter_id = p_reporter_id AND r.idempotency_key = p_idempotency_key;

        RETURN jsonb_build_object(
            'report_id', v_existing_report.id,
            'incident_id', v_existing_report.incident_id,
            'road_segment_id', v_existing_report.road_segment_id,
            'is_idempotent_replay', TRUE
        );
    END;

    -- 6. Append Civic Audit Event
    INSERT INTO events (
        entity_type,
        entity_id,
        event_type,
        old_state,
        new_state,
        actor_id,
        effective_at,
        reason
    ) VALUES (
        'incident',
        v_incident_id,
        CASE 
            WHEN v_is_reopened THEN 'incident_reopened_due_to_new_damage'
            WHEN v_is_new_incident THEN 'incident_created' 
            ELSE 'observation_appended' 
        END,
        v_old_incident_state,
        jsonb_build_object(
            'incident_id', v_incident_id,
            'report_id', v_new_report_id,
            'category', p_category,
            'observed_status', p_observed_status,
            'lifecycle_status', CASE WHEN v_is_reopened THEN 'active' ELSE COALESCE(v_inc_lifecycle, 'active') END,
            'observed_at', p_observed_at
        ),
        p_reporter_id,
        p_observed_at,
        CASE 
            WHEN v_is_reopened THEN 'Fresh damage observation reported on previously resolved incident'
            ELSE 'Citizen report submitted' 
        END
    );

    RETURN jsonb_build_object(
        'report_id', v_new_report_id,
        'incident_id', v_incident_id,
        'road_segment_id', v_segment_id,
        'snap_distance_m', v_snap_dist,
        'is_new_incident', v_is_new_incident,
        'is_reopened', v_is_reopened,
        'is_idempotent_replay', FALSE
    );
END;
$$;
