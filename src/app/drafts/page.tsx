'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface OfflineDraft {
  id: string;
  idempotency_key: string;
  lat: number;
  lon: number;
  category: string;
  observed_status: string;
  description: string;
  target_segment_id: string | null;
  road_name: string;
  created_at: string;
  photo_name: string | null;
}

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<OfflineDraft[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<{ id: string; success: boolean; error?: string; incident_id?: string }[]>([]);

  useEffect(() => {
    loadDrafts();
  }, []);

  const loadDrafts = () => {
    const raw = localStorage.getItem('trp_offline_drafts');
    if (raw) {
      try {
        setDrafts(JSON.parse(raw));
      } catch (e) {
        setDrafts([]);
      }
    } else {
      setDrafts([]);
    }
  };

  const handleSyncAll = async () => {
    if (drafts.length === 0) return;
    setSyncing(true);
    setSyncResults([]);

    const results: { id: string; success: boolean; error?: string; incident_id?: string }[] = [];
    const remainingDrafts: OfflineDraft[] = [];

    let reporterId = localStorage.getItem('trp_actor_id');
    if (!reporterId) {
      reporterId = crypto.randomUUID();
      localStorage.setItem('trp_actor_id', reporterId);
    }

    for (const draft of drafts) {
      try {
        const res = await fetch('/api/v1/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reporter_id: reporterId,
            lat: draft.lat,
            lon: draft.lon,
            category: draft.category,
            observed_status: draft.observed_status,
            description: draft.description,
            target_segment_id: draft.target_segment_id,
            idempotency_key: draft.idempotency_key,
          }),
        });

        const json = await res.json();
        if (res.ok) {
          results.push({ id: draft.id, success: true, incident_id: json.incident_id });
        } else {
          results.push({ id: draft.id, success: false, error: json.error });
          remainingDrafts.push(draft);
        }
      } catch (err: any) {
        results.push({ id: draft.id, success: false, error: err.message });
        remainingDrafts.push(draft);
      }
    }

    localStorage.setItem('trp_offline_drafts', JSON.stringify(remainingDrafts));
    setDrafts(remainingDrafts);
    setSyncResults(results);
    setSyncing(false);
  };

  const handleDeleteDraft = (id: string) => {
    const updated = drafts.filter(d => d.id !== id);
    localStorage.setItem('trp_offline_drafts', JSON.stringify(updated));
    setDrafts(updated);
  };

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to discard all local drafts?')) {
      localStorage.removeItem('trp_offline_drafts');
      setDrafts([]);
    }
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Offline Draft Queue</h1>
          <p className="text-xs text-slate-500 mt-1">
            Observations stored on device. Reconnect and sync idempotently to publish.
          </p>
        </div>

        {drafts.length > 0 && (
          <button
            onClick={handleSyncAll}
            disabled={syncing}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg transition disabled:opacity-50 shadow-sm flex items-center gap-1.5"
          >
            {syncing ? 'Syncing...' : '🔄 Sync All Drafts'}
          </button>
        )}
      </div>

      {/* Sync Results Banner */}
      {syncResults.length > 0 && (
        <div className="mb-6 space-y-2">
          {syncResults.map((r, idx) => (
            <div
              key={idx}
              className={`p-3 text-xs rounded-lg flex items-center justify-between ${
                r.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
              }`}
            >
              <span>
                {r.success ? '✓ Successfully published draft' : `✖ Failed to sync: ${r.error}`}
              </span>
              {r.incident_id && (
                <Link href={`/incidents/${r.incident_id}`} className="font-bold underline">
                  View Published Incident →
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Drafts List */}
      {drafts.length > 0 ? (
        <div className="space-y-3">
          {drafts.map((draft) => (
            <div
              key={draft.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-xs font-bold rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 uppercase">
                      {draft.category.replace('_', ' ')}
                    </span>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {draft.road_name}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Captured: {new Date(draft.created_at).toLocaleString()} • Coords: {draft.lat.toFixed(5)}, {draft.lon.toFixed(5)}
                  </div>
                </div>

                <button
                  onClick={() => handleDeleteDraft(draft.id)}
                  className="text-xs text-rose-500 hover:text-rose-700 font-medium"
                >
                  Discard
                </button>
              </div>

              <p className="text-xs text-slate-800 dark:text-slate-200 italic mt-2 bg-slate-50 dark:bg-slate-800/40 p-2 rounded">
                &quot;{draft.description}&quot;
              </p>

              {draft.photo_name && (
                <div className="text-[11px] text-slate-500 mt-2">
                  📷 Attached file: {draft.photo_name}
                </div>
              )}
            </div>
          ))}

          <div className="pt-4 flex justify-end">
            <button
              onClick={handleClearAll}
              className="text-xs text-slate-400 hover:text-rose-500 transition"
            >
              Discard All Drafts
            </button>
          </div>
        </div>
      ) : (
        <div className="p-8 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500">
          <div className="text-3xl mb-2">📥</div>
          <h2 className="font-semibold text-sm text-slate-800 dark:text-slate-200">No Pending Drafts</h2>
          <p className="text-xs mt-1">
            When you save observations offline, they will queue here until network connectivity is restored.
          </p>
          <Link
            href="/report"
            className="inline-block mt-4 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg transition shadow-sm"
          >
            Create New Observation
          </Link>
        </div>
      )}
    </main>
  );
}
