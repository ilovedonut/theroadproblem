'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { LocationCorrection } from '@/components/LocationCorrection';
import { AccountPanel } from '@/components/AccountPanel';

export default function IncidentDetailPage() {
  const params = useParams();
  const incidentId = params?.id as string;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Corroboration and Repair form states
  const [isCorroborating, setIsCorroborating] = useState(false);
  const [corroborateVerdict, setCorroborateVerdict] = useState('confirms_problem');
  const [corroborateComment, setCorroborateComment] = useState('');
  const [corroborateSubmitting, setCorroborateSubmitting] = useState(false);
  const [corroborateError, setCorroborateError] = useState<string | null>(null);
  const [corroborateSuccess, setCorroborateSuccess] = useState(false);

  const [isRepairing, setIsRepairing] = useState(false);
  const [repairDescription, setRepairDescription] = useState('');
  const [repairSubmitting, setRepairSubmitting] = useState(false);
  const [repairError, setRepairError] = useState<string | null>(null);
  const [repairSuccess, setRepairSuccess] = useState(false);

  const fetchIncident = () => {
    if (!incidentId) return;
    fetch(`/api/v1/incidents/${incidentId}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchIncident();
  }, [incidentId]);

  const handleCorroborate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCorroborateSubmitting(true);
    setCorroborateError(null);

    try {
      const res = await fetch(`/api/v1/reports/${incidentId}/corroborate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verdict: corroborateVerdict,
          comment: corroborateComment,
          observation_time: new Date().toISOString()
        })
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error || 'Failed to submit corroboration');
      }

      setCorroborateSuccess(true);
      setIsCorroborating(false);
      fetchIncident();
    } catch (err: any) {
      setCorroborateError(err.message);
    } finally {
      setCorroborateSubmitting(false);
    }
  };

  const handleRepair = async (e: React.FormEvent) => {
    e.preventDefault();
    setRepairSubmitting(true);
    setRepairError(null);

    try {
      const res = await fetch(`/api/v1/reports/${incidentId}/repair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'resolved',
          evidence_description: repairDescription || 'Surface repair completed',
          observed_at: new Date().toISOString()
        })
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error || 'Failed to record repair');
      }

      setRepairSuccess(true);
      setIsRepairing(false);
      fetchIncident();
    } catch (err: any) {
      setRepairError(err.message);
    } finally {
      setRepairSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-soft dark:bg-soft rounded w-1/3"></div>
          <div className="h-24 bg-surface dark:bg-soft rounded"></div>
        </div>
      </main>
    );
  }

  if (error || !data || !data.incident) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-red-700 dark:text-danger">
          <h2 className="font-semibold text-lg">Observation Not Found</h2>
          <p className="text-sm mt-1">{error || 'The requested incident could not be found.'}</p>
          <Link href="/" className="inline-block mt-4 text-sm font-medium underline">
            Return to Explore
          </Link>
        </div>
      </main>
    );
  }

  const { incident, reports, corroborations, predecessor } = data;

  return (
    <main className="max-w-3xl mx-auto px-4 py-6 w-full overflow-y-auto">
      <LocationCorrection incidentId={incidentId} lat={Number(incident.lat)} lon={Number(incident.lon)} />
      {(isCorroborating || isRepairing) && <AccountPanel />}
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-4 text-xs text-quiet dark:text-muted">
        <Link href="/" className="hover:underline">Explore</Link>
        <span className="mx-2">/</span>
        {incident.road_id ? (
          <Link href={`/roads/${incident.road_id}`} className="hover:underline">
            {incident.road_name || incident.road_ref || 'Road Corridor'}
          </Link>
        ) : (
          <span>Unmatched Corridor</span>
        )}
        <span className="mx-2">/</span>
        <span className="font-medium text-ink dark:text-ink">Incident #{incident.id.substring(0, 8)}</span>
      </nav>

      {/* Recurrence Banner if predecessor exists */}
      {predecessor && (
        <div className="mb-4 p-3 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 rounded-lg text-xs text-source dark:text-source flex items-center justify-between">
          <span>
            🔄 <strong>Recurrent Defect:</strong> Linked to previously repaired incident from{' '}
            {new Date(predecessor.first_observed_at).toLocaleDateString()}.
          </span>
          <Link href={`/incidents/${predecessor.id}`} className="font-bold underline">
            View Prior Episode →
          </Link>
        </div>
      )}

      {/* Incident Header Card */}
      <div className="bg-white dark:bg-surface border border-line dark:border-line rounded-xl p-5 mb-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 text-xs font-bold rounded bg-amber-100 dark:bg-amber-950 text-warning dark:text-warning uppercase">
              {incident.category.replace('_', ' ')}
            </span>
            <span className={`px-2 py-0.5 text-xs font-semibold rounded ${
              incident.lifecycle_status === 'resolved'
                ? 'bg-emerald-100 dark:bg-emerald-950 text-positive dark:text-positive'
                : 'bg-rose-100 dark:bg-rose-950 text-danger dark:text-danger'
            }`}>
              {incident.lifecycle_status.toUpperCase()}
            </span>
            <span className="text-xs text-quiet">
              {incident.verification_state === 'corroborated' ? '✓ Corroborated' : '• Reported'}
            </span>
          </div>

          <div className="text-xs text-quiet">
            Coordinates: {Number(incident.lat).toFixed(4)}, {Number(incident.lon).toFixed(4)}
          </div>
        </div>

        <h1 className="text-xl font-bold text-ink dark:text-ink mt-2">
          {incident.road_name ? `${incident.road_name} (${incident.road_ref || ''})` : 'Civic Road Observation'}
        </h1>
        <p className="text-xs text-quiet mt-1">
          Authority Jurisdiction: {incident.authority_name || 'Municipal / State Authority'} • District: {incident.district || 'N/A'}, {incident.state || 'N/A'}
        </p>

        {/* Action Buttons */}
        {incident.lifecycle_status === 'active' && (
          <div className="flex flex-wrap gap-3 mt-5 pt-4 border-t border-line dark:border-line">
            <button
              onClick={() => { setIsCorroborating(!isCorroborating); setIsRepairing(false); }}
              className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition shadow-sm"
            >
              + Corroborate ({corroborations?.length || 0})
            </button>
            <button
              onClick={() => { setIsRepairing(!isRepairing); setIsCorroborating(false); }}
              className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-sm"
            >
              ✓ Report Road Repaired
            </button>
          </div>
        )}
      </div>

      {/* Corroborate Form Drawer */}
      {isCorroborating && (
        <form onSubmit={handleCorroborate} className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-800 rounded-xl p-4 mb-6">
          <h2 className="text-sm font-bold text-ink dark:text-ink mb-2">Corroborate This Road Issue</h2>
          {corroborateError && (
            <div className="p-2 mb-3 bg-red-100 text-red-700 text-xs rounded">{corroborateError}</div>
          )}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-ink dark:text-muted mb-1">
                Your Assessment
              </label>
              <select
                value={corroborateVerdict}
                onChange={e => setCorroborateVerdict(e.target.value)}
                className="w-full text-xs p-2 rounded border border-line dark:border-line bg-white dark:bg-soft text-ink dark:text-ink"
              >
                <option value="confirms_problem">Confirms Problem (Defect Present)</option>
                <option value="disputes_problem">Disputes Problem (Surface Clear / Not as Reported)</option>
                <option value="reports_fixed">Reports Fixed (Issue Has Been Resolved)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink dark:text-muted mb-1">
                Field Observation Notes (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Deep crater near bus stop, traffic slowing significantly"
                value={corroborateComment}
                onChange={e => setCorroborateComment(e.target.value)}
                className="w-full text-xs p-2 rounded border border-line dark:border-line bg-white dark:bg-soft text-ink dark:text-ink"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setIsCorroborating(false)}
                className="px-3 py-1.5 text-xs rounded border border-line text-quiet dark:text-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={corroborateSubmitting}
                className="px-4 py-1.5 text-xs font-bold rounded bg-amber-600 text-white disabled:opacity-50"
              >
                {corroborateSubmitting ? 'Submitting...' : 'Confirm Corroboration'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Repair Form Drawer */}
      {isRepairing && (
        <form onSubmit={handleRepair} className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-300 dark:border-emerald-800 rounded-xl p-4 mb-6">
          <h2 className="text-sm font-bold text-ink dark:text-ink mb-2">Record Ground Repair</h2>
          {repairError && (
            <div className="p-2 mb-3 bg-red-100 text-red-700 text-xs rounded">{repairError}</div>
          )}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-ink dark:text-muted mb-1">
                Repair Verification Details
              </label>
              <input
                type="text"
                placeholder="e.g. Asphalting completed by municipal contractor, surface smooth"
                value={repairDescription}
                onChange={e => setRepairDescription(e.target.value)}
                className="w-full text-xs p-2 rounded border border-line dark:border-line bg-white dark:bg-soft text-ink dark:text-ink"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setIsRepairing(false)}
                className="px-3 py-1.5 text-xs rounded border border-line text-quiet dark:text-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={repairSubmitting}
                className="px-4 py-1.5 text-xs font-bold rounded bg-emerald-600 text-white disabled:opacity-50"
              >
                {repairSubmitting ? 'Recording...' : 'Mark as Repaired'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Citizen Observations Feed */}
      <section aria-label="Field Observations" className="mb-6 space-y-4">
        <h2 className="text-sm font-bold text-ink dark:text-ink uppercase tracking-wider">
          Field Reports ({reports?.length || 0})
        </h2>
        {reports && reports.length > 0 ? (
          reports.map((rep: any) => (
            <div
              key={rep.id}
              className="bg-white dark:bg-surface border border-line dark:border-line rounded-lg p-4 shadow-sm"
            >
              <div className="flex items-center justify-between text-xs text-quiet mb-2">
                <span>
                  Reported by: <strong>{rep.is_anonymous_public ? 'Anonymous Citizen' : rep.reporter_name}</strong>
                </span>
                <span>Observed on {new Date(rep.observed_at).toLocaleDateString()}</span>
              </div>
              <p className="text-sm text-ink dark:text-ink leading-relaxed">
                {rep.description || 'No additional commentary provided.'}
              </p>

              {/* Photo Derivatives */}
              {rep.approved_media && rep.approved_media.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {rep.approved_media.map((m: any) => (
                    <div
                      key={m.id}
                      className="w-24 h-24 rounded-lg overflow-hidden border border-line dark:border-line bg-surface dark:bg-soft flex items-center justify-center text-[10px] text-muted"
                    >
                      <a href={`/api/v1/media/${m.id}`} target="_blank" rel="noopener noreferrer" className="block w-full h-full" aria-label="Open evidence photo">
                        <img src={`/api/v1/media/${m.id}`} alt="Citizen evidence of this road issue" loading="lazy" className="w-full h-full object-cover" />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="p-4 text-xs text-quiet bg-white dark:bg-surface border border-line dark:border-line rounded-lg">
            No public observation text recorded.
          </div>
        )}
      </section>

      {/* Corroborations Log */}
      <section aria-label="Independent Corroborations" className="space-y-3">
        <h2 className="text-sm font-bold text-ink dark:text-ink uppercase tracking-wider">
          Corroboration Activity ({corroborations?.length || 0})
        </h2>
        {corroborations && corroborations.length > 0 ? (
          corroborations.map((c: any) => (
            <div
              key={c.id}
              className="p-3 bg-white dark:bg-surface border border-line dark:border-line rounded-lg text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink dark:text-ink">
                  {c.actor_name || 'Community Member'}
                </span>
                <span className="text-muted">
                  {new Date(c.observation_time).toLocaleString()}
                </span>
              </div>
              <div className="mt-1 text-quiet dark:text-muted">
                Verdict: <span className="font-medium uppercase">{c.verdict.replace('_', ' ')}</span>
                {c.comment && <span> — &quot;{c.comment}&quot;</span>}
              </div>
            </div>
          ))
        ) : (
          <div className="p-4 text-xs text-quiet bg-white dark:bg-surface border border-line dark:border-line rounded-lg">
            No independent corroborations submitted yet.
          </div>
        )}
      </section>
    </main>
  );
}
