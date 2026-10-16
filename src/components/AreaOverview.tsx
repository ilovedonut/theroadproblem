'use client';
import { useEffect, useState } from 'react';
import type { MapBounds } from '@/lib/map-bounds';

const money = (v: unknown) =>
  v == null
    ? 'Not available'
    : new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
      }).format(Number(v));

export interface AreaOverviewProps {
  bounds: MapBounds | null;
  enabled?: boolean;
  cityId?: string | null;
  scheme?: string | null;
  unitId?: string | null;
}

export function AreaOverview({
  bounds,
  enabled = true,
  cityId,
  scheme,
  unitId,
}: AreaOverviewProps) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  const bboxKey = bounds?.join(',');

  useEffect(() => {
    setData(null);
    setError('');

    if (!enabled) return;

    const controller = new AbortController();

    // Prefer prepared named-area summary if cityId is present
    let url: string | null = null;
    if (cityId) {
      const qs = new URLSearchParams();
      if (scheme) qs.set('scheme', scheme);
      if (unitId) qs.set('unit_id', unitId);
      url = `/api/v1/regions/${encodeURIComponent(cityId)}/summary${qs.toString() ? '?' + qs.toString() : ''}`;
    } else if (bboxKey) {
      url = `/api/v1/map/summary?bbox=${bboxKey}`;
    }

    if (!url) return;

    const timer = setTimeout(() => {
      fetch(url!, { signal: controller.signal })
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || 'Failed to load area summary');
          setData(d);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [cityId, scheme, unitId, bboxKey, retry, enabled]);

  if (error) {
    return (
      <div role="alert" className="p-5 text-sm">
        {error}
        <button
          className="block mt-3 underline text-information"
          onClick={() => setRetry((n) => n + 1)}
        >
          Retry area summary
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <p role="status" className="p-5 text-sm text-muted">
        {enabled ? 'Updating area summary…' : 'Area totals will update after area selection.'}
      </p>
    );
  }

  const roads = Number(data.corridors_or_roads ?? data.roads ?? 0);
  const segments = Number(data.active_physical_segments ?? data.roads ?? 0);
  const ways = Number(data.unique_source_ways ?? segments);
  const issues = Number(data.public_issues_count ?? data.open_issues ?? 0);
  const motorKm = Number(data.total_length_km ?? data.motor_road_km ?? data.road_km ?? 0);
  const projects = Number(data.active_works_count ?? data.projects ?? 0);
  const contractors = data.contractors != null ? Number(data.contractors) : 'In registry';
  const boundaryName =
    data.unit_name || data.city_name || (data.region_id ? data.region_id.toUpperCase() : 'Bengaluru Urban');

  const coverageLabel =
    data.roads_indexed === false
      ? (data.notice || 'Road geometry indexing pending')
      : data.coverage_state === 'outside_supported_area'
      ? 'Outside supported boundary'
      : data.coverage_state === 'inside_area_no_road_match'
      ? 'Inside boundary · No indexed road in view'
      : `Inside indexed coverage (${boundaryName})`;

  const budgetDisplay =
    data.total_spend_tracked_cr != null
      ? `₹${Number(data.total_spend_tracked_cr).toFixed(2)} Cr`
      : money(data.linked_budget_inr);

  const estimatedBudgetDisplay =
    data.estimated_area_budget_inr != null
      ? money(data.estimated_area_budget_inr)
      : data.total_spend_tracked_cr != null
      ? `₹${Number(data.total_spend_tracked_cr).toFixed(2)} Cr (Deduplicated)`
      : 'Not available';

  const rows: Array<[string, React.ReactNode]> = [
    ['Indexed roads / corridors', roads ? roads.toLocaleString('en-IN') : (data.roads_indexed === false ? 'Pending' : '0')],
    ['Active physical segments', segments ? segments.toLocaleString('en-IN') : (data.roads_indexed === false ? 'Pending' : '0')],
    ['Unique OSM source ways', ways ? ways.toLocaleString('en-IN') : (data.roads_indexed === false ? 'Pending' : '0')],
    ['Motor-road length', motorKm > 0 ? `${motorKm.toFixed(1)} km` : (data.roads_indexed === false ? 'Pending' : '0.0 km')],
    ['Linked projects', projects],
    ['Contractors', contractors],
    ['Open issues', issues],
    ['Roads with open issues', data.affected_roads ?? (issues > 0 ? issues : 0)],
    ['Issues per 100 roads', roads ? ((issues / roads) * 100).toFixed(1) : 'Not available'],
    ['Average repair time', data.average_repair_days == null ? 'Not available' : `${Number(data.average_repair_days).toFixed(1)} days`],
  ];

  const authorities: string[] = Array.isArray(data.authorities) ? data.authorities : [];

  return (
    <div className="p-5 text-sm space-y-6">
      <p className="text-muted">
        {cityId ? `Prepared summary overview for ${boundaryName}.` : 'Pan or zoom the map to explore records in this view.'}
      </p>

      <div className="rounded-xl border border-line bg-canvas/60 p-3 text-xs space-y-1 font-mono">
        <div className="flex justify-between gap-2">
          <span className="text-muted">Coverage boundary:</span>
          <span className="font-semibold text-ink">{boundaryName}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted">View status:</span>
          <span className="text-information">{coverageLabel}</span>
        </div>
        {data.calculated_at && (
          <div className="flex justify-between gap-2">
            <span className="text-muted">Computed at:</span>
            <span>{new Date(data.calculated_at).toLocaleDateString()}</span>
          </div>
        )}
      </div>

      <section>
        <h3 className="font-semibold text-base mb-3">Budgets & spending</h3>
        <dl className="space-y-3">
          <div>
            <dt className="text-muted">Recorded actual spending</dt>
            <dd className="font-semibold">Not available</dd>
          </div>
          <div>
            <dt className="text-muted">Full budgets of linked projects</dt>
            <dd className="font-semibold tabular-nums">{budgetDisplay}</dd>
          </div>
          <div>
            <dt className="text-muted">Estimated budget within scope</dt>
            <dd className="font-semibold text-information tabular-nums">{estimatedBudgetDisplay}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted mt-3">
          {data.priced_projects ?? projects} of {projects} projects have a recorded budget. Anti-double-counting guarantees deduplicate multi-ward corridors.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-base mb-2">Roads & repairs</h3>
        <dl className="divide-y divide-line">
          {rows.map(([label, value]) => (
            <div key={String(label)} className="flex justify-between gap-4 py-2.5">
              <dt className="text-muted">{label}</dt>
              <dd className="font-semibold tabular-nums text-right">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {authorities.length > 0 && (
        <section>
          <h3 className="font-semibold text-base mb-2">Responsible authorities · {authorities.length}</h3>
          <ul className="space-y-2">
            {authorities.map((a: string) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-muted border-t border-line pt-4">
        Coverage reflects indexed roads in the verified boundary extract. Calculated {new Date(data.calculated_at || Date.now()).toLocaleTimeString()}.
      </p>
    </div>
  );
}
