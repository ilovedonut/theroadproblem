import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/db/client';
import { verifySessionToken } from '@/lib/auth';
import { areSubmissionsEnabled } from '@/lib/ops';

export async function POST(req: NextRequest) {
  if (!areSubmissionsEnabled()) {
    return NextResponse.json(
      { error: 'Service Unavailable: Submissions intake temporarily paused by operations killswitch' },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const {
      lon,
      lat,
      category,
      observed_status = 'damaged',
      description,
      observed_at = new Date().toISOString(),
      idempotency_key,
      target_incident_id,
      target_segment_id,
      reporter_display_name,
    } = body;

    if (lon === undefined || lat === undefined || !category || !description) {
      return NextResponse.json(
        { error: 'Missing required fields: lon, lat, category, description' },
        { status: 400 }
      );
    }

    // Authenticate actor from token or resolve anonymous pseudonymous user
    let reporterId: string;
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const claims = await verifySessionToken(authHeader.substring(7));
      if (claims?.sub) {
        reporterId = claims.sub;
      } else {
        return NextResponse.json({ error: 'Invalid or expired auth token' }, { status: 401 });
      }
    } else {
      // Create or use pseudonymous session user
      const guestId = body.reporter_id || '99990000-0000-4000-8000-000000000001';
      await query(`
        INSERT INTO users (id, display_name, email_private, role, is_anonymous_public)
        VALUES ($1, $2, $3, 'citizen', TRUE)
        ON CONFLICT (id) DO NOTHING;
      `, [guestId, reporter_display_name || 'Pseudonymous Citizen', `${guestId}@anon.local`]);
      reporterId = guestId;
    }

    const res = await query(`
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
    `, [
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
    ]);

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
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
