import { NextRequest, NextResponse } from "next/server";
import { query } from "@/db/client";
import { requireAccount } from "@/lib/account-server";
import { uuid, text, errorResponse } from "@/lib/evidence-validation";

export async function POST(req: NextRequest) {
  try {
    const account = await requireAccount(req, true);
    const body = await req.json();
    const {
      source_incident_id,
      target_incident_id,
      reason = "Merged by moderator",
    } = body;

    const moderatorId = account.id;
    uuid(source_incident_id);
    uuid(target_incident_id);
    text(reason, "Merge reason", 5, 2000);

    const res = await query(
      `
      SELECT merge_incidents_atomic(
        $1::uuid,
        $2::uuid,
        $3::uuid,
        $4::text
      ) as result;
    `,
      [moderatorId, source_incident_id, target_incident_id, reason],
    );

    return NextResponse.json({
      success: true,
      merge: res.rows[0].result,
    });
  } catch (err: any) {
    return errorResponse(err);
  }
}
