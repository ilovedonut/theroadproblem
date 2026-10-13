import { query } from "@/db/client";
import { requireAccount } from "@/lib/account-server";
import { errorResponse } from "@/lib/evidence-validation";
export async function GET(req: Request) {
  try {
    const account = await requireAccount(req);
    const [reports, corrections] = await Promise.all([
      query(
        `SELECT id,incident_id,category,description,publication_status,created_at FROM reports WHERE reporter_id=$1 ORDER BY created_at DESC LIMIT 100`,
        [account.id],
      ),
      query(
        `SELECT id,incident_id,status,reason,review_reason,created_at FROM location_corrections WHERE requester_id=$1 ORDER BY created_at DESC LIMIT 100`,
        [account.id],
      ),
    ]);
    return Response.json(
      { reports: reports.rows, corrections: corrections.rows },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
