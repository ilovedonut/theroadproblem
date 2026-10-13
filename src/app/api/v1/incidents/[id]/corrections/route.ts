import { query } from "@/db/client";
import { requireAccount } from "@/lib/account-server";
import {
  coordinates,
  uuid,
  text,
  RequestError,
  errorResponse,
} from "@/lib/evidence-validation";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const account = await requireAccount(req);
    const id = uuid((await params).id),
      body = await req.json();
    const { lat, lon } = coordinates(body.lat, body.lon);
    const reason = text(body.reason, "Correction reason", 5, 2000);
    const inserted = await query(
      `INSERT INTO location_corrections(incident_id,requester_id,old_point,proposed_point,base_version,reason)
      SELECT id,$2,centroid,ST_SetSRID(ST_MakePoint($3,$4),4326),location_version,$5 FROM incidents
      WHERE id=$1 AND merged_into_incident_id IS NULL
        AND NOT ST_Equals(centroid,ST_SetSRID(ST_MakePoint($3,$4),4326))
        AND ST_DWithin(centroid::geography,ST_SetSRID(ST_MakePoint($3,$4),4326)::geography,500)
      ON CONFLICT (incident_id,requester_id) WHERE status='pending' DO NOTHING
      RETURNING id,status`,
      [id, account.id, lon, lat, reason],
    );
    if (!inserted.rowCount)
      throw new RequestError(
        "Choose a different point within 500 m. You may already have a pending correction for this issue.",
        409,
      );
    return Response.json({ correction: inserted.rows[0] }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const account = await requireAccount(req),
      id = uuid((await params).id);
    const result = await query(
      `SELECT id,status,reason,review_reason,created_at,reviewed_at,
      ST_Y(old_point) AS old_lat,ST_X(old_point) AS old_lon,ST_Y(proposed_point) AS lat,ST_X(proposed_point) AS lon
      FROM location_corrections WHERE incident_id=$1 AND requester_id=$2 ORDER BY created_at DESC LIMIT 30`,
      [id, account.id],
    );
    return Response.json(
      { corrections: result.rows },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
