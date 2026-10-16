import type { RoadFeature } from '@/components/GeospatialMap';

const MAX_CACHE_SIZE = 100;
const roadCache = new Map<string, RoadFeature>();
const inFlightRequests = new Map<string, Promise<RoadFeature | null>>();

/**
 * Adapt raw /api/v1/roads/:id response into typed RoadFeature
 */
export function adaptRoadDetailResponse(res: any, requestedRoadId: string): RoadFeature {
  const road = res.road || {};

  const segments: RoadFeature['segments'] = Array.isArray(res.segments)
    ? res.segments.map((seg: any) => {
        let geojson: any = null;
        if (typeof seg.geom_geojson === 'string') {
          try {
            geojson = JSON.parse(seg.geom_geojson);
          } catch {
            geojson = { type: 'LineString', coordinates: [] };
          }
        } else if (seg.geom_geojson && typeof seg.geom_geojson === 'object') {
          geojson = seg.geom_geojson;
        } else {
          geojson = { type: 'LineString', coordinates: [] };
        }

        return {
          segment_id: String(seg.id || seg.segment_id || ''),
          chainage_from: Number(seg.chainage_from ?? 0),
          chainage_to: Number(seg.chainage_to ?? 0),
          length_m: Number(seg.length_m ?? 0),
          geojson,
        };
      })
    : [];

  const works: RoadFeature['works'] = Array.isArray(res.official_works)
    ? res.official_works.map((w: any) => ({
        work_id: String(w.work_id || w.id || ''),
        package_name: w.package_name || 'Sanctioned Road Package',
        authority_name: w.authority_name || 'Public Works Authority',
        tender_id: String(w.tender_id || ''),
        contract_id: String(w.contract_id || ''),
        official_status: w.official_status || 'recorded',
        contract_value_inr: Number(w.contract_value_inr || 0),
        contractor_name: w.contractor_name || 'Unassigned Contractor',
        cin: w.cin,
        gstin: w.gstin,
        start_date: w.start_date,
        target_completion_date: w.target_completion_date,
        actual_completion_date: w.actual_completion_date,
        defect_liability_end_date: w.defect_liability_end_date,
      }))
    : [];

  const incidents: RoadFeature['incidents'] = Array.isArray(res.active_incidents)
    ? res.active_incidents.map((i: any) => ({
        incident_id: String(i.id || i.incident_id || ''),
        category: i.category || 'damaged_surface',
        lifecycle_status: i.lifecycle_status || 'active',
        verification_state: i.verification_state || 'reported',
        last_observed_at: i.last_observed_at || i.first_observed_at || '',
        lat: Number(i.lat),
        lon: Number(i.lon),
      }))
    : [];

  const totalLengthM = String(
    road.total_length_m ||
    (segments || []).reduce((acc: number, s: any) => acc + (s.length_m || 0), 0) ||
    '0'
  );

  return {
    id: String(road.id || requestedRoadId),
    name: road.name || 'Unnamed Road',
    display_name: road.display_name || road.name || 'Unnamed Road',
    has_official_name: Boolean(road.has_official_name),
    ref: road.ref || null,
    road_class: road.road_class || 'unclassified',
    authority_name: road.authority_name || null,
    state: road.state || '',
    district: road.district || '',
    total_length_m: totalLengthM,
    segments,
    works,
    incidents,
    timeline: Array.isArray(res.timeline) ? res.timeline : [],
    coexistence_alert: res.coexistence_alert || { alert: false },
  };
}

/**
 * Abortable, caching loader for full road details.
 */
export async function loadRoadDetail(
  roadId: string,
  signal?: AbortSignal
): Promise<RoadFeature | null> {
  if (!roadId) return null;

  // 1. Check in-memory LRU cache
  if (roadCache.has(roadId)) {
    const cached = roadCache.get(roadId)!;
    // Refresh LRU position
    roadCache.delete(roadId);
    roadCache.set(roadId, cached);
    return cached;
  }

  // 2. Check in-flight requests for deduplication
  if (inFlightRequests.has(roadId)) {
    return inFlightRequests.get(roadId)!;
  }

  // 3. Initiate fetch
  const fetchPromise = (async () => {
    try {
      const response = await fetch(`/api/v1/roads/${encodeURIComponent(roadId)}`, {
        signal,
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`Failed to load road detail (${response.status})`);
      }

      const data = await response.json();
      const adapted = adaptRoadDetailResponse(data, roadId);

      // Cache result with LRU eviction
      if (roadCache.has(roadId)) {
        roadCache.delete(roadId);
      } else if (roadCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = roadCache.keys().next().value;
        if (oldestKey) roadCache.delete(oldestKey);
      }
      roadCache.set(roadId, adapted);

      return adapted;
    } finally {
      inFlightRequests.delete(roadId);
    }
  })();

  inFlightRequests.set(roadId, fetchPromise);
  return fetchPromise;
}

export function clearRoadDetailCache(): void {
  roadCache.clear();
  inFlightRequests.clear();
}

export function getCachedRoadDetail(roadId: string): RoadFeature | undefined {
  return roadCache.get(roadId);
}
