import { NextRequest, NextResponse } from 'next/server';
import { runAllIngestors } from '@/lib/ingestor/runner';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: NextRequest) {
  try {
    const summary = await runAllIngestors();
    return NextResponse.json({
      status: 'success',
      message: 'Ingestion refresh cycle completed successfully',
      summary
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      }
    });
  } catch (err: any) {
    console.error('Error triggering ingestion refresh:', err);
    return NextResponse.json({
      status: 'error',
      error: err.message
    }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
