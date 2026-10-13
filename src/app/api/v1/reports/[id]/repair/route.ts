import { NextRequest, NextResponse } from "next/server";
import { query } from "@/db/client";
import { requireAccount } from "@/lib/account-server";
import { uuid, errorResponse } from "@/lib/evidence-validation";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params; // incident_id

  try {
    const account = await requireAccount(req);
    uuid(id);
    const body = await req.json();
    const {
      status = "resolved",
      evidence_description,
      observed_at = new Date().toISOString(),
    } = body;

    const actorId = account.id;

    const res = await query(
      `
      SELECT record_repair_atomic(
        $1::uuid,
        $2::uuid,
        $3::text,
        $4::text,
        $5::timestamptz
      ) as result;
    `,
      [
        actorId,
        id,
        status,
        evidence_description || "Surface repaired and restored",
        observed_at,
      ],
    );

    return NextResponse.json({
      success: true,
      repair: res.rows[0].result,
    });
  } catch (err: any) {
    return errorResponse(err);
  }
}
