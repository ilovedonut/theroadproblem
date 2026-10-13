"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { AccountPanel } from "@/components/AccountPanel";
import { CorrectionQueue } from "@/components/CorrectionQueue";

export default function ModeratorQueuePage() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Incident Merge Tool state
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [mergeReason, setMergeReason] = useState(
    "Duplicate observation confirmed by field review",
  );
  const [merging, setMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState<any>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);

  useEffect(() => {
    fetchHeldReports();
    const refresh = () => {
      void fetchHeldReports();
    };
    window.addEventListener("trp-account-changed", refresh);
    return () => window.removeEventListener("trp-account-changed", refresh);
  }, []);

  const fetchHeldReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/mod/reports");
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error(
            "Access Denied: You do not have moderator credentials.",
          );
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      setReports(json.reports || []);
    } catch (err: any) {
      setError(err.message);
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  const handleMerge = async (e: React.FormEvent) => {
    e.preventDefault();
    setMerging(true);
    setMergeError(null);
    setMergeResult(null);

    try {
      const res = await fetch("/api/v1/mod/incidents/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_incident_id: sourceId.trim(),
          target_incident_id: targetId.trim(),
          reason: mergeReason,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Incident merge failed");
      }

      setMergeResult(json.merge);
      setSourceId("");
      setTargetId("");
    } catch (err: any) {
      setMergeError(err.message);
    } finally {
      setMerging(false);
    }
  };

  return (
    <main className="max-w-4xl mx-auto px-4 py-6 w-full overflow-y-auto">
      <AccountPanel />
      <CorrectionQueue />
      {/* Header and Role Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">
            Moderation & Curatorial Console
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Review quarantined observations, triage abuse reports, and merge
            duplicate incident episodes.
          </p>
        </div>

        <p className="text-sm text-slate-400">
          Access follows your signed-in account.
        </p>
      </div>

      {/* Access Denied Card if unprivileged */}
      {error && (
        <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-800 dark:text-rose-300 text-xs">
          <strong>Security Restriction:</strong> {error}
        </div>
      )}

      {/* Grid: Held Reports Queue & Merge Incident Tool */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Held / Pending Reports */}
        <section aria-label="Held Observations Queue">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Under Review ({reports.length})
            </h2>
            <button
              onClick={fetchHeldReports}
              className="text-xs text-amber-600 font-semibold hover:underline"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-400 text-xs">
              Loading queue...
            </div>
          ) : reports.length > 0 ? (
            <div className="space-y-3">
              {reports.map((rep) => (
                <div
                  key={rep.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm text-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-rose-600 uppercase">
                      Status: {rep.publication_status}
                    </span>
                    <span className="text-slate-400">
                      {new Date(rep.observed_at).toLocaleDateString()}
                    </span>
                  </div>

                  <p className="text-slate-800 dark:text-slate-200 font-medium">
                    &quot;{rep.description}&quot;
                  </p>

                  <div className="text-[11px] text-slate-500 flex justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
                    <span>Reporter: {rep.reporter_name}</span>
                    <span>
                      Reason: {rep.moderation_reason || "Automated filter"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500 text-xs">
              ✓ All clear! No reports currently flagged for moderation.
            </div>
          )}
        </section>

        {/* Right Column: Transactional Incident Merge Tool */}
        <section aria-label="Incident Merge Tool">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3">
            Atomic Incident Merge Tool
          </h2>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm text-xs">
            <p className="text-slate-500 mb-4 leading-relaxed">
              Consolidates duplicate episodes. Re-parents all reports, media
              derivatives, and corroborations from the source incident into the
              canonical target incident. Retains full history and projects an
              audit event.
            </p>

            <form onSubmit={handleMerge} className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Source Incident UUID (To be marked &apos;merged&apos;) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. bbbbbbbb-2222-4222-8222-222222222222"
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  className="w-full p-2.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Target Incident UUID (Canonical episode to keep active) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. aaaaaaaa-1111-4111-8111-111111111111"
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="w-full p-2.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Curatorial Justification *
                </label>
                <input
                  type="text"
                  required
                  value={mergeReason}
                  onChange={(e) => setMergeReason(e.target.value)}
                  className="w-full p-2.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
              </div>

              {mergeError && (
                <div className="p-2 bg-red-100 text-red-700 rounded font-medium">
                  {mergeError}
                </div>
              )}

              {mergeResult && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded space-y-1">
                  <div className="font-bold">✓ Merge Completed Atomically:</div>
                  <div>
                    Transferred {mergeResult.reports_transferred} report(s) and{" "}
                    {mergeResult.corroborations_transferred} corroboration(s).
                  </div>
                  <Link
                    href={`/incidents/${mergeResult.target_id}`}
                    className="font-bold underline block mt-1"
                  >
                    Open Canonical Target Incident →
                  </Link>
                </div>
              )}

              <button
                type="submit"
                disabled={merging}
                className="w-full py-2.5 bg-slate-900 hover:bg-black dark:bg-amber-600 dark:hover:bg-amber-700 text-white font-bold rounded-lg transition disabled:opacity-50 mt-2"
              >
                {merging
                  ? "Executing Atomic Merge..."
                  : "Execute Transactional Merge"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
