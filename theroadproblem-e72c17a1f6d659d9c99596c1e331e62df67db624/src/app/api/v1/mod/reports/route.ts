import { NextRequest, NextResponse } from "next/server";
import { query } from "@/db/client";
import { requireAccount } from "@/lib/account-server";
import { errorResponse } from "@/lib/evidence-validation";

export async function GET(req: NextRequest) {
  try {
    await requireAccount(req, true);
    const res = await query(`
      SELECT r.id, r.incident_id, r.category, r.observed_status, r.description,
             r.observed_at, r.publication_status, r.moderation_reason,
             u.display_name as reporter_name
      FROM reports r
      JOIN users u ON r.reporter_id = u.id
      WHERE r.publication_status IN ('pending_checks', 'held')
      ORDER BY r.created_at ASC;
    `);

    return NextResponse.json({ reports: res.rows });
  } catch (err: any) {
    return errorResponse(err);
  }
}
