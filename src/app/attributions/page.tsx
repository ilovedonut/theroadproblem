'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function AttributionsPage() {
  const [erasureUserId, setErasureUserId] = useState('');
  const [erasureLoading, setErasureLoading] = useState(false);
  const [erasureResult, setErasureResult] = useState<any>(null);
  const [erasureError, setErasureError] = useState<string | null>(null);

  const handleErasureRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setErasureLoading(true);
    setErasureError(null);
    setErasureResult(null);

    try {
      let uid = erasureUserId.trim();
      if (!uid) {
        uid = localStorage.getItem('trp_actor_id') || '';
      }
      if (!uid) {
        throw new Error('Please enter your User UUID or submit a report first so a session exists.');
      }

      const res = await fetch('/api/v1/compliance/erasure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: uid }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Erasure request failed');
      }

      setErasureResult(json);
      localStorage.removeItem('trp_actor_id');
      localStorage.removeItem('trp_offline_drafts');
    } catch (err: any) {
      setErasureError(err.message);
    } finally {
      setErasureLoading(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-ink dark:text-ink">
          Data Sources, Attributions & Legal Compliance
        </h1>
        <p className="text-sm text-quiet dark:text-muted mt-2">
          Transparent accounting of basemaps, official procurement registries, licensing frameworks, and privacy rights under Indian law.
        </p>
      </div>

      {/* Source Registry Table */}
      <section aria-label="Data Source Registry" className="bg-white dark:bg-surface border border-line dark:border-line rounded-xl p-5 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-ink dark:text-ink uppercase tracking-wider">
          Official & Community Source Registry
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-line dark:border-line text-quiet font-semibold">
                <th className="pb-2">Layer</th>
                <th className="pb-2">Source / Publisher</th>
                <th className="pb-2">Licence</th>
                <th className="pb-2">Provenance Integrity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line dark:divide-line text-ink dark:text-muted">
              <tr>
                <td className="py-2.5 font-bold">Basemap</td>
                <td className="py-2.5">OpenStreetMap Contributors</td>
                <td className="py-2.5 font-mono text-[11px]">ODbL 1.0</td>
                <td className="py-2.5 text-quiet">Vector tiles rendered directly via MapLibre GL</td>
              </tr>
              <tr>
                <td className="py-2.5 font-bold">National Highways</td>
                <td className="py-2.5">NHAI / MoRTH Data Portal</td>
                <td className="py-2.5 font-mono text-[11px]">GODL-India</td>
                <td className="py-2.5 text-quiet">Official package awards with contractor CIN/GSTIN</td>
              </tr>
              <tr>
                <td className="py-2.5 font-bold">Rural Corridors</td>
                <td className="py-2.5">PMGSY / NRRDA Online OMMAS</td>
                <td className="py-2.5 font-mono text-[11px]">ODbL / GODL</td>
                <td className="py-2.5 text-quiet">Habitation road records and maintenance awards</td>
              </tr>
              <tr>
                <td className="py-2.5 font-bold">Urban Municipal</td>
                <td className="py-2.5">BBMP / OpenCity Urban Data Portal</td>
                <td className="py-2.5 font-mono text-[11px]">GODL-India</td>
                <td className="py-2.5 text-quiet">Road history & ward public work job codes</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-muted italic pt-2">
          Government Open Data License (GODL) India applies to all official procurement records cited. Attribution is provided per Section 3 of GODL. Corporate contractor linkages are factual procurement statements and do not constitute defamatory claims.
        </p>
      </section>

      {/* Statutory Grievance Redressal Mechanism */}
      <section aria-label="Grievance Redressal" className="bg-white dark:bg-surface border border-line dark:border-line rounded-xl p-5 shadow-sm space-y-3">
        <h2 className="text-base font-bold text-ink dark:text-ink uppercase tracking-wider">
          Statutory Grievance Redressal
        </h2>
        <p className="text-xs text-quiet dark:text-muted leading-relaxed">
          In accordance with the <strong>Digital Personal Data Protection Act, 2023</strong> and Rule 3(2) of the <strong>Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021</strong>, the details of the designated Grievance Redressal Officer are provided below:
        </p>

        <div className="bg-surface dark:bg-soft/60 p-4 rounded-lg text-xs space-y-1.5">
          <div><strong className="text-ink dark:text-ink">Grievance Officer:</strong> {process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER || 'Grievance Redressal Officer'}</div>
          <div><strong className="text-ink dark:text-ink">Organization:</strong> {process.env.NEXT_PUBLIC_OPERATOR_NAME || 'Civic Infrastructure Watch Foundation'}</div>
          <div><strong className="text-ink dark:text-ink">Email:</strong> <a href={`mailto:${process.env.NEXT_PUBLIC_OPERATOR_EMAIL || 'grievance@theroadproblem.quest'}`} className="text-blue-600 underline">{process.env.NEXT_PUBLIC_OPERATOR_EMAIL || 'grievance@theroadproblem.quest'}</a></div>
          <div><strong className="text-ink dark:text-ink">Physical Office:</strong> Bangalore Urban, Karnataka 560001, India</div>
          <div><strong className="text-ink dark:text-ink">Statutory Response Window:</strong> Acknowledged within 24 hours; redressed within 15 calendar days.</div>
        </div>
      </section>

      {/* Right to Erasure (DPDP Act) */}
      <section aria-label="Personal Data Erasure" className="bg-white dark:bg-surface border border-line dark:border-line rounded-xl p-5 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-bold text-ink dark:text-ink uppercase tracking-wider">
            Self-Service Personal Data Erasure (DPDP Act)
          </h2>
          <p className="text-xs text-quiet mt-1">
            Exercise your statutory right to erasure. Erasing your profile immediately purges all personal emails, usernames, and session identifiers, while preserving non-personal civic audit logs.
          </p>
        </div>

        <form onSubmit={handleErasureRequest} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-ink dark:text-muted mb-1">
              User UUID to Erase (Leave blank to use current local session)
            </label>
            <input
              type="text"
              placeholder="e.g. 11111111-1111-4111-8111-111111111111"
              value={erasureUserId}
              onChange={(e) => setErasureUserId(e.target.value)}
              className="w-full text-xs p-2.5 rounded border border-line dark:border-line bg-white dark:bg-soft font-mono"
            />
          </div>

          {erasureError && (
            <div className="p-2.5 bg-red-100 text-red-700 text-xs rounded">
              {erasureError}
            </div>
          )}

          {erasureResult && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-positive dark:text-positive border border-emerald-200 dark:border-emerald-800 text-xs rounded space-y-1">
              <div className="font-bold">✓ Erasure Executed Successfully:</div>
              <div>User identifiers scrubbed and marked deleted. Historical civic audit events preserved without personal linkage.</div>
            </div>
          )}

          <button
            type="submit"
            disabled={erasureLoading}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg transition disabled:opacity-50 shadow-sm"
          >
            {erasureLoading ? 'Executing Erasure...' : 'Permanently Erase My Personal Identifiers'}
          </button>
        </form>
      </section>

      {/* Navigation Return */}
      <div className="text-center pt-4">
        <Link href="/" className="text-xs text-warning font-bold hover:underline">
          ← Return to Public Road Index
        </Link>
      </div>
    </main>
  );
}
