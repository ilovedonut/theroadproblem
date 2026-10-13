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
}

export type MatchingConfidence = 'high_exact_ref_chainage' | 'medium_corridor_chainage' | 'low_ambiguous' | 'manual_verified';

export interface MatchResult {
  road_id: string | null;
  road_name: string | null;
  matched_segment_ids: string[];
  confidence: MatchingConfidence;
  score: number;
  is_ambiguous: boolean;
  ambiguity_reason?: string;
  review_status: 'approved' | 'needs_review';
}

/**
 * Multi-criteria topological & spatial road matcher.
 * Evaluates district, authority, road ref/identifier, geometry, and chainage together.
 * Replaces naive text-fragment matching to prevent budget/contract misattribution.
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
  } = target;

  // 1. Candidate Road Query using multi-criteria filters
  const candidateRoadsRes = await client.query(`
    SELECT 
      r.id, 
      r.name, 
      r.ref, 
      r.road_class, 
      r.authority_name, 
      r.district,
      COALESCE(SUM(rs.length_m), 0) as total_length_m
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
      confidence: 'low_ambiguous',
      score: 0,
      is_ambiguous: true,
      ambiguity_reason: `No candidate roads discovered matching ref="${road_ref}", name="${road_name_hint}", district="${district}"`,
      review_status: 'needs_review',
    };
  }

  // 2. Score candidates against all criteria
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
      confidence: 'low_ambiguous',
      score: best.score,
      is_ambiguous: true,
      ambiguity_reason: `Ambiguous match: Competing roads "${best.road.name}" (score ${best.score}) and "${scoredCandidates[1].road.name}" (score ${scoredCandidates[1].score})`,
      review_status: 'needs_review',
    };
  }

  // 3. Segment & Chainage Interval Filtering
  const roadId = best.road.id;
  const segRes = await client.query(`
    SELECT id, chainage_from, chainage_to, length_m
    FROM road_segments
    WHERE road_id = $1 AND is_active = TRUE
    ORDER BY chainage_from ASC;
  `, [roadId]);

  const allSegments = segRes.rows;
  let matchedSegmentIds: string[] = [];

  const cStartRaw = chainage_start_km !== undefined && chainage_start_km !== null ? Number(chainage_start_km) : null;
  const cEndRaw = chainage_end_km !== undefined && chainage_end_km !== null ? Number(chainage_end_km) : null;

  // Normalize contract chainage to km
  const cStart = cStartRaw !== null ? (cStartRaw > 50 ? cStartRaw / 1000 : cStartRaw) : null;
  const cEnd = cEndRaw !== null ? (cEndRaw > 50 ? cEndRaw / 1000 : cEndRaw) : null;

  if (cStart !== null && cEnd !== null) {
    for (const seg of allSegments) {
      const sFromRaw = parseFloat(seg.chainage_from || '0');
      const sToRaw = parseFloat(seg.chainage_to || '0');

      // Normalize segment chainage to km if stored in meters
      const sFrom = sFromRaw > 50 ? sFromRaw / 1000 : sFromRaw;
      const sTo = sToRaw > 50 ? sToRaw / 1000 : sToRaw;

      // Overlap condition: segment interval [sFrom, sTo] overlaps contract interval [cStart, cEnd]
      if (sFrom <= cEnd && sTo >= cStart) {
        matchedSegmentIds.push(seg.id);
      }
    }
  } else {
    // If no chainage specified, take all segments of this specific road
    matchedSegmentIds = allSegments.map((s: any) => s.id);
  }

  // Chainage boundary validation: if contract chainage was specified but matched zero segments
  if (cStart !== null && cEnd !== null && matchedSegmentIds.length === 0 && allSegments.length > 0) {
    return {
      road_id: roadId,
      road_name: best.road.name,
      matched_segment_ids: [],
      confidence: 'low_ambiguous',
      score: best.score,
      is_ambiguous: true,
      ambiguity_reason: `Chainage out of bounds: contract specifies ${cStart}-${cEnd}km, but road segments span 0-${(best.road.total_length_m / 1000).toFixed(1)}km`,
      review_status: 'needs_review',
    };
  }

  // Determine final confidence tier
  let confidence: MatchingConfidence = 'medium_corridor_chainage';
  if (best.score >= 70 && matchedSegmentIds.length > 0) {
    confidence = 'high_exact_ref_chainage';
  } else if (best.score < 50) {
    confidence = 'low_ambiguous';
  }

  return {
    road_id: roadId,
    road_name: best.road.name,
    matched_segment_ids: matchedSegmentIds,
    confidence,
    score: best.score,
    is_ambiguous: confidence === 'low_ambiguous',
    review_status: confidence === 'low_ambiguous' ? 'needs_review' : 'approved',
  };
}

/**
 * Persists matched segments or routes to ambiguous review queue.
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
      target.chainage_start_km || null,
      target.chainage_end_km || null,
      JSON.stringify(result.matched_segment_ids),
      result.ambiguity_reason || 'Low matching confidence',
    ]);

    return result;
  }

  // High/Medium precision: link ONLY the validated overlapping segments
  for (const segId of result.matched_segment_ids) {
    await client.query(`
      INSERT INTO work_segments (
        work_id, road_segment_id, chainage_start_km, chainage_end_km,
        matching_confidence, review_status, review_notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (work_id, road_segment_id) DO UPDATE 
        SET matching_confidence = EXCLUDED.matching_confidence,
            review_status = EXCLUDED.review_status;
    `, [
      workId,
      segId,
      target.chainage_start_km || null,
      target.chainage_end_km || null,
      result.confidence,
      result.review_status,
      `Matched road ${result.road_name} with score ${result.score}`,
    ]);
  }

  return result;
}
