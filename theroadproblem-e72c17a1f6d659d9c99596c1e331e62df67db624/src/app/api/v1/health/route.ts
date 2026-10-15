import { NextResponse } from 'next/server';
import { query } from '@/db/client';

export async function GET() {
  try {
    const postgisRes = await query('SELECT PostGIS_Version();');
    const tableRes = await query(`
      SELECT count(*) as road_count FROM roads;
    `);

    return NextResponse.json({
      status: 'healthy',
      database: 'connected',
      postgis: postgisRes.rows[0]?.postgis_version || 'unknown',
      total_roads_indexed: parseInt(tableRes.rows[0]?.road_count || '0', 10),
      timestamp: new Date().toISOString(),
      version: '0.1.0'
    });
  } catch (err: any) {
    return NextResponse.json(
      { status: 'unhealthy', error: err.message, timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}
