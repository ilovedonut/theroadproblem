/**
 * Explicit OpenStreetMap Highway & Access Inclusion Rules
 *
 * Distinguishes:
 * 1. 'public_motor'          — Publicly accessible motor roads (or motor roads with unknown access)
 * 2. 'restricted_motor'      — Private, military, or restricted-access motor roads
 * 3. 'construction_proposed' — Roads under construction or proposed (not active motor carriageways)
 * 4. 'non_motor'             — Footways, cycleways, pedestrian areas, steps, paths, and tracks
 * 5. 'excluded'              — Non-road features or unsupported tags
 *
 * Key invariant:
 * - Missing access information in OSM (`access` tag absent) is recorded as `'unknown'`
 *   (`access_status = 'unknown'`), NEVER as confirmed public access (`'yes'`).
 * - Unnamed roads are never discarded; they receive an explicit display fallback
 *   (e.g., "Unnamed residential road") with `has_official_name = false`.
 */

export type RoadUsageCategory =
  | 'public_motor'
  | 'restricted_motor'
  | 'construction_proposed'
  | 'non_motor'
  | 'excluded';

export type AccessStatus = 'public' | 'restricted' | 'private' | 'unknown';

export const MOTOR_HIGHWAY_CLASSES = new Set<string>([
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'unclassified',
  'residential',
  'service',
  'living_street',
  'motorway_link',
  'trunk_link',
  'primary_link',
  'secondary_link',
  'tertiary_link',
  'road',
]);

export const NON_MOTOR_HIGHWAY_CLASSES = new Set<string>([
  'footway',
  'cycleway',
  'pedestrian',
  'steps',
  'track',
  'path',
  'bridleway',
  'corridor',
]);

export const CONSTRUCTION_PROPOSED_CLASSES = new Set<string>([
  'construction',
  'proposed',
]);

const PUBLIC_ACCESS_VALUES = new Set<string>([
  'yes',
  'public',
  'permissive',
  'designated',
  'official',
]);

const PRIVATE_ACCESS_VALUES = new Set<string>([
  'private',
]);

const RESTRICTED_ACCESS_VALUES = new Set<string>([
  'no',
  'military',
  'restricted',
  'customers',
  'delivery',
  'destination',
  'permit',
  'agricultural',
  'forestry',
  'emergency',
  'staff',
  'residents',
]);

export interface OsmRoadClassification {
  included: boolean;
  isMotorRoad: boolean;
  usageCategory: RoadUsageCategory;
  roadClass: string;
  accessRaw: string;
  accessStatus: AccessStatus;
  serviceSubtype: string | null;
  isServiceRoad: boolean;
  hasOfficialName: boolean;
  officialName: string | null;
  displayFallback: string;
  displayName: string;
  officialRef: string | null;
  aliases: string[];
  bridge: string | null;
  tunnel: string | null;
  layer: number;
  oneway: string | null;
  lanes: number | null;
  surface: string | null;
  maxspeed: string | null;
  operator: string | null;
  rejectionReason?: string;
}

/**
 * Resolves access tag and status strictly without assuming missing access = 'yes'.
 */
export function classifyAccess(tags: Record<string, string> = {}): {
  accessRaw: string;
  accessStatus: AccessStatus;
} {
  const raw = (tags.motor_vehicle || tags.vehicle || tags.access || '').trim().toLowerCase();
  if (!raw) {
    return { accessRaw: 'unknown', accessStatus: 'unknown' };
  }
  if (PRIVATE_ACCESS_VALUES.has(raw)) {
    return { accessRaw: raw, accessStatus: 'private' };
  }
  if (RESTRICTED_ACCESS_VALUES.has(raw)) {
    return { accessRaw: raw, accessStatus: 'restricted' };
  }
  if (PUBLIC_ACCESS_VALUES.has(raw)) {
    return { accessRaw: raw, accessStatus: 'public' };
  }
  return { accessRaw: raw, accessStatus: 'unknown' };
}

/**
 * Extracts aliases and alternate names from OSM tags.
 */
export function extractRoadAliases(tags: Record<string, string> = {}, primaryName?: string | null): string[] {
  const aliasKeys = [
    'alt_name',
    'old_name',
    'official_name',
    'loc_name',
    'short_name',
    'nat_name',
    'reg_name',
    'name:en',
    'name:kn',
  ];
  const seen = new Set<string>();
  const primaryLower = (primaryName || '').trim().toLowerCase();

  for (const key of aliasKeys) {
    const val = tags[key];
    if (!val) continue;
    for (const part of val.split(';')) {
      const cleaned = part.trim();
      if (cleaned && cleaned.toLowerCase() !== primaryLower) {
        seen.add(cleaned);
      }
    }
  }
  return Array.from(seen);
}

/**
 * Generates an explicit display fallback label for unnamed roads.
 * Keeps compatibility with existing tests while supporting explicit "Unnamed residential road" style.
 */
export function generateInformativeLabel(
  tags: Record<string, string> = {},
  options: { residentialNoun?: 'street' | 'road' } = {}
): string {
  if (tags.name && tags.name.trim()) {
    return tags.name.trim();
  }
  const hw = (tags.highway || 'road').trim().toLowerCase();
  const isService = hw === 'service' || Boolean(tags.service);
  const serviceType = tags.service ? ` (${tags.service.replace(/_/g, ' ')})` : '';
  const bridge = tags.bridge && tags.bridge !== 'no' ? ' [Elevated]' : '';
  const tunnel = tags.tunnel && tags.tunnel !== 'no' ? ' [Underpass]' : '';

  if (isService) {
    return `Unnamed service road${serviceType}${bridge}${tunnel}`;
  }
  if (hw === 'residential') {
    const noun = options.residentialNoun || 'street';
    return `Unnamed residential ${noun}${bridge}${tunnel}`;
  }
  if (hw.includes('link')) {
    return `Unnamed ${hw.replace('_link', '')} connector${bridge}${tunnel}`;
  }
  return `Unnamed ${hw.replace(/_/g, ' ')} road${bridge}${tunnel}`;
}

/**
 * Evaluates an OSM way's tags against the explicit Bengaluru road-index inclusion rules.
 */
export function classifyOsmWayTags(
  tags: Record<string, string> = {},
  options: { includeNonMotor?: boolean; includeConstructionProposed?: boolean } = {}
): OsmRoadClassification {
  const hw = (tags.highway || '').trim().toLowerCase();
  const { accessRaw, accessStatus } = classifyAccess(tags);
  const serviceSubtype = tags.service ? tags.service.trim() : null;
  const isServiceRoad = hw === 'service' || Boolean(serviceSubtype);
  const officialName = tags.name && tags.name.trim() ? tags.name.trim() : null;
  const hasOfficialName = Boolean(officialName);
  const displayFallback = generateInformativeLabel(
    { ...tags, name: '' },
    { residentialNoun: 'road' }
  );
  const displayName = officialName || generateInformativeLabel(tags);
  const officialRef = tags.ref && tags.ref.trim() ? tags.ref.trim() : null;
  const aliases = extractRoadAliases(tags, officialName);
  const bridge = tags.bridge && tags.bridge !== 'no' ? tags.bridge : null;
  const tunnel = tags.tunnel && tags.tunnel !== 'no' ? tags.tunnel : null;
  const layer = parseInt(tags.layer || '0', 10) || 0;
  const oneway = tags.oneway ? tags.oneway.trim() : null;
  const lanesParsed = tags.lanes ? parseInt(tags.lanes, 10) : NaN;
  const lanes = Number.isFinite(lanesParsed) && lanesParsed > 0 ? lanesParsed : null;
  const surface = tags.surface ? tags.surface.trim() : null;
  const maxspeed = tags.maxspeed ? tags.maxspeed.trim() : null;
  // Never infer responsible authority from highway class or name alone
  const operator = tags.operator && tags.operator.trim() ? tags.operator.trim() : null;

  if (!hw) {
    return {
      included: false,
      isMotorRoad: false,
      usageCategory: 'excluded',
      roadClass: 'none',
      accessRaw,
      accessStatus,
      serviceSubtype,
      isServiceRoad,
      hasOfficialName,
      officialName,
      displayFallback,
      displayName,
      officialRef,
      aliases,
      bridge,
      tunnel,
      layer,
      oneway,
      lanes,
      surface,
      maxspeed,
      operator,
      rejectionReason: 'missing_highway_tag',
    };
  }

  if (MOTOR_HIGHWAY_CLASSES.has(hw)) {
    const isRestrictedOrPrivate =
      accessStatus === 'private' ||
      (accessStatus === 'restricted' && accessRaw !== 'destination');
    const usageCategory: RoadUsageCategory = isRestrictedOrPrivate
      ? 'restricted_motor'
      : 'public_motor';

    return {
      included: true,
      isMotorRoad: true,
      usageCategory,
      roadClass: hw,
      accessRaw,
      accessStatus,
      serviceSubtype,
      isServiceRoad,
      hasOfficialName,
      officialName,
      displayFallback,
      displayName,
      officialRef,
      aliases,
      bridge,
      tunnel,
      layer,
      oneway,
      lanes,
      surface,
      maxspeed,
      operator,
    };
  }

  if (CONSTRUCTION_PROPOSED_CLASSES.has(hw)) {
    const include = Boolean(options.includeConstructionProposed);
    return {
      included: include,
      isMotorRoad: false,
      usageCategory: 'construction_proposed',
      roadClass: hw,
      accessRaw,
      accessStatus,
      serviceSubtype,
      isServiceRoad,
      hasOfficialName,
      officialName,
      displayFallback,
      displayName,
      officialRef,
      aliases,
      bridge,
      tunnel,
      layer,
      oneway,
      lanes,
      surface,
      maxspeed,
      operator,
      rejectionReason: include ? undefined : 'construction_or_proposed',
    };
  }

  if (NON_MOTOR_HIGHWAY_CLASSES.has(hw)) {
    const include = Boolean(options.includeNonMotor);
    return {
      included: include,
      isMotorRoad: false,
      usageCategory: 'non_motor',
      roadClass: hw,
      accessRaw,
      accessStatus,
      serviceSubtype,
      isServiceRoad,
      hasOfficialName,
      officialName,
      displayFallback,
      displayName,
      officialRef,
      aliases,
      bridge,
      tunnel,
      layer,
      oneway,
      lanes,
      surface,
      maxspeed,
      operator,
      rejectionReason: include ? undefined : 'non_motor_highway_class',
    };
  }

  return {
    included: false,
    isMotorRoad: false,
    usageCategory: 'excluded',
    roadClass: hw,
    accessRaw,
    accessStatus,
    serviceSubtype,
    isServiceRoad,
    hasOfficialName,
    officialName,
    displayFallback,
    displayName,
    officialRef,
    aliases,
    bridge,
    tunnel,
    layer,
    oneway,
    lanes,
    surface,
    maxspeed,
    operator,
    rejectionReason: `unsupported_highway_tag:${hw}`,
  };
}
