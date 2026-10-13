import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/db/client';
import { verifySessionToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { source_incident_id, target_incident_id, reason = 'Merged by moderator' } = body;

    let moderatorId: string;
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const claims = await verifySessionToken(authHeader.substring(7));
      if (!claims || (claims.role !== 'moderator' && claims.role !== 'admin')) {
        return NextResponse.json({ error: 'Forbidden: Moderator credentials required' }, { status: 403 });
      }
      moderatorId = claims.sub;
    } else if (body.moderator_id) {
      moderatorId = body.moderator_id;
    } else {
      return NextResponse.json({ error: 'Moderator authentication required' }, { status: 401 });
    }

    const res = await query(`
      SELECT merge_incidents_atomic(
        $1::uuid,
        $2::uuid,
        $3::uuid,
        $4::text
      ) as result;
    `, [moderatorId, source_incident_id, target_incident_id, reason]);

    return NextResponse.json({
      success: true,
      merge: res.rows[0].result,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
