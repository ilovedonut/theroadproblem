-- Backend-only writes: browser roles cannot call privileged domain functions or mutate corrections.
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS location_version bigint NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS location_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  old_point geometry(Point,4326) NOT NULL,
  proposed_point geometry(Point,4326) NOT NULL,
  base_version bigint NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 5 AND 2000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  reviewer_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  CHECK ((status = 'pending' AND reviewer_id IS NULL AND reviewed_at IS NULL)
    OR (status <> 'pending' AND reviewer_id IS NOT NULL AND reviewed_at IS NOT NULL)),
  CHECK (ST_Distance(old_point::geography, proposed_point::geography) <= 500)
);
CREATE INDEX IF NOT EXISTS location_corrections_incident_idx ON location_corrections(incident_id, created_at DESC);
CREATE INDEX IF NOT EXISTS location_corrections_requester_idx ON location_corrections(requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS location_corrections_pending_idx ON location_corrections(created_at) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS location_corrections_one_pending_idx ON location_corrections(incident_id,requester_id) WHERE status = 'pending';
ALTER TABLE location_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON location_corrections FROM PUBLIC;
REVOKE ALL ON users FROM PUBLIC;
DROP POLICY IF EXISTS location_corrections_own ON location_corrections;
CREATE POLICY location_corrections_own ON location_corrections FOR SELECT
  USING (requester_id::text = current_setting('request.jwt.claim.sub', true));

-- Deduplicate attachment retries without discarding old evidence files.
CREATE UNIQUE INDEX IF NOT EXISTS report_media_report_checksum_idx ON report_media(report_id,sha256);

CREATE OR REPLACE FUNCTION review_location_correction(
  p_id uuid, p_reviewer uuid, p_accept boolean, p_reason text, p_segment uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE c location_corrections%ROWTYPE; i incidents%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id=p_reviewer AND role IN ('moderator','admin') AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Moderator access required';
  END IF;
  IF p_reason IS NULL OR char_length(trim(p_reason)) < 5 OR char_length(p_reason)>2000 THEN
    RAISE EXCEPTION 'A review reason is required';
  END IF;
  SELECT * INTO c FROM location_corrections WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Correction not found'; END IF;
  IF c.status <> 'pending' THEN RAISE EXCEPTION 'Correction already reviewed'; END IF;
  SELECT * INTO i FROM incidents WHERE id=c.incident_id FOR UPDATE;
  IF NOT FOUND OR i.merged_into_incident_id IS NOT NULL THEN RAISE EXCEPTION 'Issue is unavailable or merged'; END IF;
  IF p_accept THEN
    IF i.location_version <> c.base_version OR NOT ST_Equals(i.centroid,c.old_point) THEN
      RAISE EXCEPTION 'Location changed since this proposal; reject it and request a new proposal';
    END IF;
    IF p_segment IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM road_segments WHERE id=p_segment AND is_active
      AND ST_DWithin(geom::geography,c.proposed_point::geography,150)
    ) THEN RAISE EXCEPTION 'Selected road is not near the proposed location'; END IF;
    UPDATE incidents SET centroid=c.proposed_point, road_segment_id=p_segment,
      location_version=location_version+1, updated_at=now() WHERE id=i.id;
    -- Original report points, photos, and official work associations remain unchanged.
  END IF;
  UPDATE location_corrections SET status=CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END,
    reviewer_id=p_reviewer,review_reason=trim(p_reason),reviewed_at=now() WHERE id=c.id;
  INSERT INTO events(entity_type,entity_id,event_type,old_state,new_state,actor_id,reason)
    VALUES('incident',i.id,CASE WHEN p_accept THEN 'location_correction_accepted' ELSE 'location_correction_rejected' END,
      jsonb_build_object('lat',ST_Y(i.centroid),'lon',ST_X(i.centroid),'road_segment_id',i.road_segment_id),
      jsonb_build_object('correction_id',c.id,'lat',ST_Y(c.proposed_point),'lon',ST_X(c.proposed_point),
        'status',CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END,'road_segment_id',p_segment),p_reviewer,trim(p_reason));
  RETURN jsonb_build_object('id',c.id,'status',CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END);
END $$;
REVOKE ALL ON FUNCTION review_location_correction(uuid,uuid,boolean,text,uuid) FROM PUBLIC;

DO $$ DECLARE role_name text; fn record;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON location_corrections FROM %I',role_name);
      EXECUTE format('REVOKE ALL ON users FROM %I',role_name);
      EXECUTE format('REVOKE SELECT (email_private) ON users FROM %I',role_name);
      EXECUTE format('REVOKE UPDATE (id,role,email_private) ON users FROM %I',role_name);
      EXECUTE format('GRANT SELECT (id,display_name,is_anonymous_public,reputation,locale,created_at) ON users TO %I',role_name);
      EXECUTE format('REVOKE INSERT,UPDATE,DELETE ON incidents,reports,report_media,corroborations FROM %I',role_name);
      EXECUTE format('REVOKE ALL ON FUNCTION review_location_correction(uuid,uuid,boolean,text,uuid) FROM %I',role_name);
    END IF;
  END LOOP;
  FOR fn IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('submit_report_atomic','corroborate_incident_atomic','record_repair_atomic','merge_incidents_atomic') LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC',fn.signature);
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM %I',fn.signature,role_name);
      END IF;
    END LOOP;
  END LOOP;
END $$;
