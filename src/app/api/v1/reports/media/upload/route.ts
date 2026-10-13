import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/db/client';
import { processAndQuarantinePhoto } from '@/lib/media';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const reportId = formData.get('report_id') as string | null;

    if (!file || !reportId) {
      return NextResponse.json({ error: 'file and report_id are required' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Process photo through sharp pipeline
    const processResult = await processAndQuarantinePhoto(buffer, reportId);

    // Save media record into database
    const res = await query(`
      INSERT INTO report_media (
        report_id, storage_key_quarantine, storage_key_derivative, mime_type, file_size_bytes, sha256,
        width, height, review_status, processed_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, 'approved', NOW()
      )
      RETURNING id, storage_key_derivative, review_status;
    `, [
      reportId,
      processResult.quarantine_key,
      processResult.derivative_key,
      processResult.mime_type,
      processResult.derivative_bytes,
      processResult.sha256,
      processResult.width,
      processResult.height,
    ]);

    return NextResponse.json({
      success: true,
      media: res.rows[0],
      derivative_url: processResult.derivative_url,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
