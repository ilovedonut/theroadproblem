"use client";
export interface EvidenceDraft {
  id: string;
  idempotency_key: string;
  lat: number;
  lon: number;
  category: string;
  observed_status: string;
  description: string;
  target_segment_id: string | null;
  target_incident_id?: string | null;
  road_name: string;
  created_at: string;
  photo_name: string | null;
  photo_data_url?: string | null;
  report_saved?: boolean;
}

export async function publishDraft(
  draft: EvidenceDraft,
  onStage?: (stage: string) => void,
  onReportSaved?: () => void,
) {
  onStage?.("Saving your report…");
  const response = await fetch("/api/v1/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lat: draft.lat,
      lon: draft.lon,
      category: draft.category,
      observed_status: draft.observed_status,
      description: draft.description,
      target_segment_id: draft.target_segment_id,
      target_incident_id: draft.target_incident_id,
      idempotency_key: draft.idempotency_key,
    }),
  });
  const report = await response.json();
  if (!response.ok)
    throw new Error(report.error || "Could not save your report.");
  draft.report_saved = true;
  try {
    saveDraft(draft);
  } catch {
    /* Keep evidence in memory when local storage is full. */
  }
  onReportSaved?.();
  if (draft.photo_data_url) {
    onStage?.("Uploading your photo…");
    const blob = await (await fetch(draft.photo_data_url)).blob();
    const form = new FormData();
    form.append("file", blob, "evidence.webp");
    form.append("report_id", report.report_id);
    const upload = await fetch("/api/v1/reports/media/upload", {
      method: "POST",
      body: form,
    });
    const media = await upload.json();
    if (!upload.ok)
      throw new Error(
        `Your report is saved, but the photo failed: ${media.error || "please retry"}. Retry uses the same report.`,
      );
  }
  return report;
}

export function saveDraft(draft: EvidenceDraft) {
  const existing = JSON.parse(
    localStorage.getItem("trp_offline_drafts") || "[]",
  ) as EvidenceDraft[];
  localStorage.setItem(
    "trp_offline_drafts",
    JSON.stringify([...existing.filter((d) => d.id !== draft.id), draft]),
  );
}

export function removeDraft(id: string) {
  const existing = JSON.parse(
    localStorage.getItem("trp_offline_drafts") || "[]",
  ) as EvidenceDraft[];
  localStorage.setItem(
    "trp_offline_drafts",
    JSON.stringify(existing.filter((d) => d.id !== id)),
  );
}
