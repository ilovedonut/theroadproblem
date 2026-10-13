import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/db/client';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search');

  try {
    let sql = `
      SELECT id, name, name_hi, state, district, type,
             ST_X(center) as lon, ST_Y(center) as lat
      FROM localities
    `;
    const params: any[] = [];
    if (search) {
      params.push(`%${search}%`);
      sql += ` WHERE name ILIKE $1 OR name_hi ILIKE $1`;
    }
    sql += ` ORDER BY name ASC LIMIT 25;`;

    const res = await query(sql, params);
    return NextResponse.json({ localities: res.rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
