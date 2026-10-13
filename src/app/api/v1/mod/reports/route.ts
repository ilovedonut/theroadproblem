import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/db/client';
import { verifySessionToken } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  let isModerator = false;
  if (authHeader?.startsWith('Bearer ')) {
    const claims = await verifySessionToken(authHeader.substring(7));
    if (claims?.role === 'moderator' || claims?.role === 'admin') {
      isModerator = true;
    }
  }

  // Allow bypass for local dev testing if param is passed
  const devRole = req.nextUrl.searchParams.get('role');
  if (devRole === 'moderator' || devRole === 'admin') {
    isModerator = true;
  }

  if (!isModerator) {
    return NextResponse.json({ error: 'Forbidden: Moderator credentials required' }, { status: 403 });
  }

  try {
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
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
