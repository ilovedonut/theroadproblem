import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import pg from "pg";

test(
  "Correction review preserves original observations, checks permissions, and rejects stale proposals",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const url = new URL(process.env.TEST_DATABASE_URL);
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) &&
      !url.hostname.startsWith("172.")
    )
      throw new Error(
        "This transactional test requires an explicit local test database.",
      );
    const pool = new pg.Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      connectionTimeoutMillis: 5000,
    });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        fs.readFileSync(
          "scripts/migrations/004_verified_accounts_location_corrections.sql",
          "utf8",
        ),
      );
      const citizen = "e1111111-1111-4111-8111-111111111111",
        other = "e2222222-2222-4222-8222-222222222222",
        mod = "e3333333-3333-4333-8333-333333333333";
      await client.query(
        `INSERT INTO users(id,email_private,display_name,role) VALUES($1,'correction-test-a@invalid.test','Test A','citizen'),($2,'correction-test-b@invalid.test','Test B','citizen'),($3,'correction-test-mod@invalid.test','Test moderator','moderator') ON CONFLICT(id) DO NOTHING`,
        [citizen, other, mod],
      );
      const incident = (
        await client.query(
          `INSERT INTO incidents(category,first_observed_at,last_observed_at,centroid) VALUES('pothole',now(),now(),ST_SetSRID(ST_MakePoint(77.5946,12.9716),4326)) RETURNING id`,
        )
      ).rows[0].id;
      const report = (
        await client.query(
          `INSERT INTO reports(incident_id,reporter_id,observed_point,category,observed_status,description,observed_at) VALUES($1,$2,ST_SetSRID(ST_MakePoint(77.5946,12.9716),4326),'pothole','damaged','Original observation',now()) RETURNING id`,
          [incident, citizen],
        )
      ).rows[0].id;
      const make = async (actor, lon) =>
        (
          await client.query(
            `INSERT INTO location_corrections(incident_id,requester_id,old_point,proposed_point,base_version,reason) SELECT id,$2,centroid,ST_SetSRID(ST_MakePoint($3,12.9716),4326),location_version,'Pin belongs on the opposite lane' FROM incidents WHERE id=$1 RETURNING id`,
            [incident, actor, lon],
          )
        ).rows[0].id;
      const first = await make(citizen, 77.5948),
        stale = await make(other, 77.5949);
      assert.equal(
        (
          await client.query(
            "SELECT ST_X(centroid) AS lon FROM incidents WHERE id=$1",
            [incident],
          )
        ).rows[0].lon,
        77.5946,
      );
      async function fails(sql, args, pattern) {
        await client.query("SAVEPOINT expected_failure");
        await assert.rejects(client.query(sql, args), pattern);
        await client.query("ROLLBACK TO SAVEPOINT expected_failure");
      }
      await fails(
        "SELECT review_location_correction($1,$2,true,$3,NULL)",
        [first, citizen, "I approve this correction"],
        /Moderator access/,
      );
      await fails(
        `INSERT INTO location_corrections(incident_id,requester_id,old_point,proposed_point,base_version,reason) SELECT id,$2,centroid,ST_SetSRID(ST_MakePoint(78.0,12.9716),4326),0,'Too far to be a correction' FROM incidents WHERE id=$1`,
        [incident, mod],
        /check constraint/,
      );
      await client.query(
        "SELECT review_location_correction($1,$2,true,$3,NULL)",
        [first, mod, "Location confirmed against photographic evidence"],
      );
      assert.equal(
        (
          await client.query(
            "SELECT ST_X(centroid) AS lon,location_version FROM incidents WHERE id=$1",
            [incident],
          )
        ).rows[0].lon,
        77.5948,
      );
      assert.equal(
        (
          await client.query(
            "SELECT ST_X(observed_point) AS lon FROM reports WHERE id=$1",
            [report],
          )
        ).rows[0].lon,
        77.5946,
      );
      assert.equal(
        Number(
          (
            await client.query(
              `SELECT count(*) AS count FROM events WHERE entity_id=$1 AND event_type='location_correction_accepted'`,
              [incident],
            )
          ).rows[0].count,
        ),
        1,
      );
      await fails(
        "SELECT review_location_correction($1,$2,true,$3,NULL)",
        [stale, mod, "Accept stale proposal anyway"],
        /Location changed/,
      );
      await fails(
        "SELECT review_location_correction($1,$2,true,$3,NULL)",
        [first, mod, "Review the same correction again"],
        /already reviewed/,
      );
      await client.query(
        "SELECT review_location_correction($1,$2,false,$3,NULL)",
        [stale, mod, "Stale proposal; please submit a new correction"],
      );
      assert.equal(
        (
          await client.query(
            "SELECT status FROM location_corrections WHERE id=$1",
            [stale],
          )
        ).rows[0].status,
        "rejected",
      );
      await client.query("CREATE ROLE trp_corrections_test_untrusted NOLOGIN");
      assert.equal(
        (
          await client.query(
            `SELECT has_function_privilege('trp_corrections_test_untrusted','review_location_correction(uuid,uuid,boolean,text,uuid)','EXECUTE') AS allowed`,
          )
        ).rows[0].allowed,
        false,
      );
      assert.equal(
        (
          await client.query(
            `SELECT has_function_privilege('trp_corrections_test_untrusted','submit_report_atomic(uuid,double precision,double precision,text,text,text,timestamp with time zone,text,uuid,uuid)','EXECUTE') AS allowed`,
          )
        ).rows[0].allowed,
        false,
      );
    } finally {
      await client.query("ROLLBACK");
      client.release();
      await pool.end();
    }
  },
);
