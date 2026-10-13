export class RequestError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function coordinates(
  lat: unknown,
  lon: unknown,
): { lat: number; lon: number } {
  if (
    typeof lat !== "number" ||
    typeof lon !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    throw new RequestError("Choose a valid location on the map.");
  }
  return { lat, lon };
}

export function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new RequestError("Invalid record identifier.");
  }
  return value;
}

export function text(
  value: unknown,
  label: string,
  min = 1,
  max = 3000,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.trim().length > max
  ) {
    throw new RequestError(`${label} must contain ${min}–${max} characters.`);
  }
  return value.trim();
}

export function sameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (
    (origin && origin !== new URL(req.url).origin) ||
    req.headers.get("sec-fetch-site") === "cross-site"
  ) {
    throw new RequestError("Please submit from this website.", 403);
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof RequestError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error(
    "Evidence request failed:",
    error instanceof Error ? error.name : "Unknown error",
  );
  return Response.json(
    { error: "This action could not be completed. Please try again." },
    { status: 500 },
  );
}
