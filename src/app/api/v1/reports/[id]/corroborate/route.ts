import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/db/client';
import { verifySessionToken } from '@/lib/auth';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params; // incident_id or report_id

  try {
    const body = await req.json();
    const { verdict = 'confirms_problem', comment, observation_time = new Date().toISOString() } = body;

    let actorId: string;
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const claims = await verifySessionToken(authHeader.substring(7));
      if (!claims?.sub) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      actorId = claims.sub;
    } else if (body.actor_id) {
      actorId = body.actor_id;
    } else {
      return NextResponse.json({ error: 'Authentication required for corroboration' }, { status: 401 });
    }

    const res = await query(`
      SELECT corroborate_incident_atomic(
        $1::uuid,
        $2::uuid,
        $3::timestamptz,
        $4::text,
        $5::text
      ) as result;
    `, [actorId, id, observation_time, verdict, comment || null]);

    return NextResponse.json({
      success: true,
      corroboration: res.rows[0].result,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
