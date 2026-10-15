import { NextRequest, NextResponse } from "next/server";
import { query } from "@/db/client";
import { requireAccount, clearSession } from "@/lib/account-server";
import { errorResponse } from "@/lib/evidence-validation";

export async function POST(req: NextRequest) {
  try {
    const userId = (await requireAccount(req)).id;

    // 1. Wipe personal identifiers in users table
    await query(
      `
      UPDATE users 
      SET 
        display_name = 'Former Contributor',
        email_private = 'erased_' || id || '@redacted.invalid',
        is_anonymous_public = TRUE,
        deleted_at = NOW()
      WHERE id = $1;
    `,
      [userId],
    );

    // 2. Anonymize personal references in audit events while preserving non-personal civic audit history
    await query(
      `
      UPDATE events
      SET actor_id = NULL,
          reason = 'Actor detached per DPDP statutory erasure request'
      WHERE actor_id = $1;
    `,
      [userId],
    );

    await clearSession();
    return NextResponse.json({
      success: true,
      erased_user_id: userId,
      status: "personal_data_erased",
      civic_history_preserved: true,
      compliance: {
        act: "Digital Personal Data Protection Act, 2023 / DPDP Rules 2025",
        operator:
          process.env.NEXT_PUBLIC_OPERATOR_NAME ||
          "Civic Infrastructure Watch Foundation",
        grievance_email:
          process.env.NEXT_PUBLIC_OPERATOR_EMAIL ||
          "grievance@theroadproblem.quest",
        officer:
          process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER ||
          "Grievance Redressal Officer",
      },
    });
  } catch (err: any) {
    return errorResponse(err);
  }
}
