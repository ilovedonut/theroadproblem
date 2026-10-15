import { query } from "@/db/client";
import { requireAccount } from "@/lib/account-server";
import {
  uuid,
  text,
  RequestError,
  errorResponse,
} from "@/lib/evidence-validation";

export async function GET(req: Request) {
  try {
    await requireAccount(req, true);
    const result =
      await query(`SELECT c.id,c.incident_id,c.reason,c.created_at,u.display_name,
      ST_Y(c.old_point) AS old_lat,ST_X(c.old_point) AS old_lon,
      ST_Y(c.proposed_point) AS lat,ST_X(c.proposed_point) AS lon,
      c.base_version <> i.location_version OR NOT ST_Equals(c.old_point,i.centroid) AS stale
      FROM location_corrections c JOIN users u ON u.id=c.requester_id JOIN incidents i ON i.id=c.incident_id
      WHERE c.status='pending' ORDER BY c.created_at LIMIT 100`);
    return Response.json(
      { corrections: result.rows },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(req: Request) {
  try {
    const account = await requireAccount(req, true),
      body = await req.json();
    const id = uuid(body.id),
      reason = text(body.reason, "Review reason", 5, 2000);
    if (!["accept", "reject"].includes(body.action))
      throw new RequestError("Choose accept or reject.");
    const segment = body.segment_id ? uuid(body.segment_id) : null;
    const result = await query(
      "SELECT review_location_correction($1,$2,$3,$4,$5) AS result",
      [id, account.id, body.action === "accept", reason, segment],
    );
    return Response.json({ correction: result.rows[0].result });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P0001")
      return Response.json({ error: error.message }, { status: 409 });
    return errorResponse(error);
  }
}
