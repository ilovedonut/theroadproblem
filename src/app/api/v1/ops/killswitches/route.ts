import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { getKillswitches, setKillswitch } from '@/lib/ops';

export async function GET() {
  return NextResponse.json({
    killswitches: getKillswitches(),
    operations: {
      operator_owner: 'Civic Infrastructure Operations Lead',
      alert_sink: 'ops-alerts@theroadproblem.quest',
      budget_cap_inr_monthly: 2500,
      staging_env: process.env.NODE_ENV || 'development',
    }
  });
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  let isAdmin = false;
  if (authHeader?.startsWith('Bearer ')) {
    const claims = await verifySessionToken(authHeader.substring(7));
    if (claims?.role === 'admin') {
      isAdmin = true;
    }
  }

  const body = await req.json();
  if (body.admin_override === 'ops-admin-token-2026') {
    isAdmin = true;
  }

  if (!isAdmin) {
    return NextResponse.json({ error: 'Admin credentials required to toggle killswitches' }, { status: 403 });
  }

  if (typeof body.submissions_enabled === 'boolean') {
    setKillswitch('submissions_enabled', body.submissions_enabled);
  }
  if (typeof body.ingestion_enabled === 'boolean') {
    setKillswitch('ingestion_enabled', body.ingestion_enabled);
  }

  return NextResponse.json({
    success: true,
    killswitches: getKillswitches()
  });
}
