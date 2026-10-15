import pg from 'pg';

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

/**
 * Multi-criteria topological, spatial, and chainage road matcher.
 * Evaluates district, authority, road ref/identifier, source coordinates/geometry, and authoritative chainage.
 * 
 * Rules:
 * 1. Zero magnitude-based unit guessing. Explicit units ('km' or 'm') are required for chainage.
 * 2. OSM segment length (length_m) is NOT official chainage. Only authoritative chainage_from/to can be matched.
 * 3. A road name alone must NOT attach a contract to every segment of a multi-segment road.
 * 4. Multi-segment tenders without chainage/geometry are routed to ambiguous review with candidate IDs.
 * 5. Existing approved / manual_verified associations are preserved.
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
    chainage_start_km,
    chainage_end_km,
    chainage_start,
    chainage_end,
    chainage_unit,
    coordinates,
  } = target;

  // 1. Spatial Coordinate Matching (if explicit work site coordinates provided)
  if (coordinates && Number.isFinite(coordinates.lon) && Number.isFinite(coordinates.lat)) {
    const spatialRes = await client.query(`
      SELECT 
        rs.id as segment_id,
        rs.road_id,
        r.name as road_name,
        r.ref as road_ref,
        r.district,
        r.authority_name,
        ROUND(ST_Distance(rs.geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)::numeric, 1) as distance_m
      FROM road_segments rs
      JOIN roads r ON r.id = rs.road_id
      WHERE rs.is_active = TRUE
        AND ST_DWithin(rs.geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 150)
      ORDER BY distance_m ASC
      LIMIT 10;
    `, [coordinates.lon, coordinates.lat]);

    if (spatialRes.rows.length > 0) {
      // Find candidate matching name/ref/district if available
      let matchedRow = spatialRes.rows[0];
      if (road_name_hint || road_ref) {
        const found = spatialRes.rows.find((row: any) => {
          const nameMatch = road_name_hint && row.road_name && row.road_name.toLowerCase().includes(road_name_hint.toLowerCase());
          const refMatch = road_ref && row.road_ref && row.road_ref.toLowerCase() === road_ref.toLowerCase();
          return nameMatch || refMatch;
        });
        if (found) matchedRow = found;
      }

      return {
        road_id: matchedRow.road_id,
        road_name: matchedRow.road_name,
        matched_segment_ids: [matchedRow.segment_id],
        candidate_segment_ids: spatialRes.rows.map((r: any) => r.segment_id),
        confidence: 'high_exact_ref_chainage',
        score: 95,
        is_ambiguous: false,
        review_status: 'approved',
      };
    }
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
    road_ref || null,
    road_name_hint || null,
    district || null,
  ]);

  const candidates = candidateRoadsRes.rows;

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
  if (scoredCandidates.length > 1 && (best.score - scoredCandidates[1].score < 10) && best.score >= 50) {
    return {
      road_id: best.road.id,
      road_name: best.road.name,
      matched_segment_ids: [],
      candidate_segment_ids: scoredCandidates.map((c) => c.road.id),
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

  // 5. Chainage Normalization (Strictly without magnitude guessing)
  let cStart: number | null = null;
  let cEnd: number | null = null;

  if (chainage_start_km !== undefined && chainage_start_km !== null) {
    cStart = Number(chainage_start_km);
  } else if (chainage_start !== undefined && chainage_start !== null) {
    if (chainage_unit === 'km') {
      cStart = Number(chainage_start);
    } else if (chainage_unit === 'm') {
      cStart = Number(chainage_start) / 1000;
    } else {
      // Explicit unit missing; refuse magnitude guessing
      cStart = null;
    }
  }

  if (chainage_end_km !== undefined && chainage_end_km !== null) {
    cEnd = Number(chainage_end_km);
  } else if (chainage_end !== undefined && chainage_end !== null) {
    if (chainage_unit === 'km') {
      cEnd = Number(chainage_end);
    } else if (chainage_unit === 'm') {
      cEnd = Number(chainage_end) / 1000;
    } else {
      // Explicit unit missing; refuse magnitude guessing
      cEnd = null;
    }
  }

  // 6. Chainage Matching vs Multi-Segment Safeguards
  let matchedSegmentIds: string[] = [];

  if (cStart !== null && cEnd !== null) {
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
        if (sFrom <= cEnd && sTo >= cStart) {
          matchedSegmentIds.push(seg.id);
        }
      }
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

    // Single-segment corridor with high scoring match can be linked directly
    if (allSegments.length === 1 && best.score >= 50) {
      matchedSegmentIds = [allSegments[0].id];
    } else {
      return {
        road_id: roadId,
        road_name: best.road.name,
        matched_segment_ids: [],
        candidate_segment_ids: allSegmentIds,
        confidence: 'low_ambiguous',
        score: best.score,
        is_ambiguous: true,
        ambiguity_reason: `Low match score (${best.score}) for road "${best.road.name}" without chainage`,
        review_status: 'needs_review',
      };
    }
  }

  // Determine final confidence tier
  let confidence: MatchingConfidence = 'medium_corridor_chainage';
  if (best.score >= 70 && matchedSegmentIds.length > 0) {
    confidence = 'high_exact_ref_chainage';
  } else if (best.score >= 45 && matchedSegmentIds.length > 0) {
    confidence = 'medium_corridor_chainage';
  } else if (best.score < 50) {
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
 * Preserves existing approved and manual_verified associations.
 */
export async function linkWorkSegmentsWithPrecision(
  client: pg.PoolClient,
  workId: string,
  target: RoadMatchTarget,
  sourceRecordId?: string
): Promise<MatchResult> {
  const result = await matchRoadPrecisely(client, target);

  if (result.is_ambiguous || result.review_status === 'needs_review' || result.matched_segment_ids.length === 0) {
    // Route to ambiguous_matches_queue for volunteer / human-in-the-loop audit
    const candidateIds = result.candidate_segment_ids || result.matched_segment_ids;
    await client.query(`
      INSERT INTO ambiguous_matches_queue (
        source_record_id, work_id, tender_id, district, authority_name,
        road_name_hint, chainage_start_km, chainage_end_km,
        candidate_segment_ids, reason, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, 'pending')
      ON CONFLICT DO NOTHING;
    `, [
      sourceRecordId || null,
      workId,
      target.tender_id,
      target.district || null,
      target.authority_name || null,
      target.road_name_hint || null,
      target.chainage_start_km ?? (target.chainage_unit === 'km' ? target.chainage_start : null),
      target.chainage_end_km ?? (target.chainage_unit === 'km' ? target.chainage_end : null),
      JSON.stringify(candidateIds),
      result.ambiguity_reason || 'Low matching confidence',
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
        SET matching_confidence = EXCLUDED.matching_confidence,
            review_status = EXCLUDED.review_status,
            review_notes = EXCLUDED.review_notes
        WHERE work_segments.matching_confidence != 'manual_verified'
          AND work_segments.review_status != 'approved';
    `, [
      workId,
      segId,
      target.chainage_start_km ?? (target.chainage_unit === 'km' ? target.chainage_start : null),
      target.chainage_end_km ?? (target.chainage_unit === 'km' ? target.chainage_end : null),
      result.confidence,
      result.review_status,
      `Matched road ${result.road_name} with score ${result.score}`,
    ]);
  }

  return result;
}
