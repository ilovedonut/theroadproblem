import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/db/client';
import { verifySessionToken } from '@/lib/auth';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params; // incident_id

  try {
    const body = await req.json();
    const { status = 'resolved', evidence_description, observed_at = new Date().toISOString() } = body;

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
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const res = await query(`
      SELECT record_repair_atomic(
        $1::uuid,
        $2::uuid,
        $3::text,
        $4::text,
        $5::timestamptz
      ) as result;
    `, [actorId, id, status, evidence_description || 'Surface repaired and restored', observed_at]);

    return NextResponse.json({
      success: true,
      repair: res.rows[0].result,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
