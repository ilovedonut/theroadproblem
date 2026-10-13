import { NextRequest, NextResponse } from "next/server";
import { query } from "@/db/client";
import { requireAccount } from "@/lib/account-server";
import {
  coordinates,
  uuid,
  text,
  RequestError,
  errorResponse,
} from "@/lib/evidence-validation";
import { areSubmissionsEnabled } from "@/lib/ops";

export async function POST(req: NextRequest) {
  if (!areSubmissionsEnabled()) {
    return NextResponse.json(
      {
        error:
          "Service Unavailable: Submissions intake temporarily paused by operations killswitch",
      },
      { status: 503 },
    );
  }

  try {
    const account = await requireAccount(req);
    const body = await req.json();
    const {
      lon,
      lat,
      category,
      observed_status = "damaged",
      description,
      observed_at = new Date().toISOString(),
      idempotency_key,
      target_incident_id,
      target_segment_id,
      reporter_display_name,
    } = body;

    if (lon === undefined || lat === undefined || !category || !description) {
      return NextResponse.json(
        { error: "Missing required fields: lon, lat, category, description" },
        { status: 400 },
      );
    }

    const reporterId = account.id;
    coordinates(lat, lon);
    text(description, "Description", 5);
    text(idempotency_key, "Submission key", 8, 100);
    if (
      ![
        "pothole",
        "dug_open",
        "damaged_surface",
        "flooded",
        "unsafe_workzone",
        "debris_blockage",
        "collapsed_culvert",
        "other",
      ].includes(category)
    )
      throw new RequestError("Choose a valid issue type.");
    if (
      ![
        "dug_open",
        "partially_blocked",
        "damaged",
        "pothole",
        "flooded",
        "unsafe_workzone",
        "temporary_restoration",
        "repaired",
        "deteriorated",
        "normal",
        "unknown",
      ].includes(observed_status)
    )
      throw new RequestError("Choose a valid observed condition.");
    if (!Number.isFinite(Date.parse(observed_at)))
      throw new RequestError("Invalid observation time.");
    // Replays belong to this verified actor, and cannot silently change already-saved evidence.
    const replay = await query(
      `SELECT id AS report_id,incident_id,road_segment_id,description,category,observed_status,
      ST_Y(observed_point) AS lat,ST_X(observed_point) AS lon FROM reports WHERE reporter_id=$1 AND idempotency_key=$2`,
      [reporterId, idempotency_key],
    );
    if (replay.rowCount) {
      const prior = replay.rows[0];
      if (
        prior.description !== description ||
        prior.category !== category ||
        prior.observed_status !== observed_status ||
        Math.abs(prior.lat - lat) > 1e-9 ||
        Math.abs(prior.lon - lon) > 1e-9
      )
        throw new RequestError(
          "This report is already saved. Retry its photo from saved drafts, or create a new report for different evidence.",
          409,
        );
      return NextResponse.json({
        success: true,
        report_id: prior.report_id,
        incident_id: prior.incident_id,
        road_segment_id: prior.road_segment_id,
        is_idempotent_replay: true,
      });
    }
    if (target_segment_id) {
      uuid(target_segment_id);
      const valid = await query(
        `SELECT id FROM road_segments WHERE id = $1 AND is_active
        AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($2,$3),4326)::geography,150)`,
        [target_segment_id, lon, lat],
      );
      if (!valid.rowCount)
        throw new RequestError(
          "That road is too far from the pin. Check the location again.",
        );
    }
    if (target_incident_id) {
      uuid(target_incident_id);
      const valid = await query(
        `SELECT id FROM incidents WHERE id = $1 AND lifecycle_status = 'active'
        AND merged_into_incident_id IS NULL AND category = $4
        AND ST_DWithin(centroid::geography, ST_SetSRID(ST_MakePoint($2,$3),4326)::geography,200)`,
        [target_incident_id, lon, lat, category],
      );
      if (!valid.rowCount)
        throw new RequestError(
          "This existing issue does not match your location and issue type. Choose a different issue.",
        );
    }

    const res = await query(
      `
      SELECT submit_report_atomic(
        $1::uuid,
        $2::double precision,
        $3::double precision,
        $4::text,
        $5::text,
        $6::text,
        $7::timestamptz,
        $8::text,
        $9::uuid,
        $10::uuid
      ) as result;
    `,
      [
        reporterId,
        lon,
        lat,
        category,
        observed_status,
        description,
        observed_at,
        idempotency_key || null,
        target_incident_id || null,
        target_segment_id || null,
      ],
    );

    const result = res.rows[0].result;
    return NextResponse.json({
      success: true,
      report_id: result.report_id,
      incident_id: result.incident_id,
      road_segment_id: result.road_segment_id,
      snap_distance_m: result.snap_distance_m,
      is_idempotent_replay: result.is_idempotent_replay,
      redirect_url: `/incidents/${result.incident_id}`,
    });
  } catch (err: any) {
    return errorResponse(err);
  }
}
