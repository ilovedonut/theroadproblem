import { NextRequest, NextResponse } from "next/server";
import { query } from "@/db/client";
import { processAndQuarantinePhoto } from "@/lib/media";
import { requireAccount } from "@/lib/account-server";
import { uuid, RequestError, errorResponse } from "@/lib/evidence-validation";
import crypto from "node:crypto";

export async function POST(req: NextRequest) {
  try {
    const account = await requireAccount(req);
    const declaredLength = Number(req.headers.get("content-length") || 0);
    if (declaredLength > 9 * 1024 * 1024)
      throw new RequestError("Photo must be smaller than 8 MB.", 413);
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const reportId = formData.get("report_id") as string | null;

    if (!file || !reportId) {
      return NextResponse.json(
        { error: "file and report_id are required" },
        { status: 400 },
      );
    }

    uuid(reportId);
    if (typeof file.arrayBuffer !== "function" || file.size > 8 * 1024 * 1024)
      throw new RequestError("Choose a photo smaller than 8 MB.", 413);
    const owned = await query(
      "SELECT id FROM reports WHERE id = $1 AND reporter_id = $2",
      [reportId, account.id],
    );
    if (!owned.rowCount)
      throw new RequestError(
        "You can only attach photos to your own reports.",
        403,
      );

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
    const existing = await query(
      "SELECT id, storage_key_derivative, review_status FROM report_media WHERE report_id = $1 AND sha256 = $2",
      [reportId, checksum],
    );
    if (existing.rowCount)
      return NextResponse.json({ success: true, media: existing.rows[0] });

    // Process photo through sharp pipeline
    const processResult = await processAndQuarantinePhoto(buffer, reportId);

    // Save media record into database
    const res = await query(
      `
      INSERT INTO report_media (
        report_id, storage_key_quarantine, storage_key_derivative, mime_type, file_size_bytes, sha256,
        width, height, review_status, processed_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, 'approved', NOW()
      )
      ON CONFLICT (report_id, sha256) DO UPDATE SET sha256 = EXCLUDED.sha256
      RETURNING id, storage_key_derivative, review_status;
    `,
      [
        reportId,
        processResult.quarantine_key,
        processResult.derivative_key,
        processResult.mime_type,
        processResult.derivative_bytes,
        processResult.sha256,
        processResult.width,
        processResult.height,
      ],
    );

    return NextResponse.json({
      success: true,
      media: res.rows[0],
      derivative_url: processResult.derivative_url,
    });
  } catch (err: any) {
    return errorResponse(err);
  }
}
