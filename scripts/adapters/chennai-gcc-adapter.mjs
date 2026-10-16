import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const CHENNAI_ARCGIS_BASE_URL =
  'https://gisgcc.chennaicorporation.gov.in/server/rest/services/GCCPublic/GCC_AdminBoundary/MapServer';

export const CHENNAI_LAYERS = {
  regions: {
    layerId: 6,
    name: 'Region Boundary',
    expectedCount: 3,
    fileName: 'regions.geojson',
  },
  zones: {
    layerId: 5,
    name: 'Zone Boundary',
    expectedCount: 15,
    fileName: 'zones.geojson',
  },
  wards: {
    layerId: 4,
    name: 'Ward Boundary',
    expectedCount: 200,
    fileName: 'wards.geojson',
  },
};

/**
 * Normalizes coordinates to EPSG:4326 [longitude, latitude] and rounds to 6 decimal places (~0.1m precision)
 */
function normalizeGeometry(geom) {
  if (!geom || !geom.coordinates) return geom;

  function roundCoords(coords) {
    if (typeof coords[0] === 'number') {
      const [lon, lat] = coords;
      return [
        Math.round(lon * 1e6) / 1e6,
        Math.round(lat * 1e6) / 1e6,
      ];
    }
    return coords.map(roundCoords);
  }

  return {
    ...geom,
    coordinates: roundCoords(geom.coordinates),
  };
}

/**
 * Normalizes properties for consistent schema across layers
 */
function normalizeProperties(layerKey, props) {
  const normalized = { ...props };

  if (layerKey === 'regions') {
    const regionName = props.region || props.Region || `Region ${props.objectid}`;
    normalized.name = regionName;
    normalized.region = regionName;
    normalized.jurisdiction_type = 'region';
    normalized.authority = 'Greater Chennai Corporation (GCC)';
  } else if (layerKey === 'zones') {
    const zoneNum = props.zone ? parseInt(props.zone, 10) : props.objectid;
    normalized.name = `Zone ${zoneNum}`;
    normalized.zone_number = zoneNum;
    normalized.zone = String(zoneNum).padStart(2, '0');
    normalized.jurisdiction_type = 'zone';
    normalized.authority = 'Greater Chennai Corporation (GCC)';
  } else if (layerKey === 'wards') {
    const wardNum = props.ward ? parseInt(props.ward, 10) : props.objectid;
    normalized.name = `Ward ${wardNum}`;
    normalized.ward_number = wardNum;
    normalized.ward = String(wardNum);
    normalized.jurisdiction_type = 'ward';
    normalized.authority = 'Greater Chennai Corporation (GCC)';
  }

  return normalized;
}

/**
 * Fetches a single layer from ArcGIS MapServer as GeoJSON with timeout & pagination support
 */
async function fetchLayerGeoJson(layerId, options = {}) {
  const timeoutMs = options.timeoutMs || 15000;
  const baseUrl = options.baseUrl || CHENNAI_ARCGIS_BASE_URL;

  const features = [];
  let resultOffset = 0;
  const resultRecordCount = 1000;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      where: '1=1',
      outFields: '*',
      f: 'geojson',
      outSR: '4326',
      resultOffset: String(resultOffset),
      resultRecordCount: String(resultRecordCount),
    });

    const url = `${baseUrl}/${layerId}/query?${params.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/geo+json, application/json' },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} from ${url}`);
      }

      const json = await response.json();
      clearTimeout(timer);

      if (json.error) {
        throw new Error(`ArcGIS Error: ${JSON.stringify(json.error)}`);
      }

      if (!json.features || !Array.isArray(json.features)) {
        throw new Error(`Invalid GeoJSON response from layer ${layerId}: missing features array`);
      }

      features.push(...json.features);

      if (json.exceededTransferLimit && json.features.length > 0) {
        resultOffset += json.features.length;
      } else {
        hasMore = false;
      }
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * Validates features against expected count and Chennai coordinate bounds
 */
export function validateFeatures(layerKey, features, expectedCount) {
  if (features.length !== expectedCount) {
    throw new Error(
      `Layer ${layerKey} count mismatch: expected ${expectedCount} features, received ${features.length}`
    );
  }

  // Chennai bounding box bounds: lon [80.0, 80.5], lat [12.7, 13.5]
  const CHENNAI_BBOX = {
    minLon: 80.0,
    maxLon: 80.5,
    minLat: 12.7,
    maxLat: 13.5,
  };

  function checkCoords(coords) {
    if (typeof coords[0] === 'number') {
      const [lon, lat] = coords;
      if (
        lon < CHENNAI_BBOX.minLon ||
        lon > CHENNAI_BBOX.maxLon ||
        lat < CHENNAI_BBOX.minLat ||
        lat > CHENNAI_BBOX.maxLat
      ) {
        throw new Error(`Coordinate [${lon}, ${lat}] is outside Chennai bounds`);
      }
    } else {
      for (const c of coords) checkCoords(c);
    }
  }

  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    if (!f.geometry || !['Polygon', 'MultiPolygon'].includes(f.geometry.type)) {
      throw new Error(`Feature ${i} in ${layerKey} lacks valid Polygon/MultiPolygon geometry`);
    }
    checkCoords(f.geometry.coordinates);
  }

  return true;
}

/**
 * Computes SHA-256 checksum for a string or buffer
 */
export function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Main ingestion entrypoint
 */
export async function ingestChennaiBoundaries(options = {}) {
  const outputDir = path.resolve(options.outputDir || 'output/jurisdictions/chennai');
  const dryRun = Boolean(options.dryRun);
  const allowOfflineFallback = options.allowOfflineFallback !== false;
  const timeoutMs = options.timeoutMs || 15000;
  const baseUrl = options.baseUrl || CHENNAI_ARCGIS_BASE_URL;

  console.log(`[chennai-adapter] Ingesting GCC admin boundaries... (dryRun: ${dryRun})`);
  fs.mkdirSync(outputDir, { recursive: true });

  const results = {};
  const checksums = {};
  const layersSummary = {};
  let usedCache = false;

  for (const [key, meta] of Object.entries(CHENNAI_LAYERS)) {
    const filePath = path.join(outputDir, meta.fileName);
    let featureCollection = null;

    // Try fetching live
    try {
      if (!dryRun) {
        console.log(`  Fetching Layer ${meta.layerId} (${meta.name})...`);
        const liveData = await fetchLayerGeoJson(meta.layerId, { baseUrl, timeoutMs });
        featureCollection = liveData;
      }
    } catch (networkErr) {
      console.warn(`  [WARN] Failed to fetch live Layer ${meta.layerId}: ${networkErr.message}`);
      if (!allowOfflineFallback) {
        throw networkErr;
      }
    }

    // Fallback to cached file if fetch failed or dry-run
    if (!featureCollection) {
      if (fs.existsSync(filePath)) {
        console.log(`  Using offline cache for ${key} from ${filePath}`);
        featureCollection = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        usedCache = true;
      } else {
        throw new Error(
          `Failed to retrieve ${key} boundaries and no cached file exists at ${filePath}`
        );
      }
    }

    // Normalize coordinates & properties
    featureCollection.features = featureCollection.features.map((feature) => ({
      type: 'Feature',
      geometry: normalizeGeometry(feature.geometry),
      properties: normalizeProperties(key, feature.properties || {}),
    }));

    // Validate feature count and geometry bounds
    validateFeatures(key, featureCollection.features, meta.expectedCount);

    const serialized = JSON.stringify(featureCollection, null, 2);
    const hash = sha256(serialized);

    checksums[key] = hash;
    results[key] = featureCollection;

    layersSummary[key] = {
      layerId: meta.layerId,
      layerName: meta.name,
      count: featureCollection.features.length,
      sha256: hash,
      fileName: meta.fileName,
      path: path.relative(process.cwd(), filePath).replace(/\\/g, '/'),
    };

    if (!dryRun) {
      fs.writeFileSync(filePath, serialized, 'utf8');
      console.log(`  ✓ Saved ${featureCollection.features.length} features to ${filePath} (${hash.slice(0, 12)}...)`);
    } else {
      console.log(`  [dry-run] Validated ${featureCollection.features.length} features for ${key}`);
    }
  }

  // Audit summary
  const audit = {
    sourceUrl: baseUrl,
    retrievedAt: new Date().toISOString(),
    usedCache,
    license: 'Government Open Data / Official GCC Public ArcGIS MapServer (Open for public civic use)',
    coverage: 'Greater Chennai Corporation (GCC) Admin Boundaries: 3 Regions, 15 Zones, 200 Wards',
    layers: layersSummary,
    totalFeatures: Object.values(layersSummary).reduce((acc, l) => acc + l.count, 0),
    crs: 'EPSG:4326',
    status: 'verified',
  };

  const auditPath = path.join(outputDir, 'audit.json');
  if (!dryRun) {
    fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2), 'utf8');
    console.log(`  ✓ Audit log written to ${auditPath}`);
  }

  return {
    success: true,
    dryRun,
    usedCache,
    outputDir,
    audit,
    checksums,
    results,
  };
}

// Direct CLI execution
if (process.argv[1]?.endsWith('chennai-gcc-adapter.mjs')) {
  const isDryRun = process.argv.includes('--dry-run');
  ingestChennaiBoundaries({ dryRun: isDryRun })
    .then((res) => {
      console.log(`[chennai-adapter] Ingestion completed successfully! Total features: ${res.audit.totalFeatures}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`[chennai-adapter] Error during ingestion:`, err);
      process.exit(1);
    });
}
