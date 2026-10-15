export type MapBounds = [number, number, number, number];

export function parseMapBounds(value: string | null): MapBounds | null {
  if (!value) return null;
  const parts = value.split(",");
  if (parts.length !== 4 || parts.some(p => !p.trim())) return null;
  const b = parts.map(Number) as MapBounds;
  if (b.some(v => !Number.isFinite(v)) || b[0] < -180 || b[0] > 180 || b[2] < -180 || b[2] > 180 || b[1] < -90 || b[3] > 90 || b[1] >= b[3] || b[0] === b[2]) return null;
  return b;
}

export function normaliseMapBounds(west: number, south: number, east: number, north: number): MapBounds {
  const wrap = (n: number) => ((n + 180) % 360 + 360) % 360 - 180;
  return east - west >= 359.9
    ? [-180, Math.max(-90, south), 180, Math.min(90, north)]
    : [wrap(west), Math.max(-90, south), wrap(east), Math.min(90, north)];
}
