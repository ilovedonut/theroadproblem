import { NextRequest, NextResponse } from "next/server";
import { query } from "@/db/client";
import { requireAccount } from "@/lib/account-server";
import { uuid, errorResponse } from "@/lib/evidence-validation";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params; // incident_id or report_id

  try {
    const account = await requireAccount(req);
    uuid(id);
    const body = await req.json();
    const {
      verdict = "confirms_problem",
      comment,
      observation_time = new Date().toISOString(),
    } = body;

    const actorId = account.id;

    const res = await query(
      `
      SELECT corroborate_incident_atomic(
        $1::uuid,
        $2::uuid,
        $3::timestamptz,
        $4::text,
        $5::text
      ) as result;
    `,
      [actorId, id, observation_time, verdict, comment || null],
    );

    return NextResponse.json({
      success: true,
      corroboration: res.rows[0].result,
    });
  } catch (err: any) {
    return errorResponse(err);
  }
}
