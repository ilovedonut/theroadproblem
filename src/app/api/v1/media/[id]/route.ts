import { query } from "@/db/client";
import { getPublicDerivative } from "@/lib/storage";
import { uuid, RequestError, errorResponse } from "@/lib/evidence-validation";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = uuid((await params).id);
    const media = await query(
      `SELECT m.storage_key_derivative FROM report_media m JOIN reports r ON r.id=m.report_id
      WHERE m.id=$1 AND m.review_status='approved' AND r.publication_status='published'`,
      [id],
    );
    const key = media.rows[0]?.storage_key_derivative;
    if (!key || !key.startsWith("derivatives/"))
      throw new RequestError("Photo not found.", 404);
    const photo = await getPublicDerivative(key);
    if (!photo) throw new RequestError("Photo not found.", 404);
    return new Response(new Uint8Array(photo), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
