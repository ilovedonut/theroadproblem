\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;
\ir ../scripts/migrations/004_verified_accounts_location_corrections.sql
DO $$
DECLARE
  a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); m uuid:=gen_random_uuid();
  issue uuid; observation uuid; first_proposal uuid; stale_proposal uuid;
BEGIN
  INSERT INTO users(id,email_private,display_name,role) VALUES
    (a,'test-a@invalid.test','Test A','citizen'),(b,'test-b@invalid.test','Test B','citizen'),(m,'test-mod@invalid.test','Test moderator','moderator');
  INSERT INTO incidents(category,first_observed_at,last_observed_at,centroid)
    VALUES('pothole',now(),now(),ST_SetSRID(ST_MakePoint(77.5946,12.9716),4326)) RETURNING id INTO issue;
  INSERT INTO reports(incident_id,reporter_id,observed_point,category,observed_status,description,observed_at)
    VALUES(issue,a,ST_SetSRID(ST_MakePoint(77.5946,12.9716),4326),'pothole','damaged','Original observation',now()) RETURNING id INTO observation;
  INSERT INTO location_corrections(incident_id,requester_id,old_point,proposed_point,base_version,reason)
    SELECT id,a,centroid,ST_SetSRID(ST_MakePoint(77.5948,12.9716),4326),location_version,'The pin belongs on the opposite lane' FROM incidents WHERE id=issue RETURNING id INTO first_proposal;
  INSERT INTO location_corrections(incident_id,requester_id,old_point,proposed_point,base_version,reason)
    SELECT id,b,centroid,ST_SetSRID(ST_MakePoint(77.5949,12.9716),4326),location_version,'The pin belongs further down the lane' FROM incidents WHERE id=issue RETURNING id INTO stale_proposal;
  IF (SELECT ST_X(centroid) FROM incidents WHERE id=issue) <> 77.5946 THEN RAISE EXCEPTION 'Pending proposal moved the pin'; END IF;
  BEGIN
    PERFORM review_location_correction(first_proposal,a,true,'Unauthorized acceptance',NULL);
    RAISE EXCEPTION 'Unauthorized review was allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Moderator access required' THEN RAISE; END IF; END;
  BEGIN
    INSERT INTO location_corrections(incident_id,requester_id,old_point,proposed_point,base_version,reason)
      SELECT id,m,centroid,ST_SetSRID(ST_MakePoint(78.0,12.9716),4326),0,'This moves the issue too far away' FROM incidents WHERE id=issue;
    RAISE EXCEPTION 'Distant proposal was allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  PERFORM review_location_correction(first_proposal,m,true,'Location checked against the original evidence',NULL);
  IF (SELECT ST_X(centroid) FROM incidents WHERE id=issue) <> 77.5948 THEN RAISE EXCEPTION 'Accepted location did not change'; END IF;
  IF (SELECT ST_X(observed_point) FROM reports WHERE id=observation) <> 77.5946 THEN RAISE EXCEPTION 'Original evidence was overwritten'; END IF;
  IF (SELECT count(*) FROM events WHERE entity_id=issue AND event_type='location_correction_accepted') <> 1 THEN RAISE EXCEPTION 'Audit event missing'; END IF;
  BEGIN
    PERFORM review_location_correction(stale_proposal,m,true,'Attempt stale overwrite',NULL);
    RAISE EXCEPTION 'Stale correction was accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Location changed%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM review_location_correction(first_proposal,m,true,'Attempt duplicate review',NULL);
    RAISE EXCEPTION 'Duplicate review was accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Correction already reviewed' THEN RAISE; END IF; END;
  PERFORM review_location_correction(stale_proposal,m,false,'Stale proposal; please submit a new correction',NULL);
  IF (SELECT status FROM location_corrections WHERE id=stale_proposal) <> 'rejected' THEN RAISE EXCEPTION 'Rejection failed'; END IF;
END $$;
CREATE ROLE trp_corrections_test_untrusted NOLOGIN;
DO $$ BEGIN
  IF has_column_privilege('anon','users','email_private','SELECT') THEN RAISE EXCEPTION 'Public role can read private emails'; END IF;
  IF NOT has_column_privilege('anon','users','display_name','SELECT') THEN RAISE EXCEPTION 'Public profiles are unavailable'; END IF;
  IF has_table_privilege('authenticated','users','UPDATE') THEN RAISE EXCEPTION 'Browser role can edit trusted account roles'; END IF;
  IF has_function_privilege('trp_corrections_test_untrusted','review_location_correction(uuid,uuid,boolean,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Untrusted role can review'; END IF;
  IF has_function_privilege('trp_corrections_test_untrusted','submit_report_atomic(uuid,double precision,double precision,text,text,text,timestamp with time zone,text,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Untrusted role can impersonate a reporter'; END IF;
END $$;
ROLLBACK;
\echo Correction migration and rollback-only regression checks passed.
