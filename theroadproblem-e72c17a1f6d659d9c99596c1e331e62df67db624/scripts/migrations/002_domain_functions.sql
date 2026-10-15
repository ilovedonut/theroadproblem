-- ====================================================================
-- Migration: 002_domain_functions.sql
-- Description: Transactional domain mutations, anti-inflation invariants,
--              concurrency locks, and event projections.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. SUBMIT REPORT ATOMIC
-- --------------------------------------------------------------------
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
          AND ST_DWithin(rs.geom::geography, v_point::geography, 100) -- within 100m
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
        -- Verify incident exists and lock row
        SELECT jsonb_build_object('id', id, 'last_observed_at', last_observed_at, 'lifecycle_status', lifecycle_status)
        INTO v_old_incident_state
        FROM incidents
        WHERE id = v_incident_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Target incident % not found', v_incident_id;
        END IF;

        UPDATE incidents
        SET last_observed_at = GREATEST(last_observed_at, p_observed_at),
            updated_at = NOW()
        WHERE id = v_incident_id;
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
        CASE WHEN v_is_new_incident THEN 'incident_created' ELSE 'observation_appended' END,
        v_old_incident_state,
        jsonb_build_object(
            'incident_id', v_incident_id,
            'report_id', v_new_report_id,
            'category', p_category,
            'observed_status', p_observed_status,
            'observed_at', p_observed_at
        ),
        p_reporter_id,
        p_observed_at,
        'Citizen report submitted'
    );

    RETURN jsonb_build_object(
        'report_id', v_new_report_id,
        'incident_id', v_incident_id,
        'road_segment_id', v_segment_id,
        'snap_distance_m', v_snap_dist,
        'is_idempotent_replay', FALSE,
        'is_new_incident', v_is_new_incident
    );
END;
$$;

-- --------------------------------------------------------------------
-- 2. CORROBORATE INCIDENT ATOMIC (Anti-self-inflation & Thresholds)
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION corroborate_incident_atomic(
    p_actor_id UUID,
    p_incident_id UUID,
    p_observation_time TIMESTAMPTZ,
    p_verdict TEXT,
    p_comment TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_incident RECORD;
    v_is_reporter BOOLEAN;
    v_corrob_id UUID;
    v_total_corroborations INT;
    v_new_state TEXT;
BEGIN
    -- 1. Check incident exists and lock
    SELECT id, verification_state, lifecycle_status
    INTO v_incident
    FROM incidents
    WHERE id = p_incident_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Incident % not found', p_incident_id;
    END IF;

    -- 2. Invariant: Original reporter cannot self-corroborate
    SELECT EXISTS (
        SELECT 1 FROM reports 
        WHERE incident_id = p_incident_id AND reporter_id = p_actor_id
    ) INTO v_is_reporter;

    IF v_is_reporter THEN
        RAISE EXCEPTION 'Anti-inflation invariant: Original reporter cannot corroborate their own incident.';
    END IF;

    -- 3. Invariant: Same actor cannot corroborate twice
    IF EXISTS (
        SELECT 1 FROM corroborations 
        WHERE incident_id = p_incident_id AND actor_id = p_actor_id
    ) THEN
        RAISE EXCEPTION 'Anti-inflation invariant: Actor % has already corroborated incident %.', p_actor_id, p_incident_id;
    END IF;

    -- 4. Insert Corroboration Record
    INSERT INTO corroborations (
        incident_id,
        actor_id,
        observation_time,
        verdict,
        comment
    ) VALUES (
        p_incident_id,
        p_actor_id,
        p_observation_time,
        p_verdict,
        p_comment
    )
    RETURNING id INTO v_corrob_id;

    -- 5. Calculate Distinct Valid Corroborations
    SELECT COUNT(*) INTO v_total_corroborations
    FROM corroborations
    WHERE incident_id = p_incident_id 
      AND verdict = 'confirms_problem';

    v_new_state := v_incident.verification_state;
    -- Threshold: 2 independent confirmations promote to 'corroborated'
    IF v_total_corroborations >= 2 AND v_incident.verification_state = 'unverified' THEN
        v_new_state := 'corroborated';
        UPDATE incidents 
        SET verification_state = v_new_state,
            updated_at = NOW()
        WHERE id = p_incident_id;
    END IF;

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
        'corroboration',
        v_corrob_id,
        'incident_corroborated',
        jsonb_build_object('verification_state', v_incident.verification_state),
        jsonb_build_object('verification_state', v_new_state, 'verdict', p_verdict, 'total_confirmations', v_total_corroborations),
        p_actor_id,
        p_observation_time,
        'Citizen corroboration recorded'
    );

    RETURN jsonb_build_object(
        'corroboration_id', v_corrob_id,
        'incident_id', p_incident_id,
        'total_confirmations', v_total_corroborations,
        'verification_state', v_new_state
    );
END;
$$;

-- --------------------------------------------------------------------
-- 3. MERGE INCIDENTS ATOMIC (Concurrency Locking, Cycle Prevention)
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION merge_incidents_atomic(
    p_moderator_id UUID,
    p_source_incident_id UUID,
    p_target_incident_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_source RECORD;
    v_target RECORD;
    v_moved_reports INT;
    v_first_id UUID;
    v_second_id UUID;
BEGIN
    -- 1. Check moderator role
    IF NOT EXISTS (
        SELECT 1 FROM users WHERE id = p_moderator_id AND role IN ('moderator', 'admin')
    ) THEN
        RAISE EXCEPTION 'Authorization failure: Actor % is not a moderator', p_moderator_id;
    END IF;

    -- 2. Prevent self-merge
    IF p_source_incident_id = p_target_incident_id THEN
        RAISE EXCEPTION 'Cannot merge incident into itself: %', p_source_incident_id;
    END IF;

    -- 3. Deadlock prevention: sort lock acquisition by UUID
    IF p_source_incident_id < p_target_incident_id THEN
        v_first_id := p_source_incident_id;
        v_second_id := p_target_incident_id;
    ELSE
        v_first_id := p_target_incident_id;
        v_second_id := p_source_incident_id;
    END IF;

    PERFORM 1 FROM incidents WHERE id = v_first_id FOR UPDATE;
    PERFORM 1 FROM incidents WHERE id = v_second_id FOR UPDATE;

    SELECT * INTO v_source FROM incidents WHERE id = p_source_incident_id;
    SELECT * INTO v_target FROM incidents WHERE id = p_target_incident_id;

    IF v_source.id IS NULL OR v_target.id IS NULL THEN
        RAISE EXCEPTION 'Source or target incident does not exist';
    END IF;

    -- 4. Prevent cycle: target must not already be merged into source
    IF v_target.merged_into_incident_id = p_source_incident_id THEN
        RAISE EXCEPTION 'Cycle detected: target incident % is already merged into source %', p_target_incident_id, p_source_incident_id;
    END IF;

    -- 5. Move all reports from source to target incident (preserving every observation!)
    UPDATE reports
    SET incident_id = p_target_incident_id
    WHERE incident_id = p_source_incident_id;
    GET DIAGNOSTICS v_moved_reports = ROW_COUNT;

    -- 6. Update target incident dates and bounds
    UPDATE incidents
    SET first_observed_at = LEAST(v_target.first_observed_at, v_source.first_observed_at),
        last_observed_at = GREATEST(v_target.last_observed_at, v_source.last_observed_at),
        updated_at = NOW()
    WHERE id = p_target_incident_id;

    -- 7. Mark source incident merged and redirect
    UPDATE incidents
    SET lifecycle_status = 'resolved',
        merged_into_incident_id = p_target_incident_id,
        updated_at = NOW()
    WHERE id = p_source_incident_id;

    -- 8. Audit event & Moderation record
    INSERT INTO moderation_actions (
        target_type,
        target_id,
        moderator_id,
        action,
        reason
    ) VALUES (
        'incident',
        p_source_incident_id,
        p_moderator_id,
        'merge',
        p_reason
    );

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
        p_target_incident_id,
        'incidents_merged',
        jsonb_build_object('source_id', p_source_incident_id),
        jsonb_build_object('target_id', p_target_incident_id, 'moved_reports', v_moved_reports),
        p_moderator_id,
        NOW(),
        p_reason
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'source_incident_id', p_source_incident_id,
        'target_incident_id', p_target_incident_id,
        'reports_moved', v_moved_reports
    );
END;
$$;

-- --------------------------------------------------------------------
-- 4. RECORD REPAIR ATOMIC (Repair Evidence & Verification)
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_repair_atomic(
    p_actor_id UUID,
    p_incident_id UUID,
    p_status TEXT, -- 'repair_reported' or 'resolved'
    p_evidence_description TEXT,
    p_observed_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_incident RECORD;
BEGIN
    SELECT * INTO v_incident FROM incidents WHERE id = p_incident_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Incident % not found', p_incident_id;
    END IF;

    UPDATE incidents
    SET lifecycle_status = p_status,
        resolved_at = CASE WHEN p_status = 'resolved' THEN p_observed_at ELSE NULL END,
        verification_state = CASE WHEN p_status = 'resolved' THEN 'resolved' ELSE verification_state END,
        updated_at = NOW()
    WHERE id = p_incident_id;

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
        p_incident_id,
        'repair_recorded',
        jsonb_build_object('lifecycle_status', v_incident.lifecycle_status),
        jsonb_build_object('lifecycle_status', p_status, 'evidence', p_evidence_description),
        p_actor_id,
        p_observed_at,
        p_evidence_description
    );

    RETURN jsonb_build_object(
        'incident_id', p_incident_id,
        'new_status', p_status,
        'resolved_at', CASE WHEN p_status = 'resolved' THEN p_observed_at ELSE NULL END
    );
END;
$$;

-- --------------------------------------------------------------------
-- 5. RECORD RECURRENCE ATOMIC (Link to Predecessor Episode)
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_recurrence_atomic(
    p_reporter_id UUID,
    p_predecessor_incident_id UUID,
    p_category TEXT,
    p_description TEXT,
    p_observed_at TIMESTAMPTZ,
    p_lon DOUBLE PRECISION,
    p_lat DOUBLE PRECISION
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_predecessor RECORD;
    v_new_incident_id UUID;
    v_new_report_id UUID;
    v_point GEOMETRY;
BEGIN
    SELECT * INTO v_predecessor FROM incidents WHERE id = p_predecessor_incident_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Predecessor incident % not found', p_predecessor_incident_id;
    END IF;

    v_point := ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326);

    -- Create new episode linked to predecessor
    INSERT INTO incidents (
        road_segment_id,
        category,
        lifecycle_status,
        verification_state,
        predecessor_incident_id,
        first_observed_at,
        last_observed_at,
        centroid
    ) VALUES (
        v_predecessor.road_segment_id,
        p_category,
        'active',
        'unverified',
        p_predecessor_incident_id,
        p_observed_at,
        p_observed_at,
        v_point
    )
    RETURNING id INTO v_new_incident_id;

    -- Insert report
    INSERT INTO reports (
        incident_id,
        reporter_id,
        road_segment_id,
        observed_point,
        category,
        observed_status,
        description,
        observed_at,
        publication_status
    ) VALUES (
        v_new_incident_id,
        p_reporter_id,
        v_predecessor.road_segment_id,
        v_point,
        p_category,
        'deteriorated',
        p_description,
        p_observed_at,
        'published'
    )
    RETURNING id INTO v_new_report_id;

    -- Event audit
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
        v_new_incident_id,
        'recurrence_observed',
        jsonb_build_object('predecessor_incident_id', p_predecessor_incident_id),
        jsonb_build_object('new_incident_id', v_new_incident_id, 'report_id', v_new_report_id),
        p_reporter_id,
        p_observed_at,
        'Recurrent damage reported on resolved road location'
    );

    RETURN jsonb_build_object(
        'new_incident_id', v_new_incident_id,
        'predecessor_incident_id', p_predecessor_incident_id,
        'report_id', v_new_report_id
    );
END;
$$;
