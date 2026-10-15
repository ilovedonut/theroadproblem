import pg from 'pg';
import { createHash } from 'node:crypto';

export interface RoadMatchTarget {
  tender_id: string;
  package_name: string;
  district?: string | null;
  authority_name?: string | null;
  road_name_hint?: string | null;
  road_ref?: string | null;
  chainage_start_km?: number | null;
  chainage_end_km?: number | null;
  chainage_start?: number | null;
  chainage_end?: number | null;
  chainage_unit?: 'km' | 'm' | null;
  coordinates?: { lon: number; lat: number } | null;
  geometry_geojson?: any | null;
}

export type MatchingConfidence = 'high_exact_ref_chainage' | 'medium_corridor_chainage' | 'low_ambiguous' | 'manual_verified';

export interface MatchResult {
  road_id: string | null;
  road_name: string | null;
  matched_segment_ids: string[];
  candidate_segment_ids?: string[];
  confidence: MatchingConfidence;
  score: number;
  is_ambiguous: boolean;
  ambiguity_reason?: string;
  review_status: 'approved' | 'needs_review';
}


function normalizeIdentity(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : '';
}
function escapeLike(value: string) { return value.replace(/[\\%_]/g, '\\$&'); }
export function normalizeChainage(target: RoadMatchTarget): {start: number | null; end: number | null; error?: string} {
  const number = (value: unknown) => typeof value === 'number' ? value : NaN;
  const convert = (km: number | null | undefined, raw: number | null | undefined) =>
    km != null ? number(km) : raw == null ? null : target.chainage_unit === 'm' ? number(raw)/1000 : target.chainage_unit === 'km' ? number(raw) : null;
  const start=convert(target.chainage_start_km,target.chainage_start);
  const end=convert(target.chainage_end_km,target.chainage_end);
  const hasInput=[target.chainage_start_km,target.chainage_end_km,target.chainage_start,target.chainage_end].some(v=>v!=null);
  const contradictory = [[target.chainage_start_km,target.chainage_start],[target.chainage_end_km,target.chainage_end]]
    .some(([km,raw])=>km!=null && raw!=null && (target.chainage_unit==null || !Number.isFinite(convert(null,raw)) || Math.abs(number(km)-(convert(null,raw) ?? NaN))>0.000001));
  if (contradictory) return {start:null,end:null,error:'Conflicting chainage representations require review'};
  if (hasInput && (start===null || end===null || !Number.isFinite(start) || !Number.isFinite(end) || start<0 || end<=start)) {
    return {start:null,end:null,error:'Chainage requires finite increasing endpoints and explicit units'};
  }
  return {start,end};
}
function validProjectGeometry(geometry: any): boolean {
  const lines=geometry?.type==='LineString' ? [geometry.coordinates] : geometry?.type==='MultiLineString' ? geometry.coordinates : null;
  return Array.isArray(lines) && lines.length>0 && lines.every(line=>Array.isArray(line) && line.length>=2 && line.every(p=>Array.isArray(p) && p.length>=2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0])<=180 && Math.abs(p[1])<=90));
}

/**
 * Multi-criteria topological, spatial, and chainage road matcher.
 * Evaluates district, authority, road ref/identifier, source coordinates/geometry, and authoritative chainage.
 * 
 * Rules:
 * 1. Zero magnitude-based unit guessing. Explicit units ('km' or 'm') are required for chainage.
 * 2. OSM segment length (length_m) is NOT official chainage. Only authoritative chainage_from/to can be matched.
 * 3. A road name alone must NOT attach a contract to every segment of a multi-segment road.
 * 4. Multi-segment tenders without chainage/geometry are routed to ambiguous review with candidate IDs.
 * 5. Manual verification is preserved; obsolete machine-created links retain review history.
 */
export async function matchRoadPrecisely(
  client: pg.PoolClient,
  target: RoadMatchTarget
): Promise<MatchResult> {
  const {
    district,
    authority_name,
    road_name_hint,
    road_ref,
    coordinates,
  } = target;

  const normalized = normalizeChainage(target);
  const review = (reason: string, rows: any[] = []): MatchResult => ({
    road_id: rows[0]?.road_id || null, road_name: rows[0]?.road_name || null,
    matched_segment_ids: [], candidate_segment_ids: rows.map(row => row.segment_id),
    confidence: 'low_ambiguous', score: 0, is_ambiguous: true,
    ambiguity_reason: reason, review_status: 'needs_review',
  });
  if (normalized.error) return review(normalized.error);
  let spatialRoadIds: string[] | null = null;
  if (coordinates || target.geometry_geojson) {
    if (coordinates && (!Number.isFinite(coordinates.lon) || !Number.isFinite(coordinates.lat)
      || Math.abs(coordinates.lon) > 180 || Math.abs(coordinates.lat) > 90)) {
      return review('Invalid WGS84 coordinates');
    }
    const geometry = target.geometry_geojson;
    if (geometry && !validProjectGeometry(geometry)) return review('Invalid project line geometry');
    const spatialRes = await client.query(`
      SELECT rs.id AS segment_id, rs.road_id, r.name AS road_name, r.ref AS road_ref,
             r.district, r.authority_name, rs.layer, rs.bridge, rs.tunnel, rs.service,
             ST_Distance(rs.geom::geography, location.geom::geography) AS distance_m
      FROM road_segments rs JOIN roads r ON r.id=rs.road_id
      CROSS JOIN (SELECT CASE WHEN $3::text IS NOT NULL
        THEN ST_SetSRID(ST_GeomFromGeoJSON($3),4326)
        ELSE ST_SetSRID(ST_MakePoint($1,$2),4326) END AS geom) location
      WHERE rs.is_active=TRUE
        AND COALESCE(rs.usage_category,'public_motor') IN ('public_motor','restricted_motor')
        AND ST_DWithin(rs.geom::geography, location.geom::geography, 150)
        AND ($3::text IS NULL OR $1::float8 IS NULL OR ST_DWithin(rs.geom::geography,
          ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,150))
      ORDER BY distance_m,rs.id LIMIT 101
    `, [coordinates?.lon ?? null, coordinates?.lat ?? null, geometry ? JSON.stringify(geometry) : null]);
    const rows = spatialRes.rows;
    if (!rows.length) return review('No active indexed motor-road segments near the supplied location');
    if (rows.length > 100) return review('Candidate search truncated; location requires review', rows);
    const compatible = rows.filter((row: any) =>
      (!district || normalizeIdentity(row.district) === normalizeIdentity(district)) &&
      (!road_ref || normalizeIdentity(row.road_ref) === normalizeIdentity(road_ref)) &&
      (!road_name_hint || normalizeIdentity(row.road_name) === normalizeIdentity(road_name_hint)) &&
      (!authority_name || !row.authority_name || normalizeIdentity(row.authority_name) === normalizeIdentity(authority_name))
    );
    if (!compatible.length) return review('Location conflicts with supplied road identity or jurisdiction', rows);
    if (!district || (!road_ref && !road_name_hint)) return review('Location lacks identifying road and district evidence', rows);
    // A project point cannot establish the extent of a contract. Geometry is
    // used for candidate discovery, but requires review until route/extent is verified.
    if (geometry || normalized.start === null || normalized.end === null) {
      return review('Location candidates found; affected project extent requires review', compatible);
    }
    const identities = new Set(compatible.map((row: any) => `${row.road_id}:${row.layer ?? 0}:${row.bridge ?? ''}:${row.tunnel ?? ''}:${row.service ?? ''}`));
    if (identities.size !== 1) return review('Competing road, grade or carriageway candidates', compatible);
    spatialRoadIds = [...new Set(compatible.map((row: any) => row.road_id))] as string[];
  }

  // 2. Candidate Road Query using multi-criteria filters
  const candidateRoadsRes = await client.query(`
    SELECT 
      r.id, 
      r.name, 
      r.ref, 
      r.road_class, 
      r.authority_name, 
      r.district,
      r.is_official_corridor,
      COALESCE(SUM(rs.length_m), 0) as total_length_m,
      COUNT(rs.id) as segment_count
    FROM roads r
    LEFT JOIN road_segments rs ON r.id = rs.road_id AND rs.is_active = TRUE
    WHERE 
      ($1::text IS NOT NULL AND r.ref ILIKE $1)
      OR ($2::text IS NOT NULL AND r.name ILIKE ('%' || $2 || '%'))
      OR ($3::text IS NOT NULL AND $2::text IS NOT NULL AND r.district ILIKE $3 AND r.name ILIKE ('%' || $2 || '%'))
    GROUP BY r.id
    ORDER BY r.name ASC;
  `, [
    road_ref ? escapeLike(road_ref) : null,
    road_name_hint ? escapeLike(road_name_hint) : null,
    district || null,
  ]);

  const candidates = candidateRoadsRes.rows.filter((row: any) =>
    (!spatialRoadIds || spatialRoadIds.includes(row.id)) &&
    (!district || normalizeIdentity(row.district) === normalizeIdentity(district)) &&
    (!road_ref || normalizeIdentity(row.ref) === normalizeIdentity(road_ref)) &&
    (!road_name_hint || normalizeIdentity(row.name) === normalizeIdentity(road_name_hint)) &&
    (!authority_name || !row.authority_name || normalizeIdentity(row.authority_name) === normalizeIdentity(authority_name))
  );

  if (candidates.length === 0) {
    return {
      road_id: null,
      road_name: null,
      matched_segment_ids: [],
      candidate_segment_ids: [],
      confidence: 'low_ambiguous',
      score: 0,
      is_ambiguous: true,
      ambiguity_reason: `No candidate roads discovered matching ref="${road_ref}", name="${road_name_hint}", district="${district}"`,
      review_status: 'needs_review',
    };
  }

  // 3. Score candidates against criteria
  const scoredCandidates: { road: any; score: number; reasons: string[] }[] = [];

  for (const cand of candidates) {
    let score = 0;
    const reasons: string[] = [];

    // Criteria A: Exact Road Ref Match (weight: 40)
    if (road_ref && cand.ref && cand.ref.toLowerCase() === road_ref.toLowerCase()) {
      score += 40;
      reasons.push('exact_ref_match');
    } else if (road_ref && cand.ref && cand.ref.toLowerCase().includes(road_ref.toLowerCase())) {
      score += 25;
      reasons.push('partial_ref_match');
    }

    // Criteria B: Name Similarity (weight: 30)
    if (road_name_hint && cand.name.toLowerCase() === road_name_hint.toLowerCase()) {
      score += 30;
      reasons.push('exact_name_match');
    } else if (road_name_hint && cand.name.toLowerCase().includes(road_name_hint.toLowerCase())) {
      score += 20;
      reasons.push('contains_name_match');
    }

    // Criteria C: District Concordance (weight: 15)
    if (district && cand.district && cand.district.toLowerCase() === district.toLowerCase()) {
      score += 15;
      reasons.push('district_match');
    } else if (district && cand.district && cand.district.toLowerCase() !== district.toLowerCase()) {
      score -= 25; // Significant penalty for mismatched district
      reasons.push('district_mismatch_penalty');
    }

    // Criteria D: Authority Concordance (weight: 15)
    if (authority_name && cand.authority_name) {
      const a1 = authority_name.toLowerCase();
      const a2 = cand.authority_name.toLowerCase();
      if (a1.includes(a2) || a2.includes(a1)) {
        score += 15;
        reasons.push('authority_concordance');
      }
    }

    scoredCandidates.push({ road: cand, score, reasons });
  }

  // Sort by score descending
  scoredCandidates.sort((a, b) => b.score - a.score);
  const best = scoredCandidates[0];

  // Ambiguity Check: If multiple competing candidates have closely tied high scores
  if (scoredCandidates.length > 1 && (best.score - scoredCandidates[1].score < 10)) {
    const segmentCandidates = await client.query('SELECT id FROM road_segments WHERE is_active=TRUE AND road_id=ANY($1::uuid[]) ORDER BY id', [scoredCandidates.map(c => c.road.id)]);
    return {
      road_id: best.road.id,
      road_name: best.road.name,
      matched_segment_ids: [],
      candidate_segment_ids: segmentCandidates.rows.map((s: any) => s.id),
      confidence: 'low_ambiguous',
      score: best.score,
      is_ambiguous: true,
      ambiguity_reason: `Ambiguous match: Competing roads "${best.road.name}" (score ${best.score}) and "${scoredCandidates[1].road.name}" (score ${scoredCandidates[1].score})`,
      review_status: 'needs_review',
    };
  }

  // 4. Retrieve Active Segments for the Best Candidate Road
  const roadId = best.road.id;
  const segRes = await client.query(`
    SELECT id, chainage_from, chainage_to, length_m
    FROM road_segments
    WHERE road_id = $1 AND is_active = TRUE
    ORDER BY chainage_from ASC NULLS LAST;
  `, [roadId]);

  const allSegments = segRes.rows;
  const allSegmentIds = allSegments.map((s: any) => s.id);

  if (allSegments.length === 0) {
    return {
      road_id: roadId,
      road_name: best.road.name,
      matched_segment_ids: [],
      candidate_segment_ids: [],
      confidence: 'low_ambiguous',
      score: best.score,
      is_ambiguous: true,
      ambiguity_reason: `Road "${best.road.name}" exists in index but has 0 active segments`,
      review_status: 'needs_review',
    };
  }

  const cStart = normalized.start;
  const cEnd = normalized.end;
  if (!district || !best.road.is_official_corridor) {
    return review('Official corridor identity and district must be verified before applying chainage',
      allSegments.map((s: any) => ({ segment_id: s.id, road_id: roadId, road_name: best.road.name })));
  }

  // 6. Chainage Matching vs Multi-Segment Safeguards
  let matchedSegmentIds: string[] = [];

  if (cStart !== null && cEnd !== null) {
    const covered: Array<[number,number]> = [];
    // Contract has valid, authoritative chainage interval.
    // NOTE: OSM segment length (length_m) is NOT official chainage.
    // Only segments with authoritative chainage_from and chainage_to are evaluated!
    for (const seg of allSegments) {
      if (seg.chainage_from === null || seg.chainage_to === null) {
        continue; // Skip segments lacking authoritative chainage
      }
      const sFrom = parseFloat(seg.chainage_from);
      const sTo = parseFloat(seg.chainage_to);

      if (Number.isFinite(sFrom) && Number.isFinite(sTo)) {
        if (sFrom < cEnd && sTo > cStart) {
          matchedSegmentIds.push(seg.id);
          covered.push([Math.max(sFrom,cStart),Math.min(sTo,cEnd)]);
        }
      }
    }
    let coveredTo=cStart;
    for(const [from,to] of covered.sort((a,b)=>a[0]-b[0])) {
      if(from>coveredTo+0.000001)break;
      coveredTo=Math.max(coveredTo,to);
    }
    if(matchedSegmentIds.length && coveredTo<cEnd-0.000001) {
      return review('Indexed official chainage does not cover the complete project interval',
        allSegments.map((s: any)=>({segment_id:s.id,road_id:roadId,road_name:best.road.name})));
    }

    if (matchedSegmentIds.length === 0) {
      return {
        road_id: roadId,
        road_name: best.road.name,
        matched_segment_ids: [],
        candidate_segment_ids: allSegmentIds,
        confidence: 'low_ambiguous',
        score: best.score,
        is_ambiguous: true,
        ambiguity_reason: `Chainage out of bounds or missing official chainage: contract specifies ${cStart}-${cEnd}km, but candidate segments lack overlapping authoritative chainage`,
        review_status: 'needs_review',
      };
    }
  } else {
    // No authoritative chainage provided.
    // SAFEGUARD: A road name alone must NOT attach a contract to every segment of a multi-segment road!
    if (allSegments.length > 1) {
      return {
        road_id: roadId,
        road_name: best.road.name,
        matched_segment_ids: [],
        candidate_segment_ids: allSegmentIds,
        confidence: 'low_ambiguous',
        score: best.score,
        is_ambiguous: true,
        ambiguity_reason: `Road "${best.road.name}" has ${allSegments.length} segments. Road name alone without authoritative chainage or spatial bounds cannot be safely linked; routed for review to prevent misattribution.`,
        review_status: 'needs_review',
      };
    }

    return review('Project extent is missing; a single indexed segment does not establish contract scope',
      allSegments.map((s: any) => ({ segment_id: s.id, road_id: roadId, road_name: best.road.name })));
  }

  // Determine final confidence tier
  let confidence: MatchingConfidence = 'medium_corridor_chainage';
  if (best.reasons.includes('exact_ref_match') && best.score >= 70 && matchedSegmentIds.length > 0) {
    confidence = 'high_exact_ref_chainage';
  } else if (best.score >= 45 && matchedSegmentIds.length > 0) {
    confidence = 'medium_corridor_chainage';
  } else {
    confidence = 'low_ambiguous';
  }

  return {
    road_id: roadId,
    road_name: best.road.name,
    matched_segment_ids: matchedSegmentIds,
    candidate_segment_ids: allSegmentIds,
    confidence,
    score: best.score,
    is_ambiguous: confidence === 'low_ambiguous',
    review_status: confidence === 'low_ambiguous' ? 'needs_review' : 'approved',
  };
}

/**
 * Persists matched segments or routes to ambiguous review queue.
 * Preserves manual decisions and audits superseded machine-created associations.
 */
export async function linkWorkSegmentsWithPrecision(
  client: pg.PoolClient,
  workId: string,
  target: RoadMatchTarget,
  sourceRecordId?: string
): Promise<MatchResult> {
  const result = await matchRoadPrecisely(client, target);
  const normalized = normalizeChainage(target);
  // Only revise links explicitly identified as machine-created. Preserve
  // manual verification and retain the former association as review history.
  await client.query(`WITH revised AS (
    UPDATE work_segments SET review_status='needs_review',
      review_notes=review_notes || E'\\nSuperseded automatic attribution; current source requires reassessment.'
    WHERE work_id=$1 AND matching_confidence<>'manual_verified' AND review_status='approved'
      AND review_notes LIKE 'Matched road %' AND NOT (road_segment_id=ANY($2::uuid[]))
    RETURNING road_segment_id
  ) INSERT INTO events(entity_type,entity_id,event_type,old_state,new_state,source_record_id,reason)
    SELECT 'work',$1,'automatic_road_attribution_superseded',
      jsonb_build_object('road_segment_id',road_segment_id,'review_status','approved'),
      jsonb_build_object('review_status','needs_review'),$3,
      'Current source evidence no longer supports the previous automatic road association.' FROM revised`,
    [workId,result.review_status==='approved' ? result.matched_segment_ids : [],sourceRecordId || null]);
  const digest = createHash('sha256').update(JSON.stringify([workId, sourceRecordId || null, target.tender_id])).digest('hex');
  const reviewId = `${digest.slice(0,8)}-${digest.slice(8,12)}-5${digest.slice(13,16)}-a${digest.slice(17,20)}-${digest.slice(20,32)}`;

  if (result.is_ambiguous || result.review_status === 'needs_review' || result.matched_segment_ids.length === 0) {
    // Route to ambiguous_matches_queue for volunteer / human-in-the-loop audit
    const candidateIds = result.candidate_segment_ids || result.matched_segment_ids;
    await client.query(`
      INSERT INTO ambiguous_matches_queue (
        id, source_record_id, work_id, tender_id, district, authority_name,
        road_name_hint, chainage_start_km, chainage_end_km,
        candidate_segment_ids, reason, status
      ) VALUES ($11, $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, 'pending')
      ON CONFLICT (id) DO UPDATE SET candidate_segment_ids=EXCLUDED.candidate_segment_ids,
        reason=EXCLUDED.reason,chainage_start_km=EXCLUDED.chainage_start_km,chainage_end_km=EXCLUDED.chainage_end_km
      WHERE ambiguous_matches_queue.status='pending';
    `, [
      sourceRecordId || null,
      workId,
      target.tender_id,
      target.district || null,
      target.authority_name || null,
      target.road_name_hint || null,
      normalized.start,
      normalized.end,
      JSON.stringify(candidateIds),
      result.ambiguity_reason || 'Low matching confidence',
      reviewId,
    ]);

    return result;
  }

  // Preserve manual and previously approved associations
  for (const segId of result.matched_segment_ids) {
    await client.query(`
      INSERT INTO work_segments (
        work_id, road_segment_id, chainage_start_km, chainage_end_km,
        matching_confidence, review_status, review_notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (work_id, road_segment_id) DO UPDATE 
        SET chainage_start_km = EXCLUDED.chainage_start_km,
            chainage_end_km = EXCLUDED.chainage_end_km,
            matching_confidence = EXCLUDED.matching_confidence,
            review_status = EXCLUDED.review_status,
            review_notes = EXCLUDED.review_notes
        WHERE work_segments.matching_confidence != 'manual_verified'
          AND (work_segments.review_status != 'approved' OR work_segments.review_notes LIKE 'Matched road %');
    `, [
      workId,
      segId,
      normalized.start,
      normalized.end,
      result.confidence,
      result.review_status,
      `Matched road ${result.road_name} with score ${result.score}`,
    ]);
  }

  return result;
}
