"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AccountPanel } from "@/components/AccountPanel";
import {
  publishDraft,
  removeDraft,
  type EvidenceDraft,
} from "@/lib/evidence-client";
export default function DraftsPage() {
  const [drafts, setDrafts] = useState<EvidenceDraft[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [stage, setStage] = useState("");
  const [results, setResults] = useState<
    { id: string; incident_id?: string; error?: string }[]
  >([]);
  function load() {
    try {
      setDrafts(JSON.parse(localStorage.getItem("trp_offline_drafts") || "[]"));
    } catch {
      setError("Unable to read drafts from this device.");
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function sync() {
    setBusy(true);
    setError("");
    const outcomes = [];
    for (const d of drafts) {
      try {
        const r = await publishDraft(d, setStage);
        removeDraft(d.id);
        outcomes.push({ id: d.id, incident_id: r.incident_id });
      } catch (e) {
        outcomes.push({
          id: d.id,
          error:
            e instanceof Error ? e.message : "Sync failed. Draft retained.",
        });
      }
    }
    setResults(outcomes);
    load();
    setStage("");
    setBusy(false);
  }
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        <h1 className="text-3xl font-semibold">Saved evidence drafts</h1>
        <p className="text-muted">
          Drafts stay on this device until both the report and its photo are
          submitted successfully.
        </p>
        <AccountPanel />
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        {results.map((r) => (
          <p
            key={r.id}
            role={r.error ? "alert" : "status"}
            className={r.error ? "text-danger" : "text-information"}
          >
            {r.error || "Evidence submitted. "}
            {r.incident_id && (
              <Link href={`/incidents/${r.incident_id}`} className="underline">
                View issue
              </Link>
            )}
          </p>
        ))}
        {drafts.length > 0 && (
          <button
            className="evidence-primary"
            disabled={busy}
            onClick={() => void sync()}
          >
            {busy ? stage || "Syncing…" : "Submit saved drafts"}
          </button>
        )}
        {!drafts.length && (
          <p className="text-muted">
            No pending drafts.{" "}
            <Link href="/report" className="text-information underline">
              Add evidence
            </Link>
          </p>
        )}
        {drafts.map((d) => (
          <article
            key={d.id}
            className="rounded-xl border border-line bg-surface p-5 space-y-3"
          >
            <h2 className="font-semibold">
              {d.category.replace(/_/g, " ")} · {d.road_name}
            </h2>
            <p className="text-sm text-muted">
              {d.lat.toFixed(5)}, {d.lon.toFixed(5)}
            </p>
            <p>{d.description}</p>
            {d.photo_data_url && (
              <img
                src={d.photo_data_url}
                alt="Saved evidence photo"
                className="max-h-48 rounded-lg object-contain"
              />
            )}
            <div className="flex gap-5 text-sm">
              <Link
                href={`/report?draft=${encodeURIComponent(d.id)}`}
                className="text-information underline"
              >
                Review draft
              </Link>
              <button
                disabled={busy}
                className="text-danger"
                onClick={() => {
                  if (!confirm("Discard this saved draft and its photo?"))
                    return;
                  try {
                    removeDraft(d.id);
                    load();
                  } catch {
                    setError("Could not remove this draft.");
                  }
                }}
              >
                Discard draft
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
